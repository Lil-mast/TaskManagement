pub mod briefing;
pub mod capture;
pub mod health;
pub mod tasks;

/// All application routes, nested by feature.
///
/// `AuthUser` guards every mounted route except `/healthz`; the cron route is
/// guarded by its own shared secret.
pub fn router() -> axum::Router<std::sync::Arc<crate::AppState>> {
    axum::Router::new()
        .route("/healthz", axum::routing::get(health::health))
        .nest("/api/capture", capture::routes())
        .nest("/api/tasks", tasks::routes())
        .nest("/api/briefing", briefing::routes())
        .merge(crate::jobs::morning_brief::routes())
}
