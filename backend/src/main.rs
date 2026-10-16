//! Thin runner: load config, assemble state + router from the library, serve.

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "growth_copilot=info,tower_http=info".into()),
        )
        .init();

    let config = growth_copilot::core::config::Config::load_from_env()?;
    let state = growth_copilot::build_state(config).await?;

    let addr = std::net::SocketAddr::from(([0, 0, 0, 0], state.config.port));
    tracing::info!(%addr, snapshot = %state.health_snapshot(), "listening");

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, growth_copilot::build_app(state)).await?;
    Ok(())
}
