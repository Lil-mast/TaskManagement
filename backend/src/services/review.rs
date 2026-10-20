//! Weekly Growth Review — the loop that makes the copilot converge on you.
//!
//! Analytics are pure SQL aggregation over the source-of-truth tables (never
//! N+1 loops), so re-running is definitionally idempotent; the stored review
//! row is an upsert on (user_id, week_start). The Claude verdict is optional —
//! analytics work headless, verdicts add the narrative.

use chrono::{Datelike, Duration, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::PgPool;

use super::anthropic::{tool_helpers::*, AnthropicClient, Message, Role};
use crate::core::error::{AppError, AppResult};

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct PriorityCount {
    pub priority: String,
    pub n: i64,
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct BookStats {
    pub book: String,
    pub accepted_total: i64,
    pub surfaced_this_week: i64,
    pub quarantined: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct InboxState {
    pub open_reply: i64,
    pub open_task: i64,
    pub acted_total: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct LeetCodeStats {
    pub attempts: i64,
    pub no_help_rate: f64,
    pub attempts_prev: i64,
    pub no_help_rate_prev: f64,
    pub patterns_due: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct TaskStats {
    pub completed: i64,
    pub completed_by_priority: Vec<PriorityCount>,
    pub completed_prev_week: i64,
    pub created: i64,
    pub carried_over: i64,
    pub overdue: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct WeeklyAnalytics {
    pub week_start: NaiveDate,
    pub week_end: NaiveDate,
    pub tasks: TaskStats,
    pub leetcode: LeetCodeStats,
    pub inbox: InboxState,
    pub principles: Vec<BookStats>,
}

/// Stored weekly review row (`weekly_reviews`).
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct StoredReview {
    pub user_id: String,
    pub week_start: NaiveDate,
    pub payload: serde_json::Value,
    pub model: String,
}

/// Monday of the week containing `d`.
pub fn week_start_of(d: NaiveDate) -> NaiveDate {
    d - Duration::days(d.weekday().num_days_from_monday() as i64)
}

async fn scalar(pool: &PgPool, sql: &str, user_id: &str, from: NaiveDate, to: NaiveDate) -> AppResult<i64> {
    sqlx::query_scalar(sql)
        .bind(user_id)
        .bind(&from)
        .bind(&to)
        .fetch_one(pool)
        .await
        .map_err(|e| AppError::Database(format!("review scaler: {e}")))
}

async fn scalar1(pool: &PgPool, sql: &str, user_id: &str, arg: NaiveDate) -> AppResult<i64> {
    sqlx::query_scalar(sql)
        .bind(user_id)
        .bind(&arg)
        .fetch_one(pool)
        .await
        .map_err(|e| AppError::Database(format!("review scaler: {e}")))
}

// ---------------------------------------------------------------------------
// Analytics (SQL aggregation only — the fast path)
// ---------------------------------------------------------------------------

pub async fn analytics(
    pool: &PgPool,
    user_id: &str,
    week_start: NaiveDate,
) -> AppResult<WeeklyAnalytics> {
    let week_end = week_start + Duration::days(7);
    let prev_start = week_start - Duration::days(7);

    let completed = scalar(
        pool,
        "SELECT COUNT(*) FROM tasks
         WHERE user_id = $1 AND status = 'done'
           AND completed_at >= $2 AND completed_at < $3",
        user_id,
        week_start,
        week_end,
    )
    .await?;
    let by_priority: Vec<PriorityCount> = sqlx::query_as(
        "SELECT priority, COUNT(*)::bigint AS n FROM tasks
         WHERE user_id = $1 AND status = 'done'
           AND completed_at >= $2 AND completed_at < $3
         GROUP BY priority",
    )
    .bind(user_id)
    .bind(week_start)
    .bind(week_end)
    .fetch_all(pool)
    .await
    .map_err(|e| AppError::Database(format!("review priorities: {e}")))?;
    let completed_prev = scalar(
        pool,
        "SELECT COUNT(*) FROM tasks
         WHERE user_id = $1 AND status = 'done'
           AND completed_at >= $2 AND completed_at < $3",
        user_id,
        prev_start,
        week_start,
    )
    .await?;
    let created = scalar(
        pool,
        "SELECT COUNT(*) FROM tasks
         WHERE user_id = $1 AND created_at >= $2 AND created_at < $3",
        user_id,
        week_start,
        week_end,
    )
    .await?;
    let carried_over = scalar1(
        pool,
        "SELECT COUNT(*) FROM tasks
         WHERE user_id = $1 AND status = 'open' AND created_at < $2",
        user_id,
        week_start,
    )
    .await?;
    let today = Utc::now().date_naive();
    let overdue = scalar1(
        pool,
        "SELECT COUNT(*) FROM tasks
         WHERE user_id = $1 AND status = 'open' AND due_date IS NOT NULL AND due_date < $2",
        user_id,
        today,
    )
    .await?;

    let attempts = scalar(
        pool,
        "SELECT COUNT(*) FROM leetcode_attempts
         WHERE user_id = $1 AND attempted_at >= $2 AND attempted_at < $3",
        user_id,
        week_start,
        week_end,
    )
    .await?;
    let no_help = scalar(
        pool,
        "SELECT COUNT(*) FROM leetcode_attempts
         WHERE user_id = $1 AND attempted_at >= $2 AND attempted_at < $3
           AND needed_help = false",
        user_id,
        week_start,
        week_end,
    )
    .await?;
    let attempts_prev = scalar(
        pool,
        "SELECT COUNT(*) FROM leetcode_attempts
         WHERE user_id = $1 AND attempted_at >= $2 AND attempted_at < $3",
        user_id,
        prev_start,
        week_start,
    )
    .await?;
    let no_help_prev = scalar(
        pool,
        "SELECT COUNT(*) FROM leetcode_attempts
         WHERE user_id = $1 AND attempted_at >= $2 AND attempted_at < $3
           AND needed_help = false",
        user_id,
        prev_start,
        week_start,
    )
    .await?;
    let patterns_due = scalar1(
        pool,
        "SELECT COUNT(*) FROM leetcode_patterns
         WHERE user_id = $1 AND next_review <= $2",
        user_id,
        today,
    )
    .await?;

    let open_reply = scalar1(
        pool,
        "SELECT COUNT(*) FROM email_triage
         WHERE user_id = $1 AND state = 'open' AND category = 'reply'",
        user_id,
        today,
    )
    .await?;
    let open_task = scalar1(
        pool,
        "SELECT COUNT(*) FROM email_triage
         WHERE user_id = $1 AND state = 'open' AND category = 'task'",
        user_id,
        today,
    )
    .await?;
    let acted = scalar1(
        pool,
        "SELECT COUNT(*) FROM email_triage
         WHERE user_id = $1 AND state != 'open'",
        user_id,
        today,
    )
    .await?;

    let principles: Vec<BookStats> = sqlx::query_as(
        "SELECT ki.book,
                COALESCE(SUM(ki.accepted_count), 0)::bigint AS accepted_total,
                COUNT(DISTINCT sl.id)::bigint AS surfaced_this_week,
                COALESCE(SUM(CASE WHEN ki.effective_weight <= 0.15 THEN 1 ELSE 0 END), 0)::bigint
                    AS quarantined
         FROM knowledge_items ki
         LEFT JOIN knowledge_surface_log sl
              ON sl.knowledge_item_id = ki.id AND sl.surfaced_at >= $2
         WHERE ki.user_id = $1
         GROUP BY ki.book
         ORDER BY accepted_total DESC, ki.book",
    )
    .bind(user_id)
    .bind(week_start)
    .fetch_all(pool)
    .await
    .map_err(|e| AppError::Database(format!("review principles: {e}")))?;

    Ok(WeeklyAnalytics {
        week_start,
        week_end: week_end - Duration::days(1),
        tasks: TaskStats {
            completed,
            completed_by_priority: by_priority,
            completed_prev_week: completed_prev,
            created,
            carried_over,
            overdue,
        },
        leetcode: LeetCodeStats {
            attempts,
            no_help_rate: rate(no_help, attempts),
            attempts_prev,
            no_help_rate_prev: rate(no_help_prev, attempts_prev),
            patterns_due,
        },
        inbox: InboxState { open_reply, open_task, acted_total: acted },
        principles,
    })
}

fn rate(num: i64, den: i64) -> f64 {
    if den <= 0 {
        0.0
    } else {
        num as f64 / den as f64
    }
}

// ---------------------------------------------------------------------------
// Claude verdict (optional; analytics stand alone)
// ---------------------------------------------------------------------------

const REVIEW_SYSTEM: &str = r#"You are the weekly coach of a developer's Growth Copilot.
You get the week's analytics as grounding JSON. Voice: precise, encouraging,
no filler, one actionable thread.

Rules:
1. headline: one sharp sentence (≤90 chars) characterizing the WEEK.
2. summary: ≤4 sentences. Trends of real numbers: completion delta vs last
   week, LeetCode no-help-rate trend, inbox backlog, principle engagement.
3. next_week_focus: 1–3 concrete strings (max 12 words each), tied ONLY to
   numbers that exist in the data.
4. Never invent numbers; quote what the JSON says.
5. Answer with exactly ONE `compose_weekly_review` tool call."#;

#[derive(Debug, Deserialize)]
struct VerdictArgs {
    headline: String,
    summary: String,
    #[serde(default)]
    next_week_focus: Vec<String>,
}

/// Compute analytics + verdict, persist (upsert — idempotent by week).
/// Returns the stored payload.
pub async fn run_weekly(
    pool: &PgPool,
    user_id: &str,
    anthropic: Option<&AnthropicClient>,
    week_start: NaiveDate,
) -> AppResult<StoredReview> {
    let data = analytics(pool, user_id, week_start).await?;

    let (verdict, model) = match anthropic {
        Some(a) => match compose_verdict(a, &data).await {
            Ok(v) => (
                json!({
                    "headline": v.headline,
                    "summary": v.summary,
                    "next_week_focus": v.next_week_focus,
                }),
                a.settings().model.clone(),
            ),
            Err(e) => {
                tracing::warn!(error = %e, "weekly verdict failed — storing headless review");
                (headless_payload(&data), String::new())
            }
        },
        None => (headless_payload(&data), String::new()),
    };

    let payload = json!({
        "analytics": serde_json::to_value(&data).unwrap_or_default(),
        "verdict": verdict,
    });

    let stored = sqlx::query_as::<_, StoredReview>(
        "INSERT INTO weekly_reviews (user_id, week_start, payload, model)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, week_start) DO UPDATE
         SET payload = EXCLUDED.payload, model = EXCLUDED.model, created_at = NOW()
         RETURNING user_id, week_start, payload, model",
    )
    .bind(user_id)
    .bind(&week_start)
    .bind(&payload)
    .bind(&model)
    .fetch_one(pool)
    .await
    .map_err(|e| AppError::Database(format!("weekly review persist: {e}")))?;
    Ok(stored)
}

fn headless_payload(data: &WeeklyAnalytics) -> serde_json::Value {
    json!({
        "headless": true,
        "summary": format!(
            "Completed {} tasks ({} created). Carried over: {}. Overdue: {}.",
            data.tasks.completed, data.tasks.created, data.tasks.carried_over, data.tasks.overdue
        ),
        "next_week_focus": [],
        "note": "set GROWTH_ANTHROPIC_API_KEY for the coached verdict",
    })
}

async fn compose_verdict(
    anthropic: &AnthropicClient,
    data: &WeeklyAnalytics,
) -> AppResult<VerdictArgs> {
    let schema = object_schema(
        json!({
            "headline":        { "type": "string", "maxLength": 90 },
            "summary":         { "type": "string", "maxLength": 800 },
            "next_week_focus": { "type": "array", "items": { "type": "string" } },
        }),
        &["headline", "summary", "next_week_focus"],
    );
    let resp = anthropic
        .chat(
            vec![Message {
                role: Role::User,
                content: format!(
                    "Week {} review.\nANALYTICS: {}",
                    data.week_start,
                    serde_json::to_string(data).unwrap_or_default()
                ),
            }],
            Some(REVIEW_SYSTEM.into()),
            vec![tool(
                "compose_weekly_review",
                "Compose the weekly review in one structured response.",
                schema,
            )],
        )
        .await?;
    let tu = resp
        .tool_uses
        .iter()
        .find(|t| t.name == "compose_weekly_review")
        .ok_or_else(|| AppError::Upstream("claude sent no compose_weekly_review call".into()))?;
    serde_json::from_value(tu.input.clone())
        .map_err(|e| AppError::Upstream(format!("compose_weekly_review invalid: {e}")))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn week_start_is_administrative_monday() {
        // Wed 2026-10-21 → Mon 2026-10-19; Sunday folds backwards
        assert_eq!(
            week_start_of(NaiveDate::from_ymd_opt(2026, 10, 21).unwrap()),
            NaiveDate::from_ymd_opt(2026, 10, 19).unwrap()
        );
        assert_eq!(
            week_start_of(NaiveDate::from_ymd_opt(2026, 10, 25).unwrap()), // Sunday
            NaiveDate::from_ymd_opt(2026, 10, 19).unwrap()
        );
        // a Monday is its own week start
        assert_eq!(
            week_start_of(NaiveDate::from_ymd_opt(2026, 10, 19).unwrap()),
            NaiveDate::from_ymd_opt(2026, 10, 19).unwrap()
        );
        // year boundary: Fri 2027-01-01 → Mon 2026-12-28
        assert_eq!(
            week_start_of(NaiveDate::from_ymd_opt(2027, 1, 1).unwrap()),
            NaiveDate::from_ymd_opt(2026, 12, 28).unwrap()
        );
    }

    #[test]
    fn rates_handle_zero_denominators() {
        assert_eq!(rate(0, 0), 0.0);
        assert_eq!(rate(3, 0), 0.0);
        assert_eq!(rate(1, 4), 0.25);
    }
}
