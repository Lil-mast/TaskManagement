//! LeetCode interview prep — pattern library + attempt logging with an SM-2
//! style spaced-repetition scheduler. Reviews surface as real tasks in the
//! Schedule priority (`source: leetcode`), so the matrix owns the calendar.

use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use sqlx::PgPool;

use crate::core::error::{AppError, AppResult};

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct LeetCodePattern {
    pub id: uuid::Uuid,
    pub user_id: String,
    pub name: String,
    pub notes: Option<String>,
    pub confidence: i32,
    pub next_review: Option<NaiveDate>,
    pub ease: f32,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct LeetCodeAttempt {
    pub id: uuid::Uuid,
    pub user_id: String,
    pub problem_url: String,
    pub problem_title: Option<String>,
    pub difficulty: Option<String>,
    pub pattern_id: Option<uuid::Uuid>,
    pub time_taken_min: Option<i32>,
    pub needed_help: Option<bool>,
    pub notes: Option<String>,
    pub attempted_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Deserialize)]
pub struct LogAttemptBody {
    pub problem_url: String,
    #[serde(default)]
    pub problem_title: Option<String>,
    #[serde(default)]
    pub difficulty: Option<String>,
    #[serde(default)]
    pub pattern_id: Option<uuid::Uuid>,
    #[serde(default)]
    pub time_taken_min: Option<i32>,
    #[serde(default)]
    pub needed_help: Option<bool>,
    #[serde(default)]
    pub notes: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct PatternUpsertBody {
    pub name: String,
    #[serde(default)]
    pub notes: Option<String>,
    #[serde(default)]
    pub confidence: Option<i32>,
}

/// Result of logging an attempt.
#[derive(Debug, Serialize)]
pub struct AttemptResult {
    pub attempt: LeetCodeAttempt,
    pub reschedule: Reschedule,
    /// review task that appeared in the Schedule priority (or NULL when none)
    pub review_task_id: Option<uuid::Uuid>,
    pub review_due: Option<NaiveDate>,
}

#[derive(Debug, Serialize, Clone)]
pub struct Reschedule {
    pub next_review: NaiveDate,
    pub interval_days: i32,
    pub ease: f32,
}

// ---------------------------------------------------------------------------
// SM-2 lite (pure — unit-testable)
// ---------------------------------------------------------------------------

/// One reschedule step given previous ease (default 2.5), interval (days),
/// "needed help" flag, and the pattern's self-rated confidence (1..5).
///
/// Rules (SM-2 flavored, documented in RAG/leetcode notes):
/// - needed help → interval resets to 1 day, ease decays by 0.2
/// - no help → interval grows by ×EASE, ease nudges upward on confidence ≥ 4
pub fn next_schedule(
    today: NaiveDate,
    prev_ease: f32,
    prev_interval_days: i32,
    needed_help: bool,
    self_confidence: i32,
) -> Reschedule {
    let mut ease = prev_ease.max(1.3).min(3.0);
    if needed_help {
        let decayed = (ease - 0.2).max(1.3);
        Reschedule {
            next_review: today + chrono::Duration::days(1),
            interval_days: 1,
            ease: decayed,
        }
    } else {
        if self_confidence >= 4 {
            ease = (ease + 0.1).min(3.0);
        }
        let interval = if prev_interval_days < 1 {
            3
        } else {
            let next = ((prev_interval_days as f32) * ease).round() as i32;
            next.max(prev_interval_days + 1)
        };
        Reschedule {
            next_review: today + chrono::Duration::days(interval as i64),
            interval_days: interval,
            ease,
        }
    }
}

// ---------------------------------------------------------------------------
// Service (DB layer)
// ---------------------------------------------------------------------------

pub async fn list_patterns(pool: &PgPool, user_id: &str) -> AppResult<Vec<LeetCodePattern>> {
    sqlx::query_as::<_, LeetCodePattern>(
        "SELECT id, user_id, name, notes, confidence, next_review, ease
         FROM leetcode_patterns WHERE user_id = $1 ORDER BY name",
    )
    .bind(user_id)
    .fetch_all(pool)
    .await
    .map_err(|e| AppError::Database(format!("list patterns: {e}")))
}

pub async fn upsert_pattern(
    pool: &PgPool,
    user_id: &str,
    body: PatternUpsertBody,
) -> AppResult<LeetCodePattern> {
    let name = body.name.trim();
    if name.is_empty() {
        return Err(AppError::BadRequest("pattern name required".into()));
    }
    if let Some(c) = body.confidence {
        if !(1..=5).contains(&c) {
            return Err(AppError::BadRequest("confidence must be 1..5".into()));
        }
    }
    sqlx::query_as::<_, LeetCodePattern>(
        "INSERT INTO leetcode_patterns (user_id, name, notes, confidence)
         VALUES ($1, $2, $3, COALESCE($4, 1))
         ON CONFLICT (user_id, name) DO UPDATE
         SET notes = COALESCE($3, leetcode_patterns.notes),
             confidence = COALESCE($4, leetcode_patterns.confidence)
         RETURNING id, user_id, name, notes, confidence, next_review, ease",
    )
    .bind(user_id)
    .bind(name)
    .bind(body.notes.as_deref())
    .bind(body.confidence)
    .fetch_one(pool)
    .await
    .map_err(|e| AppError::Database(format!("upsert pattern: {e}")))
}

pub async fn delete_pattern(pool: &PgPool, user_id: &str, id: uuid::Uuid) -> AppResult<bool> {
    let deleted = sqlx::query("DELETE FROM leetcode_patterns WHERE id = $1 AND user_id = $2")
        .bind(id)
        .bind(user_id)
        .execute(pool)
        .await
        .map_err(|e| AppError::Database(format!("delete pattern: {e}")))?;
    Ok(deleted.rows_affected() > 0)
}

pub async fn recent_attempts(
    pool: &PgPool,
    user_id: &str,
    limit: i32,
) -> AppResult<Vec<LeetCodeAttempt>> {
    sqlx::query_as::<_, LeetCodeAttempt>(
        "SELECT id, user_id, problem_url, problem_title, difficulty, pattern_id,
                time_taken_min, needed_help, notes, attempted_at
         FROM leetcode_attempts WHERE user_id = $1
         ORDER BY attempted_at DESC LIMIT $2",
    )
    .bind(user_id)
    .bind(limit.clamp(1, 100))
    .fetch_all(pool)
    .await
    .map_err(|e| AppError::Database(format!("recent attempts: {e}")))
}

/// The heart: log an attempt, reschedule the pattern, replace its open review
/// task in the matrix (upsert-by-meta keeps the Schedule priority tidy).
pub async fn log_attempt(
    pool: &PgPool,
    user_id: &str,
    body: LogAttemptBody,
) -> AppResult<AttemptResult> {
    let url = body.problem_url.trim();
    if url.is_empty() || !url.starts_with("http") {
        return Err(AppError::BadRequest("problem_url must be an http(s) URL".into()));
    }
    if let Some(d) = body.difficulty.as_deref() {
        if !["easy", "medium", "hard"].contains(&d) {
            return Err(AppError::BadRequest("difficulty must be easy|medium|hard".into()));
        }
    }

    // pattern context (if attached)
    let (prev_ease, prev_interval, self_confidence) = match body.pattern_id {
        Some(pid) => {
            let row: Option<(f32, i32, i32)> = sqlx::query_as(
                "SELECT ease, COALESCE(meta->>'interval_days', '0')::int,
                        COALESCE(confidence, 2)
                 FROM leetcode_patterns
                 WHERE id = $1 AND user_id = $2",
            )
            .bind(pid)
            .bind(user_id)
            .fetch_optional(pool)
            .await
            .map_err(|e| AppError::Database(format!("pattern lookup: {e}")))?;
            match row {
                Some((e, i, c)) => (e, i, c),
                None => return Err(AppError::BadRequest("pattern_id not found for user".into())),
            }
        }
        None => (2.5, 0, 2),
    };

    let today = chrono::Local::now().date_naive();
    let sched = next_schedule(
        today,
        prev_ease,
        prev_interval,
        body.needed_help.unwrap_or(false),
        self_confidence,
    );

    // insert attempt
    let attempt = sqlx::query_as::<_, LeetCodeAttempt>(
        "INSERT INTO leetcode_attempts
            (user_id, problem_url, problem_title, difficulty, pattern_id,
             time_taken_min, needed_help, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING id, user_id, problem_url, problem_title, difficulty, pattern_id,
                   time_taken_min, needed_help, notes, attempted_at",
    )
    .bind(user_id)
    .bind(url)
    .bind(body.problem_title.as_deref())
    .bind(body.difficulty.as_deref())
    .bind(body.pattern_id)
    .bind(body.time_taken_min)
    .bind(body.needed_help)
    .bind(body.notes.as_deref())
    .fetch_one(pool)
    .await
    .map_err(|e| AppError::Database(format!("attempt insert: {e}")))?;

    if let Some(pid) = body.pattern_id {
        sqlx::query(
            "UPDATE leetcode_patterns
             SET next_review = $1, ease = $2,
                 meta = COALESCE(meta, '{}'::jsonb)
                        || jsonb_build_object('interval_days', $3::int)
             WHERE id = $4 AND user_id = $5",
        )
        .bind(&sched.next_review)
        .bind(sched.ease)
        .bind(sched.interval_days)
        .bind(pid)
        .bind(user_id)
        .execute(pool)
        .await
        .map_err(|e| AppError::Database(format!("reschedule: {e}")))?;
    }

    // review task: reuse the existing open review row for this pattern, or insert
    let review_task_id: Option<uuid::Uuid> = match body.pattern_id {
        Some(pid) => {
            let pattern_name = sqlx::query_scalar::<_, String>(
                "SELECT name FROM leetcode_patterns WHERE id = $1",
            )
            .bind(pid)
            .fetch_optional(pool)
            .await
            .unwrap_or(None);

            match pattern_name {
                None => None,
                Some(pat) => {
                    let due = sched.next_review;
                    let title = format!("LeetCode review — {pat}");
                    let meta = serde_json::json!({ "leetcode_pattern_id": pid });

                    let existing: Option<uuid::Uuid> = sqlx::query_scalar(
                        "UPDATE tasks
                         SET title = $1, due_date = $2, status = 'open',
                             source = 'leetcode', meta = $3
                         WHERE user_id = $4 AND status = 'open'
                           AND meta->>'leetcode_pattern_id' = $5
                         RETURNING id",
                    )
                    .bind(&title)
                    .bind(&due)
                    .bind(&meta)
                    .bind(user_id)
                    .bind(pid.to_string())
                    .fetch_optional(pool)
                    .await
                    .unwrap_or(None);

                    if existing.is_some() {
                        existing
                    } else {
                        let new_id: uuid::Uuid = sqlx::query_scalar(
                            "INSERT INTO tasks (title, priority, user_id, due_date,
                                                source, meta)
                             VALUES ($1, 'schedule', $2, $3, 'leetcode', $4)
                             RETURNING id",
                        )
                        .bind(&title)
                        .bind(user_id)
                        .bind(&due)
                        .bind(&meta)
                        .fetch_one(pool)
                        .await
                        .map_err(|e| AppError::Database(format!("review task insert: {e}")))?;
                        Some(new_id)
                    }
                }
            }
        }
        None => None,
    };

    Ok(AttemptResult {
        attempt,
        reschedule: sched.clone(),
        review_task_id,
        review_due: Some(sched.next_review),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn today() -> NaiveDate {
        NaiveDate::from_ymd_opt(2026, 10, 18).unwrap()
    }

    #[test]
    fn needed_help_resets_interval_and_decays_ease() {
        let s = next_schedule(today(), 2.5, 7, true, 3);
        assert_eq!(s.next_review, today() + chrono::Duration::days(1));
        assert_eq!(s.interval_days, 1);
        assert!((s.ease - 2.3).abs() < 1e-6);
    }

    #[test]
    fn intervals_grow_by_ease() {
        // first success after a lapse: 1 → 3 (round(1 × 2.5))
        let s = next_schedule(today(), 2.5, 1, false, 3);
        assert_eq!(s.interval_days, 3);
        assert_eq!(s.next_review, today() + chrono::Duration::days(3));
        // then 3 × 2.5 = 7.5 → 8
        let s = next_schedule(today(), 2.5, 3, false, 3);
        assert_eq!(s.interval_days, 8);
    }

    #[test]
    fn high_confidence_bumps_ease_capped() {
        let s = next_schedule(today(), 2.95, 5, false, 5);
        assert!((s.ease - 3.0).abs() < 1e-6);
        // confidence never shrinks ease on a clean solve
        assert!(s.ease >= 2.95);
    }

    #[test]
    fn ease_never_decays_below_floor() {
        let mut s = next_schedule(today(), 1.0, 3, true, 1);
        for _ in 0..5 {
            s = next_schedule(today(), s.ease, 1, true, 1);
        }
        assert!((s.ease - 1.3).abs() < 1e-6);
        assert!(s.ease >= 1.3);
    }
}
