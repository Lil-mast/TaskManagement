//! Calendar routes — sync (network pull), cached events read, and the
//! time-aware plan (gaps + proposals, never auto-inserted).

use std::sync::Arc;

use axum::{
    extract::{Query, State},
    routing::{get, post},
    Json, Router,
};
use chrono::{Duration, Utc};
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::core::{
    auth::AuthUser,
    error::{AppError, AppResult},
};
use crate::services::{calendar::SYNC_HORIZON_DAYS, planner};
use crate::AppState;

pub fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/sync", post(sync))
        .route("/events", get(events))
        .route("/plan", get(plan))
}

fn require_calendar(state: &AppState) -> AppResult<&crate::services::calendar::CalendarService> {
    state.calendar.as_ref().ok_or_else(|| {
        AppError::Unavailable(
            "google integration not configured (set GROWTH_GOOGLE_CLIENT_ID/SECRET + GROWTH_TOKEN_ENC_KEY)"
                .into(),
        )
    })
}

fn require_db(state: &AppState) -> AppResult<&sqlx::PgPool> {
    state.db.as_ref().ok_or_else(|| {
        AppError::Unavailable("calendar requires a database (set GROWTH_DATABASE_URL)".into())
    })
}

/// `POST /api/calendar/sync` — pull the next-7-day window now.
async fn sync(
    State(state): State<Arc<AppState>>,
    auth: AuthUser,
) -> AppResult<Json<serde_json::Value>> {
    let svc = require_calendar(&state)?;
    let pool = require_db(&state)?;
    let stored = svc.sync(pool, &auth.0).await?;
    tracing::info!(user = ?auth.0, stored, "calendar sync done");
    Ok(Json(json!({ "synced_events": stored })))
}

#[derive(Debug, Deserialize)]
struct EventsQuery {
    days: Option<i64>,
    /// non-paged convenience flag: sync before reading
    fresh: Option<bool>,
}

#[derive(Debug, Serialize)]
pub struct CalendarEventOut {
    pub event_id: String,
    pub title: String,
    pub start_at: chrono::DateTime<Utc>,
    pub end_at: chrono::DateTime<Utc>,
    pub busy: bool,
}

/// `GET /api/calendar/events?days=7&fresh=1` — the mirrored window.
async fn events(
    State(state): State<Arc<AppState>>,
    auth: AuthUser,
    Query(q): Query<EventsQuery>,
) -> AppResult<Json<Vec<CalendarEventOut>>> {
    let pool = require_db(&state)?;
    if q.fresh.unwrap_or(false) {
        if let Ok(svc) = require_calendar(&state) {
            // sync is best-effort for reads — stale mirror beats a failure
            let _ = svc.sync(pool, &auth.0).await;
        }
    }
    let days = q.days.unwrap_or(SYNC_HORIZON_DAYS).clamp(1, 28);
    let now = Utc::now();
    let stored =
        crate::services::calendar::CalendarService::mirrored_events(pool, &auth.0, now, now + Duration::days(days))
            .await?;
    Ok(Json(stored.into_iter().map(CalendarEventOut::from).collect()))
}

impl From<crate::services::calendar::StoredEvent> for CalendarEventOut {
    fn from(e: crate::services::calendar::StoredEvent) -> Self {
        Self {
            event_id: e.event_id,
            title: e.title,
            start_at: e.start_at,
            end_at: e.end_at,
            busy: e.busy,
        }
    }
}

async fn plan(
    State(state): State<Arc<AppState>>,
    auth: AuthUser,
) -> AppResult<Json<serde_json::Value>> {
    let pool = require_db(&state)?;

    // refreshed mirror (sync may fail with a dead token → still serve gaps)
    if state.calendar.is_some() {
        if let Ok(svc) = require_calendar(&state) {
            let _ = svc.sync(pool, &auth.0).await;
        }
    }

    let now = Utc::now();
    let to = now + Duration::days(SYNC_HORIZON_DAYS);
    let mirrored =
        crate::services::calendar::CalendarService::mirrored_events(pool, &auth.0, now, to).await?;

    let events: Vec<planner::BusyBlock> = mirrored
        .iter()
        .map(|e| planner::BusyBlock {
            start: e.start_at,
            end: e.end_at,
            busy: e.busy,
        })
        .collect();
    let cfg = planner::PlanConfig::default();

    // unscheduled (no due_date) open Schedule-quadrant tasks, oldest first
    let tasks: Vec<(uuid::Uuid, String)> = sqlx::query_as(
        "SELECT id, title FROM tasks
         WHERE user_id = $1 AND status = 'open'
           AND quadrant = 'not_urgent_important' AND due_date IS NULL
         ORDER BY created_at ASC
         LIMIT 5",
    )
    .bind(&auth.0)
    .fetch_all(pool)
    .await
    .map_err(|e| AppError::Database(format!("plan tasks: {e}")))?;

    let gaps = planner::compute_gaps(&events, now, to, &cfg);
    let suggestions = planner::suggest_schedule(&gaps, &tasks);

    let meeting_minutes: i64 = mirrored
        .iter()
        .filter(|e| e.busy && e.start_at >= now)
        .map(|e| (e.end_at - e.start_at).num_minutes().max(0))
        .sum();

    Ok(Json(json!({
        "window": { "from": now, "to": to, "days": SYNC_HORIZON_DAYS },
        "meeting_minutes": meeting_minutes,
        "gaps": gaps,
        "suggestions": suggestions,
        "note": "proposals only — nothing is scheduled without your explicit accept"
    })))
}
