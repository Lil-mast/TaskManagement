use std::sync::Arc;

use axum::{extract::State, Json};
use serde::Serialize;

use crate::core::error::AppResult;
use crate::AppState;

#[derive(Debug, Serialize)]
pub struct Health {
    pub ok: bool,
    pub version: &'static str,
    pub database: &'static str,
    pub anthropic: &'static str,
    pub auth_mode: &'static str,
    pub llm_tokens_available: Option<f64>,
}

/// `GET /healthz` — unauthenticated; hosts, humans, and CI probe this.
pub async fn health(State(state): State<Arc<AppState>>) -> AppResult<Json<Health>> {
    let llm_tokens = match &state.anthropic {
        Some(client) if client.is_configured() => Some(client.tokens_available().await),
        _ => None,
    };

    let body = Health {
        ok: true,
        version: env!("CARGO_PKG_VERSION"),
        database: if state.db.is_some() {
            "configured"
        } else {
            "not-configured"
        },
        anthropic: match &state.anthropic {
            Some(c) if c.is_configured() => "configured",
            Some(_) => "unconfigured",
            None => "not-configured",
        },
        auth_mode: state.config.auth_mode(),
        llm_tokens_available: llm_tokens,
    };
    Ok(Json(body))
}
