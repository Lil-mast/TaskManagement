//! Briefing routes: GET (today's), POST refresh, POST accept.

use std::sync::Arc;

use axum::{
    extract::State,
    routing::{get, post},
    Json, Router,
};
use serde_json::json;

use crate::core::auth::AuthUser;
use crate::core::error::{AppError, AppResult};
use crate::services::briefing::{AcceptItem, StoredBrief};
use crate::AppState;

pub fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/", get(todays_brief))
        .route("/refresh", post(refresh_brief))
        .route("/accept", post(accept_item))
}

async fn todays_brief(
    State(state): State<Arc<AppState>>,
    auth: AuthUser,
) -> AppResult<Json<StoredBrief>> {
    let service = require_service(&state)?;
    let pool = state.db.as_ref().ok_or_else(|| {
        AppError::Unavailable("briefing requires a database (set GROWTH_DATABASE_URL)".into())
    })?;
    Ok(Json(service.ensure_today(pool, &auth.0, false).await?))
}

async fn refresh_brief(
    State(state): State<Arc<AppState>>,
    auth: AuthUser,
) -> AppResult<Json<serde_json::Value>> {
    let service = require_service(&state)?;
    let pool = state.db.as_ref().ok_or_else(|| {
        AppError::Unavailable("briefing requires a database (set GROWTH_DATABASE_URL)".into())
    })?;
    let brief = service.ensure_today(pool, &auth.0, true).await?;
    Ok(Json(json!({ "refreshed": true, "brief": brief.payload })))
}

async fn accept_item(
    State(state): State<Arc<AppState>>,
    auth: AuthUser,
    Json(item): Json<AcceptItem>,
) -> AppResult<Json<serde_json::Value>> {
    let service = require_service(&state)?;
    let pool = state.db.as_ref().ok_or_else(|| {
        AppError::Unavailable("accepting requires a database (set GROWTH_DATABASE_URL)".into())
    })?;
    let id = service.accept(pool, &auth.0, item).await?;
    Ok(Json(json!({ "accepted": id })))
}

fn require_service(state: &AppState) -> AppResult<&crate::services::briefing::BriefingService> {
    state.briefing.as_ref().ok_or_else(|| {
        AppError::Unavailable(
            "briefing not configured (needs GROWTH_ANTHROPIC_API_KEY + daily.dev token where used)"
                .into(),
        )
    })
}
