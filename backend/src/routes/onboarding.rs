//! User profile + onboarding — first-run flow for a second-user-friendly
//! deployment (PHASE_6 §2).
//!
//! - `GET /api/profile` / `PUT /api/profile` — name, target interview date,
//!   focus areas; feeds prompt assembly (briefing grounding §2).
//! - `GET /api/onboarding` — checklist state: tasks seeded? daily.dev cached?
//!   Google connected? knowledge ingested? Anthropic-backed features on?
//! - `POST /api/onboarding/seed` — one idempotent sample task per priority,
//!   tagged `meta:{"sample":true}`, only when the matrix is empty.

use std::sync::Arc;

use axum::{
    extract::State,
    routing::{get, post},
    Json, Router,
};
use chrono::NaiveDate;
use serde::{Deserialize, Serialize};

use crate::core::{
    auth::AuthUser,
    error::{AppError, AppResult},
};
use crate::AppState;

pub fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/profile", get(get_profile).put(put_profile))
        .route("/onboarding", get(onboarding_status))
        .route("/onboarding/seed", post(seed))
}

fn require_db(state: &AppState) -> AppResult<&sqlx::PgPool> {
    state.db.as_ref().ok_or_else(|| {
        AppError::Unavailable("profile requires a database (set GROWTH_DATABASE_URL)".into())
    })
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct Profile {
    pub user_id: String,
    pub name: Option<String>,
    pub target_interview_date: Option<NaiveDate>,
    pub focus_areas: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct ProfileBody {
    name: Option<String>,
    target_interview_date: Option<NaiveDate>,
    #[serde(default)]
    focus_areas: Vec<String>,
}

async fn get_profile(
    State(state): State<Arc<AppState>>,
    auth: AuthUser,
) -> AppResult<Json<Profile>> {
    let pool = require_db(&state)?;
    load_or_default(pool, &auth.id)
        .await
        .map(|p| Json(p))
}

async fn put_profile(
    State(state): State<Arc<AppState>>,
    auth: AuthUser,
    Json(body): Json<ProfileBody>,
) -> AppResult<Json<Profile>> {
    let pool = require_db(&state)?;
    let name = body.name.map(|n| n.trim().to_string()).filter(|n| !n.is_empty());
    let focus_areas: Vec<String> = body
        .focus_areas
        .into_iter()
        .map(|a| a.trim().to_string())
        .filter(|a| !a.is_empty())
        .take(8)
        .collect();

    let profile = sqlx::query_as::<_, Profile>(
        "INSERT INTO user_profiles (user_id, name, target_interview_date, focus_areas)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id) DO UPDATE
         SET name = EXCLUDED.name,
             target_interview_date = EXCLUDED.target_interview_date,
             focus_areas = EXCLUDED.focus_areas,
             updated_at = NOW()
         RETURNING user_id, name, target_interview_date, focus_areas",
    )
    .bind(&auth.id)
    .bind(&name)
    .bind(&body.target_interview_date)
    .bind(&focus_areas)
    .fetch_one(pool)
    .await
    .map_err(|e| AppError::Database(format!("profile upsert: {e}")))?;
    Ok(Json(profile))
}

pub async fn load_or_default(pool: &sqlx::PgPool, user_id: &str) -> AppResult<Profile> {
    sqlx::query_as::<_, Profile>(
        "SELECT user_id, name, target_interview_date, focus_areas
         FROM user_profiles WHERE user_id = $1",
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| AppError::Database(format!("profile read: {e}")))
    .map(|found| {
        found.unwrap_or(Profile {
            user_id: user_id.to_string(),
            name: None,
            target_interview_date: None,
            focus_areas: vec![],
        })
    })
}

// ---------------------------------------------------------------------------
// Onboarding
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize)]
struct OnboardingStatus {
    seeded_tasks: bool,
    daily_dev_connected: bool,
    google_connected: bool,
    knowledge_ingested: bool,
    llm_ready: bool,
    next_steps: Vec<String>,
}

async fn onboarding_status(
    State(state): State<Arc<AppState>>,
    auth: AuthUser,
) -> AppResult<Json<OnboardingStatus>> {
    let pool = require_db(&state)?;

    let tasks_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM tasks WHERE user_id = $1",
    )
    .bind(&auth.id)
    .fetch_one(pool)
    .await
    .map_err(|e| AppError::Database(format!("onboarding tasks: {e}")))?;

    let integration_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM integrations
         WHERE user_id = $1 AND access_token_enc IS NOT NULL",
    )
    .bind(&auth.id)
    .fetch_one(pool)
    .await
    .map_err(|e| AppError::Database(format!("onboarding integrations: {e}")))?;

    let code_counts: (i64, i64) = sqlx::query_as::<_, (i64, i64)>(
        "SELECT
            (SELECT COUNT(*) FROM knowledge_items WHERE user_id = $1),
            (SELECT COUNT(*) FROM dailydev_cache WHERE user_id = $1)",
    )
    .bind(&auth.id)
    .fetch_one(pool)
    .await
    .map_err(|e| AppError::Database(format!("onboarding counts: {e}")))?;

    let llm_ready = state.anthropic.is_some();

    let status = OnboardingStatus {
        seeded_tasks: tasks_count > 0,
        daily_dev_connected: code_counts.1 > 0,
        google_connected: integration_count > 0,
        knowledge_ingested: code_counts.0 > 0,
        llm_ready,
        next_steps: {
            let mut v = Vec::new();
            if tasks_count == 0 {
                v.push("POST /api/onboarding/seed — fill the four priorities with sample tasks".into());
            }
            if code_counts.1 == 0 {
                v.push("POST /api/integrations/dailydev/feeds — cache the first read".into());
            }
            if integration_count == 0 && state.config.google_configured() {
                v.push("GET /api/integrations/google/url — connect Google Calendar".into());
            }
            if code_counts.0 == 0 {
                v.push("POST /api/knowledge/ingest — load your books corpus".into());
            }
            if !llm_ready {
                v.push("set GROWTH_ANTHROPIC_API_KEY — briefs, capture and triage need it".into());
            }
            v
        },
    };
    Ok(Json(status))
}

/// Four sample tasks (one per priority), only when the user has none.
/// Idempotent by design: refuses to run over a seeded matrix, so re-firing is
/// a no-op rather than a duplicate generator.
#[derive(Debug, Serialize)]
struct SeedResult {
    inserted: usize,
    matrix_was_empty: bool,
}

const SAMPLES: [(&str, &str, &str); 4] = [
    (
        "now",
        "Finish the quarterly deliverable draft",
        "Crises & deadlines — life in Priority 1",
    ),
    (
        "schedule",
        "Book 3 practice interviews with a peer",
        "Growth & principles — Priority 2, the winning priority",
    ),
    (
        "delegate",
        "Reply to meeting-reschedule thread",
        "Interruptions — delegate or quash",
    ),
    (
        "drop",
        "Scroll past the third weather meme",
        "Trivial — the matrix exists to name these",
    ),
];

async fn seed(
    State(state): State<Arc<AppState>>,
    auth: AuthUser,
) -> AppResult<Json<SeedResult>> {
    let pool = require_db(&state)?;
    let existing: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM tasks WHERE user_id = $1")
        .bind(&auth.id)
        .fetch_one(pool)
        .await
        .map_err(|e| AppError::Database(format!("seed check: {e}")))?;

    if existing > 0 {
        return Ok(Json(SeedResult { inserted: 0, matrix_was_empty: false }));
    }

    let mut inserted = 0;
    for (priority, title, description) in SAMPLES {
        let res = sqlx::query(
            "INSERT INTO tasks (user_id, title, description, priority, source, meta, tags)
             VALUES ($1, $2, $3, $4, 'user', '{\"sample\": true}', '{\"onboarding\"}')",
        )
        .bind(&auth.id)
        .bind(title)
        .bind(description)
        .bind(priority)
        .execute(pool)
        .await
        .map_err(|e| AppError::Database(format!("seed insert: {e}")))?;
        inserted += res.rows_affected() as usize;
    }
    Ok(Json(SeedResult { inserted, matrix_was_empty: true }))
}
