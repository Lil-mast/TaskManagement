//! Morning briefing: one composed Claude call over tasks + daily.dev (+ stub
//! calendar until Phase 3) → a structured brief stored in `daily_briefings`.
//!
//! Grounding data always enters via compact JSON; the model must answer through
//! the `compose_brief` tool so the output is validated, never parsed prose.



use chrono::{Local, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use serde_json::json;

use super::anthropic::{tool_helpers::*, AnthropicClient, Message, Role};
use super::dailydev::DailyDevClient;
use super::rag::{KnowledgeHit, RagService};
use sqlx::PgPool;

use crate::core::error::{AppError, AppResult};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BriefPriority {
    pub task_id: uuid::Uuid,
    pub title: String,
    /// one-line *why* — never a vibe, always the reason
    pub why: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BriefWatchItem {
    pub title: String,
    pub permalink: String,
    /// editor's verdict: worth your time, and why
    pub verdict: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BriefLeetCode {
    pub pattern: Option<String>,
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BriefPayload {
    pub headline: String,
    pub priorities: Vec<BriefPriority>,
    pub watchlist: Vec<BriefWatchItem>,
    pub leetcode: BriefLeetCode,
    pub principles_used: Vec<String>,
    /// progress on briefing quality is not the issue on empty contexts
    pub compose_log: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct StoredBrief {
    pub id: uuid::Uuid,
    pub user_id: String,
    pub brief_date: NaiveDate,
    /// JSONB straight through — the UI consumes the raw brief payload shape
    pub payload: serde_json::Value,
    pub model: String,
    pub created_at: chrono::DateTime<Utc>,
}

pub struct BriefingService {
    anthropic: AnthropicClient,
    dailydev: DailyDevClient,
    /// R1: book principles retrieved for today's tasks (None → skip silently)
    rag: Option<RagService>,
}

const BRIEF_SYSTEM: &str = r#"You are the daily editor of a developer's personal Growth Copilot.
Compose ONE tight morning brief from the grounding JSON. Voice: precise,
encouraging, zero fluff, no motivational filler.

Rules:
1. prio the `priorities` list in the order the user should actually do them,
   considering deadlines, overdue, and meeting-load; write the `why` per item.
2. `watchlist`: pick 3–5 daily.dev posts relevant to the user's current tasks,
   stack, and learning goals. For each: verdict = is it worth their time
   (concrete reason or "skip-worthy" arrows).
3. `leetcode`: pick the pattern to drill today from the LEETCODE_DUE list
   (weakest confidence + most overdue first). Empty list → drill: null.
4. `priorities` must fit around the CALENDAR blocks: a packed-meeting day
   means fewer, sharper priorities; open a cleared afternoon means deep work.
5. `principles_used`: the `[source_ref]`s of PRINCIPLES that genuinely shaped
   your advice. Only what you used — do not pad the list, and never invent
   sources.
6. Never invent tasks, posts, patterns, or events — the grounding is
   authoritative. INBOX_PULSE numbers are fact: if reply/task counts are
   non-zero the headline may call them out, using the same numbers exactly,
   but never as a `priorities` entry (only tasks may appear there).
7. headline: one sharp sentence (max 90 chars) characterizing the day.
8. Answer with exactly ONE `compose_brief` tool call."#;

/// Compact, bounded view of open tasks sent as grounding.
#[derive(Debug, Serialize, sqlx::FromRow)]
struct TaskGround {
    id: uuid::Uuid,
    title: String,
    priority: String,
    due_date: Option<NaiveDate>,
}

fn ground_tasks(tasks: &[TaskGround]) -> String {
    serde_json::to_string(&tasks).unwrap_or_else(|_| "[]".into())
}

/// Patterns due for review today (the brief picks the drill from this list).
#[derive(Debug, Serialize, sqlx::FromRow)]
struct LeetCodeDue {
    pattern: String,
    confidence: i32,
    next_review: NaiveDate,
    notes: Option<String>,
}

async fn ground_leetcode_due(
    pool: &PgPool,
    user_id: &str,
    today: NaiveDate,
) -> AppResult<Vec<LeetCodeDue>> {
    let rows: Vec<LeetCodeDue> = sqlx::query_as(
        "SELECT name, COALESCE(confidence, 1) AS confidence,
                next_review, notes
         FROM leetcode_patterns
         WHERE user_id = $1 AND next_review <= $2
         ORDER BY next_review, confidence
         LIMIT 5",
    )
    .bind(user_id)
    .bind(&today)
    .fetch_all(pool)
    .await
    .map_err(|e| AppError::Database(format!("leetcode due lookup: {e}")))?;
    Ok(rows)
}

/// Next-7-day meeting load from the mirrored calendar (synced separately).
/// Empty when not connected — grounding never invents events.
#[derive(Debug, Serialize, sqlx::FromRow)]
struct CalendarGround {
    title: String,
    start_at: chrono::DateTime<Utc>,
    end_at: chrono::DateTime<Utc>,
}

/// Inbox pulse from `email_triage` — counts + heads-up subjects for reply/task
/// only (the human decides; the brief must never misstate the numbers).
#[derive(Debug, Serialize, sqlx::FromRow)]
struct InboxPulse {
    category: String,
    open_count: i64,
    top_subjects: Option<String>,
}

async fn ground_inbox_pulse(pool: &PgPool, user_id: &str) -> AppResult<Vec<InboxPulse>> {
    let rows: Vec<InboxPulse> = sqlx::query_as(
        "SELECT category, COUNT(*)::bigint AS open_count,
                (SELECT string_agg(COALESCE(subject, summary, ''), ' | ')
                 FROM (SELECT subject, summary
                       FROM email_triage t2
                       WHERE t2.user_id = $1 AND t2.category = t1.category
                             AND t2.state = 'open'
                       ORDER BY t2.triaged_at DESC LIMIT 3) top3) AS top_subjects
         FROM email_triage t1
         WHERE user_id = $1 AND state = 'open'
         GROUP BY category
         ORDER BY category",
    )
    .bind(user_id)
    .fetch_all(pool)
    .await
    .map_err(|e| AppError::Database(format!("inbox pulse: {e}")))?;
    Ok(rows)
}

/// Onboarding profile — shapes tone + immediacy of every composed brief.
/// Absent profile → `{}` (system prompt handles the neutral case).
async fn ground_profile(pool: &PgPool, user_id: &str) -> AppResult<serde_json::Value> {
    #[derive(sqlx::FromRow)]
    struct Row {
        name: Option<String>,
        target_interview_date: Option<chrono::NaiveDate>,
        focus_areas: Vec<String>,
    }
    let row = sqlx::query_as::<_, Row>(
        "SELECT name, target_interview_date, focus_areas
         FROM user_profiles WHERE user_id = $1",
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| AppError::Database(format!("profile grounding: {e}")))?;
    Ok(match row {
        None => serde_json::json!({}),
        Some(r) => serde_json::json!({
            "name": r.name,
            "target_interview_date": r.target_interview_date,
            "focus_areas": r.focus_areas,
        }),
    })
}

async fn ground_calendar(pool: &PgPool, user_id: &str) -> AppResult<Vec<CalendarGround>> {
    let rows: Vec<CalendarGround> = sqlx::query_as(
        "SELECT COALESCE(NULLIF(title, ''), '(busy)') AS title, start_at, end_at
         FROM calendar_events
         WHERE user_id = $1 AND busy AND start_at >= NOW()
         ORDER BY start_at
         LIMIT 30",
    )
    .bind(user_id)
    .fetch_all(pool)
    .await
    .map_err(|e| AppError::Database(format!("calendar grounding: {e}")))?;
    Ok(rows)
}

/// R1: retrieve top principles for today's task mix. Any failure → empty.
async fn retrieve_principles(
    pool: &PgPool,
    user_id: &str,
    service: &BriefingService,
    tasks: &[TaskGround],
) -> Vec<KnowledgeHit> {
    let Some(rag) = service.rag.as_ref() else {
        return Vec::new();
    };
    if !rag.is_ready() || tasks.is_empty() {
        return Vec::new();
    }
    // query = the day's task titles (compact — retrieval only needs gist)
    let query = tasks
        .iter()
        .take(5)
        .map(|t| t.title.as_str())
        .collect::<Vec<_>>()
        .join("; ");
    match rag.retrieve(pool, user_id, &query, 3, "brief").await {
        Ok(hits) => hits,
        Err(e) => {
            tracing::warn!(error = %e, "principle retrieval failed — brief proceeds without RAG");
            Vec::new()
        }
    }
}

impl BriefingService {
    pub fn new(anthropic: AnthropicClient, dailydev: DailyDevClient) -> Self {
        Self { anthropic, dailydev, rag: None }
    }

    /// Wire the principles engine (R1). Optional — briefing works without it.
    pub fn with_rag(mut self, rag: RagService) -> Self {
        self.rag = Some(rag);
        self
    }

    pub fn is_ready(&self) -> bool {
        self.anthropic.is_configured() && self.dailydev.is_configured()
    }

    fn build_tool(&self) -> super::anthropic::ToolDefinition {
        let schema = object_schema(
            json!({
                "headline":       { "type": "string", "maxLength": 90 },
                "priorities":     { "type": "array", "items": {
                    "type": "object",
                    "properties": {
                        "task_id": { "type": "string", "format": "uuid" },
                        "title":   { "type": "string" },
                        "why":     { "type": "string" }
                    },
                    "required": ["task_id", "title", "why"]
                }},
                "watchlist":      { "type": "array", "items": {
                    "type": "object",
                    "properties": {
                        "title":     { "type": "string" },
                        "permalink": { "type": "string" },
                        "verdict":   { "type": "string" }
                    },
                    "required": ["title", "permalink", "verdict"]
                }},
                "leetcode":       { "type": "object", "properties": {
                    "pattern": { "type": "string" },
                    "note":    { "type": "string" }
                }},
                "principles_used": { "type": "array", "items": { "type": "string" } },
                "compose_log":     { "type": "string" }
            }),
            &["headline", "priorities", "watchlist", "leetcode", "principles_used"],
        );
        tool(
            "compose_brief",
            "Compose the entire morning brief in one structured response.",
            schema,
        )
    }

    /// Compose-or-reuse today's brief; single DB row per user/day.
    pub async fn ensure_today(
        &self,
        pool: &PgPool,
        user_id: &str,
        force: bool,
    ) -> AppResult<StoredBrief> {
        let today = Local::now().date_naive();
        if !force {
            if let Some(existing) = sqlx::query_as::<_, StoredBrief>(
                "SELECT id, user_id, brief_date, payload, model, created_at
                 FROM daily_briefings WHERE user_id = $1 AND brief_date = $2",
            )
            .bind(user_id)
            .bind(&today)
            .fetch_optional(pool)
            .await
            .map_err(|e| AppError::Database(format!("briefing read: {e}")))?
            {
                return Ok(existing);
            }
        }
        self.compose(pool, user_id, today).await
    }

    async fn compose(&self, pool: &PgPool, user_id: &str, date: NaiveDate) -> AppResult<StoredBrief> {
        // 1. grounding: open tasks (max 50) — due-today / overdue first
        let tasks = sqlx::query_as::<_, TaskGround>(
            "SELECT id, title, priority, due_date FROM tasks
             WHERE user_id = $1 AND status = 'open'
             ORDER BY due_date NULLS LAST, created_at DESC
             LIMIT 50",
        )
        .bind(user_id)
        .fetch_all(pool)
        .await
        .map_err(|e| AppError::Database(format!("briefing tasks: {e}")))?;

        if tasks.is_empty() {
            return Err(AppError::Unavailable(
                "briefing needs at least 1 open task".into(),
            ));
        }

        // 2. grounding: daily.dev (cached; force=false reuses the 24h TTL)
        let feeds = match self.dailydev.is_configured() {
            true => self
                .dailydev
                .get_feeds_with_cache(pool, user_id, false)
                .await
                .unwrap_or_else(|e| {
                    tracing::error!(error = %e, "daily.dev feeds fell off during compose");
                    super::dailydev::DailyDevFeeds {
                        for_you: vec![],
                        discussed: vec![],
                        fetched_at: None,
                        from_cache: false,
                    }
                }),
            false => super::dailydev::DailyDevFeeds {
                for_you: vec![],
                discussed: vec![],
                fetched_at: None,
                from_cache: false,
            },
        };

        let ground_plus_watch = format!(
            "PROFILE (let this shape tone and emphasis; never invent profile facts): {}\n\nTASKS: {}\n\nFEED: {}\n\nLEETCODE_DUE: {}\n\nCALENDAR (next 7 days, meeting load the priorities must account for): {}\n\nINBOX_PULSE (email_triage state — reply count must match this): {}",
            serde_json::to_string(&ground_profile(pool, user_id).await.unwrap_or_default())
                .unwrap_or_default(),
            ground_tasks(&tasks),
            serde_json::to_string(&serde_json::json!({
                "foryou": feeds.for_you.iter().take(8).collect::<Vec<_>>(),
                "discussed": feeds.discussed.iter().take(6).collect::<Vec<_>>(),
                "fetched_at": feeds.fetched_at
            }))
            .unwrap_or_default(),
            serde_json::to_string(&ground_leetcode_due(pool, user_id, date).await.unwrap_or_default())
                .unwrap_or_default(),
            serde_json::to_string(&ground_calendar(pool, user_id).await.unwrap_or_default())
                .unwrap_or_default(),
            serde_json::to_string(&ground_inbox_pulse(pool, user_id).await.unwrap_or_default())
                .unwrap_or_default()
        );

        // principles (R1): retrieved for today's tasks; empty when not wired.
        let principles = retrieve_principles(pool, user_id, self, &tasks).await;
        let principles_block = if principles.is_empty() {
            String::new()
        } else {
            format!(
                "\n\nPRINCIPLES (from the user's books — weave in where the `why` genuinely calls for one):\n{}",
                principles
                    .iter()
                    .map(|h| format!("- {} [{}]", h.content, h.source_ref))
                    .collect::<Vec<_>>()
                    .join("\n")
            )
        };

        // 3. ONE composed call — fuel for the whole day
        let resp = self
            .anthropic
            .chat(
                vec![Message {
                    role: Role::User,
                    content: format!(
                        "Compose today's ({date}) alerting brief.\n{ground_plus_watch}{principles_block}"
                    ),
                }],
                Some(BRIEF_SYSTEM.to_string()),
                vec![self.build_tool()],
            )
            .await?;

        let tool_use = resp
            .tool_uses
            .iter()
            .find(|t| t.name == "compose_brief")
            .ok_or_else(|| AppError::Upstream("claude sent no compose_brief tool call".into()))?;

        let payload: BriefPayload = serde_json::from_value(tool_use.input.clone())
            .map_err(|e| AppError::Upstream(format!("compose_brief invalid: {e}")))?;

        // 4. persist (upsert — refresh replaces today's row)
        let stored = sqlx::query_as::<_, StoredBrief>(
            "INSERT INTO daily_briefings (user_id, brief_date, payload, model)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (user_id, brief_date) DO UPDATE
             SET payload = EXCLUDED.payload, model = EXCLUDED.model, created_at = NOW()
             RETURNING id, user_id, brief_date, payload, model, created_at",
        )
        .bind(user_id)
        .bind(&date)
        .bind(serde_json::to_value(&payload).unwrap_or_default())
        .bind(&self.anthropic.settings().model)
        .fetch_one(pool)
        .await
        .map_err(|e| AppError::Database(format!("briefing write: {e}")))?;
        Ok(stored)
    }

    /// Brief proposal → real task (accept-to-matrix; one click).
    pub async fn accept(
        &self,
        _pool: &PgPool,
        user_id: &str,
        item: AcceptItem,
    ) -> AppResult<uuid::Uuid> {
        if item.title.trim().is_empty() {
            return Err(AppError::BadRequest("title is required".into()));
        }
        let source = item.source.unwrap_or_else(|| "ai_briefing".to_string());
        let meta = serde_json::json!({ "accepted_from": "brief" });
        let id: uuid::Uuid = sqlx::query_scalar(
            "INSERT INTO tasks (title, description, priority, user_id, due_date, source, meta)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id",
        )
        .bind(item.title.trim())
        .bind(item.description.as_deref().or(Some("")))
        .bind(item.priority.as_deref().unwrap_or("now"))
        .bind(user_id)
        .bind(item.due_date)
        .bind(source)
        .bind(meta)
        .fetch_one(_pool)
        .await
        .map_err(|e| AppError::Database(format!("accept item: {e}")))?;
        Ok(id)
    }
}

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct AcceptItem {
    pub title: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub priority: Option<String>,
    #[serde(default)]
    pub due_date: Option<NaiveDate>,
    #[serde(default)]
    pub source: Option<String>,
}
