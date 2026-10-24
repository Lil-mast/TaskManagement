//! Identity introspection for the SPA.
//!
//! This route intentionally uses `Identity` (verified provider token only), not
//! `AuthUser`. That lets a signed-in but uninvited/unverified account learn why
//! it is blocked without every other route returning a generic 403.

use std::sync::Arc;

use axum::{extract::State, routing::get, Json, Router};
use serde_json::json;

use crate::core::auth::Identity;
use crate::AppState;

pub fn routes() -> Router<Arc<AppState>> {
    Router::new().route("/me", get(me))
}

async fn me(State(state): State<Arc<AppState>>, identity: Identity) -> Json<serde_json::Value> {
    let config = &state.config;
    let is_admin = config.identity_is_admin(
        &identity.id,
        identity.email.as_deref(),
        identity.email_verified,
    );
    let allowed = config.identity_is_allowed(
        &identity.id,
        identity.email.as_deref(),
        identity.email_verified,
    );
    let reason = config.identity_denial_reason(
        &identity.id,
        identity.email.as_deref(),
        identity.email_verified,
    );

    Json(json!({
        "user_id": identity.id,
        "email": identity.email,
        "name": identity.name,
        "email_verified": identity.email_verified,
        "is_admin": is_admin,
        "allowed": allowed,
        "reason": reason,
        "auth_mode": config.auth_mode(),
    }))
}
