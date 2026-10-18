//! Gmail triage — read-only (metadata + snippet, never bodies), classified by
//! ONE rate-limited Claude tool call, persisted idempotently on
//! `gmail_msg_id`, and acted upon only by a human (mark done / convert to a
//! real matrix task). See PHASE_4.md.

use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::PgPool;

use super::anthropic::{tool_helpers::*, AnthropicClient, Message, Role};
use super::crypto::TokenCrypto;
use super::google::GoogleClient;
use crate::core::error::{AppError, AppResult};

pub const PROVIDER: &str = "gmail";
/// ~15 unread messages per run (PHASE_4 scope §2).
const MAX_UNREAD: usize = 15;
/// Snippets share 90-ish chars of the opening, not the body.
const SNIPPET_CHARS: usize = 140;

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct TriageRow {
    pub gmail_msg_id: String,
    pub user_id: String,
    pub category: String,
    pub summary: Option<String>,
    pub subject: Option<String>,
    pub state: String,
    pub suggested_task_id: Option<uuid::Uuid>,
    pub triaged_at: chrono::DateTime<chrono::Utc>,
}

// ---------------------------------------------------------------------------
// Gmail wire shapes (metadata format — headers + snippet only)
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
struct MessageListResponse {
    #[serde(default)]
    messages: Vec<MessagesIdOnly>,
}

#[derive(Debug, Deserialize)]
struct MessagesIdOnly {
    id: String,
}

#[derive(Debug, Deserialize)]
struct MessageMetaResponse {
    id: String,
    #[serde(default)]
    snippet: Option<String>,
    payload: MessagePayload,
}

#[derive(Debug, Deserialize)]
struct MessagePayload {
    #[serde(default)]
    headers: Vec<MessageHeader>,
}

#[derive(Debug, Deserialize)]
struct MessageHeader {
    name: String,
    #[serde(default)]
    value: Option<String>,
}

/// Normalized message for the classify prompt.
#[derive(Debug, Clone, Serialize)]
pub struct GmailMessage {
    pub id: String,
    pub from: String,
    pub subject: String,
    pub snippet: String,
}

#[derive(Clone)]
pub struct EmailService {
    google: GoogleClient, // built with the gmail scope
    crypto: TokenCrypto,
    http: reqwest::Client,
}

impl EmailService {
    pub fn new(google_with_gmail_scope: GoogleClient, crypto: TokenCrypto) -> Self {
        Self {
            google: google_with_gmail_scope,
            crypto,
            http: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(30))
                .build()
                .expect("reqwest trivially valid"),
        }
    }

    pub fn is_configured(&self) -> bool {
        self.google.is_configured()
    }

    pub fn consent_url(&self, user_id: &str) -> String {
        self.google.consent_url(&self.crypto, PROVIDER, user_id)
    }

    pub async fn exchange_code(
        &self,
        code: &str,
        state_user_id: &str,
        pool: &PgPool,
    ) -> AppResult<()> {
        self.google
            .exchange_code(
                code,
                &self.crypto,
                PROVIDER,
                vec![super::google::GMAIL_SCOPE.into()],
                state_user_id,
                pool,
            )
            .await
    }

    /// Validate signed state, delegating to the shared verifier.
    pub fn verify_state(&self, state: &str) -> Option<(String, String)> {
        self.crypto.verify_state(state)
    }

    /// Disconnect: revoke at Google (best-effort), then drop the token row.
    /// Triage rows stay (they are the user's decisions, not Google data).
    pub async fn disconnect(&self, pool: &PgPool, user_id: &str) -> AppResult<bool> {
        let enc: Option<Vec<u8>> = sqlx::query_scalar(
            "SELECT access_token_enc FROM integrations
             WHERE user_id = $1 AND provider = $2",
        )
        .bind(user_id)
        .bind(PROVIDER)
        .fetch_optional(pool)
        .await
        .map_err(|e| AppError::Database(format!("token read: {e}")))?;
        if let Some(enc) = enc {
            if let Ok(token) = self.crypto.decrypt_for_user(user_id, &enc) {
                self.google.revoke(&token).await;
            }
        }
        let deleted = sqlx::query(
            "DELETE FROM integrations WHERE user_id = $1 AND provider = $2",
        )
        .bind(user_id)
        .bind(PROVIDER)
        .execute(pool)
        .await
        .map_err(|e| AppError::Database(format!("token delete: {e}")))?;
        Ok(deleted.rows_affected() > 0)
    }

    // -----------------------------------------------------------------------
    // Triage pipeline
    // -----------------------------------------------------------------------

    /// Fetch unread → filter already-triaged → ONE classify call → upsert.
    /// Returns the triage rows now on file for this user (open ones).
    pub async fn triage(
        &self,
        pool: &PgPool,
        user_id: &str,
        anthropic: &AnthropicClient,
        triage_rules: &[String],
    ) -> AppResult<Vec<TriageRow>> {
        let token = self
            .google
            .get_valid_token(pool, &self.crypto, user_id, PROVIDER)
            .await?;

        let unread = self.fetch_unread(&token).await?;
        if unread.is_empty() {
            return Ok(Self::list(pool, user_id, "open").await?);
        }

        // idempotency: skip ids already triaged, then mark remaining open rows
        let ids: Vec<String> = unread.iter().map(|m| m.id.clone()).collect();
        let already: Vec<String> = sqlx::query_scalar(
            "SELECT gmail_msg_id FROM email_triage WHERE gmail_msg_id = ANY($1)",
        )
        .bind(&ids)
        .fetch_all(pool)
        .await
        .map_err(|e| AppError::Database(format!("triage dedup read: {e}")))?;
        let already: std::collections::HashSet<String> = already.into_iter().collect();
        let fresh: Vec<GmailMessage> = unread
            .into_iter()
            .filter(|m| !already.contains(&m.id))
            .collect();

        if !fresh.is_empty() {
            let rows = self
                .classify_via_claude(anthropic, &fresh, triage_rules)
                .await?;
            self.upsert_rows(pool, user_id, &rows).await?;
        }

        Self::list(pool, user_id, "open").await
    }

    /// Gmail v1: unread ids, then metadata per id (sequential — 15 max).
    /// Public for contract tests; daily use goes through `triage`.
    pub async fn fetch_unread(&self, token: &str) -> AppResult<Vec<GmailMessage>> {
        let url = url::Url::parse_with_params(
            &format!("{}/users/me/messages", self.google.gmail_base()),
            &[
                ("q", "is:unread label:inbox".into()),
                ("maxResults", MAX_UNREAD.to_string()),
            ],
        )
        .map_err(|e| AppError::Internal(anyhow::anyhow!("gmail url: {e}")))?;

        let list: MessageListResponse = self.http.get(url.as_str()).bearer_auth(token).send()
            .await
            .map_err(|e| AppError::Upstream(format!("gmail fetch: {e}")))?
            .error_for_status()
            .map_err(|e| AppError::Upstream(format!("gmail fetch rejected: {e}")))?
            .json()
            .await
            .map_err(|e| AppError::Upstream(format!("gmail body invalid: {e}")))?;

        let mut out = Vec::with_capacity(list.messages.len());
        for msg in &list.messages {
            let meta_url = format!(
                "{}/users/me/messages/{}\
                 ?format=metadata&metadataHeaders=Subject&metadataHeaders=From",
                self.google.gmail_base(),
                msg.id
            );
            let meta: MessageMetaResponse = self
                .http
                .get(&meta_url)
                .bearer_auth(token)
                .send()
                .await
                .map_err(|e| AppError::Upstream(format!("gmail fetch: {e}")))?
                .error_for_status()
                .map_err(|e| AppError::Upstream(format!("gmail fetch rejected: {e}")))?
                .json()
                .await
                .map_err(|e| AppError::Upstream(format!("gmail body invalid: {e}")))?;
            let header = |name: &str| {
                meta.payload
                    .headers
                    .iter()
                    .find(|h| h.name.eq_ignore_ascii_case(name))
                    .and_then(|h| h.value.clone())
                    .unwrap_or_default()
            };
            out.push(GmailMessage {
                id: meta.id,
                from: header("From"),
                subject: header("Subject"),
                snippet: meta
                    .snippet
                    .unwrap_or_default()
                    .chars()
                    .take(SNIPPET_CHARS)
                    .collect(),
            });
        }
        Ok(out)
    }

    async fn classify_via_claude(
        &self,
        anthropic: &AnthropicClient,
        messages: &[GmailMessage],
        rules: &[String],
    ) -> AppResult<Vec<Classification>> {
        let tool = self.classify_tool();
        let mut user_content = format!(
            "Classify these {} unread emails. Emails:\n{}\n",
            messages.len(),
            serde_json::to_string(messages).unwrap_or_default()
        );
        if !rules.is_empty() {
            user_content.push_str("\nPersonal triage rules (override defaults where they apply):\n");
            for r in rules {
                user_content.push_str("- ");
                user_content.push_str(r);
                user_content.push('\n');
            }
        } else {
            user_content.push_str("\nNo personal rules on file — use the defaults.");
        }

        let resp = anthropic
            .chat(vec![Message { role: Role::User, content: user_content }],
                  Some(TRIAGE_SYSTEM.into()),
                  vec![tool])
            .await?;

        let tu = resp
            .tool_uses
            .iter()
            .find(|t| t.name == "classify_emails")
            .ok_or_else(|| AppError::Upstream("claude sent no classify_emails call".into()))?;
        let parsed: ClassificationsArgs = serde_json::from_value(tu.input.clone())
            .map_err(|e| AppError::Upstream(format!("classify_emails invalid: {e}")))?;
        Ok(parsed.classifications)
    }

    fn classify_tool(&self) -> super::anthropic::ToolDefinition {
        let schema = object_schema(
            json!({
                "classifications": { "type": "array", "items": {
                    "type": "object",
                    "properties": {
                        "gmail_msg_id": { "type": "string" },
                        "category": { "type": "string", "enum": [
                            "reply", "fyi", "task", "ignore"] },
                        "summary": { "type": "string", "maxLength": 140 },
                        "task_title": { "type": "string", "maxLength": 120 },
                        "task_quadrant": { "type": "string", "enum": [
                            "urgent_important", "urgent_not_important",
                            "not_urgent_important", "not_urgent_not_important"] }
                    },
                    "required": ["gmail_msg_id", "category", "summary"]
                }}
            }),
            &["classifications"],
        );
        tool(
            "classify_emails",
            "Classify a batch of unread emails into reply/fyi/task/ignore with one-line summaries.",
            schema,
        )
    }

    async fn upsert_rows(
        &self,
        pool: &PgPool,
        user_id: &str,
        rows: &[Classification],
    ) -> AppResult<usize> {
        let mut stored = 0;
        for row in rows {
            if row.gmail_msg_id.trim().is_empty()
                || !["reply", "fyi", "task", "ignore"].contains(&row.category.as_str())
                || row.summary.trim().is_empty()
            {
                continue;
            }
            sqlx::query(
                "INSERT INTO email_triage
                    (gmail_msg_id, user_id, category, summary, state)
                 VALUES ($1, $2, $3, $4, 'open')
                 ON CONFLICT (gmail_msg_id) DO NOTHING",
            )
            .bind(row.gmail_msg_id.trim())
            .bind(user_id)
            .bind(&row.category)
            .bind(Some(row.summary.as_str().trim()).filter(|s| !s.is_empty()))
            .execute(pool)
            .await
            .map_err(|e| AppError::Database(format!("triage upsert: {e}")))?;
            stored += 1;
        }
        Ok(stored)
    }

    /// Open (or state-filtered) triage rows, newest first.
    pub async fn list(pool: &PgPool, user_id: &str, state: &str) -> AppResult<Vec<TriageRow>> {
        sqlx::query_as::<_, TriageRow>(
            "SELECT gmail_msg_id, user_id, category, summary, subject, state,
                    suggested_task_id, triaged_at
             FROM email_triage
             WHERE user_id = $1 AND state = $2
             ORDER BY triaged_at DESC
             LIMIT 100",
        )
        .bind(user_id)
        .bind(state)
        .fetch_all(pool)
        .await
        .map_err(|e| AppError::Database(format!("triage list: {e}")))
    }

    /// Human action: `done` (nothing to do) or `task` (convert to the matrix).
    pub async fn act(
        &self,
        pool: &PgPool,
        user_id: &str,
        msg_id: &str,
        action: &str,
        task_title: Option<String>,
    ) -> AppResult<serde_json::Value> {
        let row: Option<TriageRow> = sqlx::query_as::<_, TriageRow>(
            "SELECT gmail_msg_id, user_id, category, summary, subject, state,
                    suggested_task_id, triaged_at
             FROM email_triage WHERE gmail_msg_id = $1 AND user_id = $2",
        )
        .bind(msg_id)
        .bind(user_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| AppError::Database(format!("triage read: {e}")))?;
        if row.is_none() {
            return Err(AppError::BadRequest("triage row not found for user".into()));
        }

        match action {
            "done" => {
                sqlx::query("UPDATE email_triage SET state = 'done' WHERE gmail_msg_id = $1")
                    .bind(msg_id)
                    .execute(pool)
                    .await
                    .map_err(|e| AppError::Database(format!("triage done: {e}")))?;
                Ok(serde_json::json!({ "msg_id": msg_id, "state": "done" }))
            }
            "task" => {
                let title = task_title
                    .as_deref()
                    .map(str::trim)
                    .filter(|t| !t.is_empty())
                    .map(str::to_string)
                    .or_else(|| row.as_ref().and_then(|r| r.summary.clone()));
                let title = title.ok_or_else(|| {
                    AppError::BadRequest("task conversion needs a title (row empty)".into())
                })?;
                let description = row
                    .as_ref()
                    .and_then(|r| r.summary.clone())
                    .unwrap_or_default();
                let meta =
                    serde_json::json!({ "gmail_msg_id": msg_id, "accepted_from": "email_triage" });
                let task_id: uuid::Uuid = sqlx::query_scalar(
                    "INSERT INTO tasks (title, description, quadrant, user_id,
                                        source, meta)
                     VALUES ($1, $2, $3, $4, 'gmail', $5) RETURNING id",
                )
                .bind(&title)
                .bind(&description)
                .bind("urgent_important") // email tasks default to "now" — user can drag
                .bind(user_id)
                .bind(&meta)
                .fetch_one(pool)
                .await
                .map_err(|e| AppError::Database(format!("triage task insert: {e}")))?;
                sqlx::query(
                    "UPDATE email_triage SET state = 'task_created',
                            suggested_task_id = $1 WHERE gmail_msg_id = $2",
                )
                .bind(&task_id)
                .bind(msg_id)
                .execute(pool)
                .await
                .map_err(|e| AppError::Database(format!("triage update: {e}")))?;
                Ok(serde_json::json!({ "msg_id": msg_id, "state": "task_created", "task_id": task_id }))
            }
            other => Err(AppError::BadRequest(format!(
                "unknown action {other:?} (use \"done\" or \"task\")"
            ))),
        }
    }
}

// prompt + DTOs -------------------------------------------------------------

const TRIAGE_SYSTEM: &str = r#"You are the inbox triage engine of a developer's Growth Copilot.
Classify each unread email into exactly one category:
- reply: the human should write a response soon
- fyi: worth a skim, no action
- task: something actionable that belongs in the Eisenhower matrix
- ignore: noise (marketing, automated notices)

Rules:
1. One entry per email, keyed by `gmail_msg_id`. Never invent ids.
2. `summary`: one line (≤140 chars), concrete, what it asks/wants.
3. For `task` emails: also give `task_title` (verb-first, ≤120 chars)
   and optionally `task_quadrant` (default urgent_important for real deadlines,
   not_urgent_important for non-urgent follow-ups).
4. Honesty over completeness: if unsure, use `fyi`, not `task`.
5. Answer with exactly ONE `classify_emails` tool call."#;

#[derive(Debug, Deserialize)]
struct ClassificationsArgs {
    classifications: Vec<Classification>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct Classification {
    pub gmail_msg_id: String,
    pub category: String,
    pub summary: String,
    #[serde(default)]
    pub task_title: Option<String>,
    #[serde(default)]
    pub task_quadrant: Option<String>,
}
