pub mod briefing;
pub mod calendar;
pub mod capture;
pub mod email;
pub mod health;
pub mod integrations;
pub mod knowledge;
pub mod leetcode;
pub mod tasks;

/// All application routes, nested by feature.
///
/// `AuthUser` guards every mounted route except `/healthz` and the OAuth
/// callback (which is validated by the signed `state` param instead); the
/// cron route is guarded by its own shared secret.
pub fn router() -> axum::Router<std::sync::Arc<crate::AppState>> {
    axum::Router::new()
        .route("/healthz", axum::routing::get(health::health))
        .nest("/api/capture", capture::routes())
        .nest("/api/tasks", tasks::routes())
        .nest("/api/briefing", briefing::routes())
        .nest("/api/leetcode", leetcode::routes())
        .nest("/api/knowledge", knowledge::routes())
        .nest("/api/integrations", integrations::routes())
        .nest("/api/calendar", calendar::routes())
        .nest("/api/email", email::routes())
        .merge(crate::jobs::morning_brief::routes())
}
