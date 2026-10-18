pub mod core;
pub mod jobs;
pub mod routes;
pub mod services;

use std::sync::Arc;

use axum::http::HeaderValue;
use axum::Router;
use core::config::Config;
use services::anthropic::{AnthropicClient, AnthropicSettings, DEFAULT_BASE_URL};
use services::briefing::BriefingService;
use services::capture::CaptureService;
use services::dailydev::DailyDevClient;
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;

/// Shared application state — Arc'd and attached to the router + extractors.
pub struct AppState {
    pub config: Config,
    pub db: Option<sqlx::PgPool>,
    /// set only when the Anthropic key is present
    pub anthropic: Option<AnthropicClient>,
    /// set only when Anthropic is configured (capture + briefing depend on it)
    pub capture: Option<CaptureService>,
    pub dailydev: Option<DailyDevClient>,
    pub briefing: Option<BriefingService>,
}

impl AppState {
    pub fn health_snapshot(&self) -> String {
        format!(
            "db={} anthropic={} dailydev={} auth={}",
            self.db.is_some(),
            self.anthropic.is_some(),
            self.dailydev.as_ref().map(|d| d.is_configured()).unwrap_or(false),
            if self.config.firebase_configured() { "firebase" } else { "dev" }
        )
    }
}

/// Build the shared state from config (DB pool + clients as available).
pub async fn build_state(config: Config) -> anyhow::Result<Arc<AppState>> {
    // database (optional — captures/briefs persist when present)
    let db = match config.database_url.as_deref() {
        Some(url) if !url.is_empty() => {
            tracing::info!("connecting to Postgres…");
            Some(
                sqlx::postgres::PgPoolOptions::new()
                    .max_connections(8)
                    .acquire_timeout(std::time::Duration::from_secs(10))
                    .connect(url)
                    .await
                    .map_err(|e| anyhow::anyhow!("database connect failed: {e}"))?,
            )
        }
        _ => {
            tracing::warn!("no GROWTH_DATABASE_URL — DB-backed paths disabled");
            None
        }
    };

    // anthropic (optional until the key shows up in env)
    let anthropic = config
        .anthropic_api_key
        .as_ref()
        .filter(|k| !k.is_empty())
        .map(|key| {
            let settings = AnthropicSettings {
                api_key: key.clone(),
                model: config
                    .anthropic_model
                    .clone()
                    .unwrap_or_else(|| "claude-sonnet-4-20250514".into()),
                max_tokens: config.anthropic_max_tokens,
                max_input_chars: config.anthropic_max_input_chars,
                requests_per_minute: config.rate_limit_rpm,
                max_concurrency: config.rate_limit_concurrency,
                max_retries: config.max_retries,
                base_url: DEFAULT_BASE_URL.into(),
            };
            tracing::info!(
                model = %settings.model,
                rpm = settings.requests_per_minute,
                concurrency = settings.max_concurrency,
                retries = settings.max_retries,
                "Anthropic enabled with rate limiting"
            );
            AnthropicClient::new(settings)
        });

    let capture = anthropic.clone().map(CaptureService::new);

    let dailydev = Some(DailyDevClient::new(config.daily_dev_token.clone()));

    let briefing = match (&anthropic, &dailydev) {
        (Some(a), Some(d)) if a.is_configured() && d.is_configured() => {
            Some(BriefingService::new(a.clone(), d.clone()))
        }
        _ => {
            tracing::info!(
                "briefing disabled (needs GROWTH_ANTHROPIC_API_KEY + GROWTH_DAILY_DEV_TOKEN)"
            );
            None
        }
    };

    Ok(Arc::new(AppState {
        config: config.clone(),
        db,
        anthropic,
        capture,
        dailydev,
        briefing,
    }))
}

/// Wire the full router: health + capture + tasks + briefing + cron.
/// The returned router carries no state (`Router<()>`) — ready to `serve`.
pub fn build_app(state: Arc<AppState>) -> Router<()> {
    let mut cors = CorsLayer::new();
    for origin in &state.config.cors_origins {
        if let Ok(parsed) = origin.parse::<HeaderValue>() {
            cors = cors.allow_origin(parsed);
        } else {
            tracing::warn!(origin, "cors origin unparseable — skipped");
        }
    }

    routes::router()
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}
