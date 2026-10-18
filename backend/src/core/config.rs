use std::env;

use figment::{providers::Env, Figment};
use serde::Deserialize;

/// Everything the app needs, sourced from the environment (prefixed `GROWTH_`).
/// boot gracefully in partial setups — `/healthz` reflects what's wired.
#[derive(Debug, Clone, Deserialize)]
pub struct Config {
    pub port: u16,
    #[serde(
        default = "default_cors_origins",
        deserialize_with = "cors_list::deserialize"
    )] // debug: allow comma-separated string or TOML-style list
    pub cors_origins: Vec<String>,
    #[serde(default)]
    pub database_url: Option<String>,
    #[serde(default)]
    pub anthropic_api_key: Option<String>,
    #[serde(default)]
    pub anthropic_model: Option<String>,
    #[serde(default = "default_max_tokens")]
    pub anthropic_max_tokens: u32,
    #[serde(default = "default_max_input_chars")]
    pub anthropic_max_input_chars: usize,
    #[serde(default = "default_rpm")]
    pub rate_limit_rpm: u32,
    #[serde(default = "default_concurrency")]
    pub rate_limit_concurrency: usize,
    #[serde(default = "default_retries")]
    pub max_retries: u32,
    #[serde(default)]
    pub firebase_project_id: Option<String>,
    /// daily.dev Public API personal access token
    #[serde(default)]
    pub daily_dev_token: Option<String>,
    /// shared secret guarding POST /cron/briefing
    #[serde(default)]
    pub cron_secret: Option<String>,
    /// OpenAI-compatible embeddings key (RAG — default provider)
    #[serde(default)]
    pub embeddings_api_key: Option<String>,
    #[serde(default)]
    pub embeddings_model: Option<String>,
    #[serde(default)]
    pub embeddings_base_url: Option<String>,
    /// must match the migration's `vector(N)` column (default 1536)
    #[serde(default = "default_embeddings_dim")]
    pub embeddings_dim: usize,
    /// where ingest looks for books JSON when the body is empty
    #[serde(default)]
    pub books_dir: Option<String>,
    /// Google OAuth client (Phase 3 calendar, Phase 4 gmail)
    #[serde(default)]
    pub google_client_id: Option<String>,
    #[serde(default)]
    pub google_client_secret: Option<String>,
    #[serde(default)]
    pub google_redirect_url: Option<String>,
    /// hex-encoded 32-byte master key for AES-GCM token encryption
    #[serde(default)]
    pub token_enc_key: Option<String>,
}

fn default_embeddings_dim() -> usize {
    1536
}

fn default_max_tokens() -> u32 {
    4096
}
fn default_cors_origins() -> Vec<String> {
    vec!["http://localhost:5173".into()]
}

/// Accepts either a TOML-style list (`GROWTH_CORS_ORIGINS=["http://a","http://b"]`)
/// or a plain comma-separated string (`GROWTH_CORS_ORIGINS=http://a,http://b`).
mod cors_list {
    use serde::{Deserialize, Deserializer};

    pub fn deserialize<'de, D>(d: D) -> Result<Vec<String>, D::Error>
    where
        D: Deserializer<'de>,
    {
        #[derive(Deserialize)]
        #[serde(untagged)]
        enum Raw {
            List(Vec<String>),
            One(String),
        }

        match Raw::deserialize(d) {
            Ok(Raw::List(v)) => Ok(v),
            Ok(Raw::One(s)) => Ok(s
                .split(',')
                .map(|item| item.trim().to_string())
                .filter(|item| !item.is_empty())
                .collect()),
            Err(e) => Err(e),
        }
    }
}
fn default_max_input_chars() -> usize {
    60_000
}
fn default_rpm() -> u32 {
    20
}
fn default_concurrency() -> usize {
    3
}
fn default_retries() -> u32 {
    4
}

impl Default for Config {
    fn default() -> Self {
        Self {
            port: 8000,
            cors_origins: vec!["http://localhost:5173".into()],
            database_url: None,
            anthropic_api_key: None,
            anthropic_model: Some("claude-sonnet-5-5".into()),
            anthropic_max_tokens: 4096,
            anthropic_max_input_chars: 60_000,
            rate_limit_rpm: 20,
            rate_limit_concurrency: 3,
            max_retries: 4,
            firebase_project_id: None,
            daily_dev_token: None,
            cron_secret: None,
            embeddings_api_key: None,
            embeddings_model: Some("text-embedding-3-small".into()),
            embeddings_base_url: None,
            embeddings_dim: 1536,
            books_dir: None,
            google_client_id: None,
            google_client_secret: None,
            google_redirect_url: None,
            token_enc_key: None,
        }
    }
}

impl Config {
    pub fn load_from_env() -> Result<Self, anyhow::Error> {
        // dotenvy: local runs read backend/.env (see .env.example); on hosts the
        // real env vars are already set, so a missing file is not an error.
        let _ = dotenvy::dotenv();
        let figment = Figment::new()
            .merge(Env::prefixed("GROWTH_").split("__"))
            .select("*");
        let cfg: Config = match figment.extract() {
            Ok(c) => c,
            Err(e) => {
                eprintln!("[config] extract failed, using defaults: {e}");
                Config::default()
            }
        };
        // tolerate plain PORT set by hosts (flyio/railway pattern)
        if let Ok(port) = env::var("PORT") {
            return Ok(Config {
                port: port.parse().unwrap_or(cfg.port),
                ..cfg
            });
        }
        Ok(cfg)
    }

    pub fn anthropic_configured(&self) -> bool {
        self.anthropic_api_key
            .as_deref()
            .map(|k| !k.is_empty())
            .unwrap_or(false)
    }

    pub fn firebase_configured(&self) -> bool {
        self.firebase_project_id
            .as_deref()
            .map(|p| !p.is_empty())
            .unwrap_or(false)
    }

    pub fn google_configured(&self) -> bool {
        self.google_client_id
            .as_deref()
            .map(|p| !p.is_empty())
            .unwrap_or(false)
            && self
                .google_client_secret
                .as_deref()
                .map(|p| !p.is_empty())
                .unwrap_or(false)
    }
}
