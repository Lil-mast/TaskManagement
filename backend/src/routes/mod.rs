pub mod capture;
pub mod health;

/// All application routes, nested by feature.
///
/// `AuthUser` guards every mounted route except `/healthz`.
pub fn router() -> axum::Router<std::sync::Arc<crate::AppState>> {
    axum::Router::new()
        .route("/healthz", axum::routing::get(health::health))
        .nest("/api/capture", capture::routes())
}
