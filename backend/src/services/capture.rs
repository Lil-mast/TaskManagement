//! Natural-language capture: user text → Claude tool use → structured tasks.
//!
//! Phase 1 will add Supabase persistence behind the same service; Phase 0
//! returns the structured proposals (with optional DB insert when a pool is
//! wired) so the integration end-to-end is verifiable.

use serde::{Deserialize, Serialize};
use serde_json::json;

use super::anthropic::{AnthropicClient, Message, Role, tool_helpers::*};
use crate::core::error::{AppError, AppResult};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProposedTask {
    pub title: String,
    #[serde(default)]
    pub description: Option<String>,
    pub quadrant: Quadrant,
    #[serde(default)]
    pub due_date: Option<chrono::NaiveDate>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub confidence: Option<Confidence>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum Quadrant {
    UrgentImportant,
    UrgentNotImportant,
    NotUrgentImportant,
    NotUrgentNotImportant,
}

impl Quadrant {
    pub fn as_db_string(&self) -> &'static str {
        match self {
            Quadrant::UrgentImportant => "urgent_important",
            Quadrant::UrgentNotImportant => "urgent_not_important",
            Quadrant::NotUrgentImportant => "not_urgent_important",
            Quadrant::NotUrgentNotImportant => "not_urgent_not_important",
        }
    }

    pub fn from_db_string(s: &str) -> Option<Self> {
        Some(match s {
            "urgent_important" => Quadrant::UrgentImportant,
            "urgent_not_important" => Quadrant::UrgentNotImportant,
            "not_urgent_important" => Quadrant::NotUrgentImportant,
            "not_urgent_not_important" => Quadrant::NotUrgentNotImportant,
            _ => return None,
        })
    }
}

#[derive(Debug, Serialize, Deserialize, Clone, Copy)]
#[serde(rename_all = "lowercase")]
pub enum Confidence {
    High,
    Medium,
    Low,
}

const CAPTURE_SYSTEM: &str = r#"You are the capture & triage engine for an Eisenhower Matrix task app.
Break the user's input into discrete tasks and place each in a quadrant.

Rules:
1. One tool call per task — never merge two tasks into one.
2. Quadrants describe two axes: urgent (needs action soon) and important (deep impact).
   `urgent_important` = do now · `urgent_not_important` = delegate ·
   `not_urgent_important` = schedule · `not_urgent_not_important` = consider dropping.
3. Extract concrete dates when mentioned ("tomorrow", "Monday", "before Friday")
   as ISO YYYY-MM-DD using the provided current date; omit `due_date` otherwise.
4. Titles start with a verb, short and concrete. Descriptions ≤ 1 sentence.
5. Set `confidence`: high if the classification is obvious, medium with mixed
   criteria, low on ambiguity.
6. Tags are lowercase keywords (e.g. "interview", "errand") — max 3.
7. Never invent tasks the user did not mention."#;

pub struct CaptureService {
    anthropic: AnthropicClient,
}

/// Structured args from the `create_task` tool schema (what Claude sends back).
#[derive(Debug, Deserialize)]
struct CreateTaskArgs {
    title: String,
    #[serde(default)]
    description: Option<String>,
    quadrant: String,
    #[serde(default)]
    due_date: Option<String>,
    #[serde(default)]
    tags: Option<Vec<String>>,
    #[serde(default)]
    confidence: Option<String>,
}

impl CaptureService {
    pub fn new(anthropic: AnthropicClient) -> Self {
        Self { anthropic }
    }

    pub fn is_ready(&self) -> bool {
        self.anthropic.is_configured()
    }

    fn build_tool(&self) -> super::anthropic::ToolDefinition {
        let schema = object_schema(
            json!({
                "title":          { "type": "string", "maxLength": 120 },
                "description":    { "type": "string" },
                "quadrant":       { "type": "string", "enum": [
                    "urgent_important", "urgent_not_important",
                    "not_urgent_important", "not_urgent_not_important"] },
                "due_date":       { "type": "string", "format": "date" },
                "tags":           { "type": "array", "items": { "type": "string" } },
                "confidence":     { "type": "string", "enum": ["high", "medium", "low"] }
            }),
            &["title", "quadrant"],
        );
        tool(
            "create_task",
            "Create exactly one task in the user's Eisenhower matrix.",
            schema,
        )
    }

    /// Run one capture; returns discrete structured tasks for the matrix.
    /// `principles` — retrieved book lines (R2); empty when RAG is not wired.
    pub async fn capture(&self, text: &str, principles: &[String]) -> AppResult<Vec<ProposedTask>> {
        let text = text.trim();
        if text.is_empty() {
            return Err(AppError::BadRequest("capture text is empty".into()));
        }
        if text.len() > 4_000 {
            return Err(AppError::BadRequest(
                "capture text too long (max 4000 chars)".into(),
            ));
        }

        let today = chrono::Utc::now().date_naive().to_string();
        let mut system = format!("{CAPTURE_SYSTEM}\n\nCurrent date: {today}");
        if !principles.is_empty() {
            system.push_str("\n\n## Principles to consider (from the user's book library)\n");
            system.push_str(
                "Weave them in where genuinely relevant — do not force-fit or invent mentions:\n",
            );
            for p in principles {
                system.push_str("- ");
                system.push_str(p);
                system.push('\n');
            }
        }
        let message = Message {
            role: Role::User,
            content: text.to_string(),
        };

        let resp = self
            .anthropic
            .chat(vec![message], Some(system), vec![self.build_tool()])
            .await?;

        if resp.tool_uses.is_empty() {
            return Err(AppError::Upstream(
                "claude returned no tasks (no tool calls); rephrase your capture".into(),
            ));
        }

        let mut tasks = Vec::with_capacity(resp.tool_uses.len());
        for tu in resp.tool_uses {
            if tu.name != "create_task" {
                tracing::warn!(tool = %tu.name, "unexpected tool call ignored");
                continue;
            }
            let args: CreateTaskArgs = serde_json::from_value(tu.input).map_err(|e| {
                AppError::Upstream(format!("claude tool args invalid: {e}"))
            })?;
            let quadrant = Quadrant::from_db_string(&args.quadrant).ok_or_else(|| {
                AppError::Upstream(format!("unknown quadrant: {}", args.quadrant))
            })?;
            let due_date = match args.due_date.as_deref() {
                Some(d) => Some(
                    chrono::NaiveDate::parse_from_str(d, "%Y-%m-%d").map_err(|e| {
                        AppError::Upstream(format!("claude sent a bad date {d:?}: {e}"))
                    })?,
                ),
                None => None,
            };
            tasks.push(ProposedTask {
                title: args.title,
                description: args.description,
                quadrant,
                due_date,
                tags: args.tags.unwrap_or_default(),
                confidence: args.confidence.as_deref().and_then(|c| match c {
                    "high" => Some(Confidence::High),
                    "medium" => Some(Confidence::Medium),
                    "low" => Some(Confidence::Low),
                    _ => None,
                }),
            });
        }

        Ok(tasks)
    }
}
