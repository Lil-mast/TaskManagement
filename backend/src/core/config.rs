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
    /// Per-user API budget for non-admin accounts.
    #[serde(default = "default_user_rpm")]
    pub user_rate_limit_rpm: u32,
    /// Per-user budget for expensive LLM/embedding actions.
    #[serde(default = "default_user_llm_per_hour")]
    pub user_llm_limit_per_hour: u32,
    /// Comma-separated verified emails that are admins.
    #[serde(default, deserialize_with = "csv_list::deserialize")]
    pub admin_emails: Vec<String>,
    /// Comma-separated Firebase/Supabase user ids that are admins.
    #[serde(default, deserialize_with = "csv_list::deserialize")]
    pub admin_user_ids: Vec<String>,
    /// Invite-only allowlist by verified email.
    #[serde(default, deserialize_with = "csv_list::deserialize")]
    pub allowed_emails: Vec<String>,
    /// Invite-only allowlist by provider user id.
    #[serde(default, deserialize_with = "csv_list::deserialize")]
    pub allowed_user_ids: Vec<String>,
    /// Reject Firebase accounts whose email is not verified.
    #[serde(default = "default_true")]
    pub require_verified_email: bool,
    /// Local-only escape hatch. Never enable this on a public deployment.
    #[serde(default)]
    pub allow_dev_auth: bool,
    #[serde(default)]
    pub firebase_project_id: Option<String>,
    /// Supabase project URL (https://<ref>.supabase.co) — Phase 6 auth
    /// consolidation target. JWTs verified against the project's JWKS.
    #[serde(default)]
    pub supabase_url: Option<String>,
    /// Legacy HS256 JWT secret (only for projects still on symmetric signing
    /// keys); asymmetric JWKS verification is preferred and needs nothing here.
    #[serde(default)]
    pub supabase_jwt_secret: Option<String>,
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
/// Accepts a TOML-style list or a plain comma-separated env value.
mod csv_list {
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
            Ok(Raw::List(values)) => Ok(values
                .into_iter()
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty())
                .collect()),
            Ok(Raw::One(value)) => Ok(value
                .split(',')
                .map(|item| item.trim().to_string())
                .filter(|item| !item.is_empty())
                .collect()),
            Err(error) => Err(error),
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
fn default_user_rpm() -> u32 {
    60
}
fn default_user_llm_per_hour() -> u32 {
    10
}
fn default_true() -> bool {
    true
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
            user_rate_limit_rpm: 60,
            user_llm_limit_per_hour: 10,
            admin_emails: Vec::new(),
            admin_user_ids: Vec::new(),
            allowed_emails: Vec::new(),
            allowed_user_ids: Vec::new(),
            require_verified_email: true,
            allow_dev_auth: false,
            firebase_project_id: None,
            supabase_url: None,
            supabase_jwt_secret: None,
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

    pub fn supabase_configured(&self) -> bool {
        self.supabase_url
            .as_deref()
            .map(|p| p.trim().trim_end_matches('/').len() > 8)
            .unwrap_or(false)
    }

    /// Normalized origin (no trailing slash).
    pub fn supabase_origin(&self) -> Option<&str> {
        self.supabase_url
            .as_deref()
            .map(|p| p.trim().trim_end_matches('/'))
            .filter(|p| p.len() > 8)
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

    pub fn auth_mode(&self) -> &'static str {
        if self.firebase_configured() {
            "firebase"
        } else if self.supabase_configured() {
            "supabase"
        } else if self.allow_dev_auth {
            "dev"
        } else {
            "unconfigured"
        }
    }

    pub fn identity_is_admin(
        &self,
        user_id: &str,
        email: Option<&str>,
        email_verified: bool,
    ) -> bool {
        if self.allow_dev_auth && user_id == "local_dev" {
            return true;
        }
        if self.admin_user_ids.iter().any(|id| id == user_id) {
            return true;
        }
        email
            .map(|address| {
                self.admin_emails
                    .iter()
                    .any(|allowed| allowed.eq_ignore_ascii_case(address))
                    && (email_verified || !self.require_verified_email)
            })
            .unwrap_or(false)
    }

    pub fn identity_is_allowed(
        &self,
        user_id: &str,
        email: Option<&str>,
        email_verified: bool,
    ) -> bool {
        if self.identity_is_admin(user_id, email, email_verified) {
            return true;
        }
        if self.allowed_user_ids.iter().any(|id| id == user_id) {
            return true;
        }
        email
            .map(|address| {
                self.allowed_emails
                    .iter()
                    .any(|allowed| allowed.eq_ignore_ascii_case(address))
                    && (email_verified || !self.require_verified_email)
            })
            .unwrap_or(false)
    }

    /// Why an authenticated identity is not allowed through the gate.
    /// `None` means the identity is allowed.
    pub fn identity_denial_reason(
        &self,
        user_id: &str,
        email: Option<&str>,
        email_verified: bool,
    ) -> Option<&'static str> {
        if self.identity_is_allowed(user_id, email, email_verified) {
            return None;
        }
        let listed_by_email = email
            .map(|address| {
                self.admin_emails
                    .iter()
                    .chain(self.allowed_emails.iter())
                    .any(|allowed| allowed.eq_ignore_ascii_case(address))
            })
            .unwrap_or(false);
        if listed_by_email && self.require_verified_email && !email_verified {
            Some("email_unverified")
        } else {
            Some("not_invited")
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dev_identity_is_only_admin_when_explicitly_enabled() {
        let mut config = Config::default();
        assert!(!config.identity_is_admin("local_dev", Some("dev@localhost"), true));
        config.allow_dev_auth = true;
        assert!(config.identity_is_admin("local_dev", Some("dev@localhost"), true));
        assert!(config.identity_is_allowed("local_dev", Some("dev@localhost"), true));
    }

    #[test]
    fn email_admin_requires_verification() {
        let mut config = Config::default();
        config.admin_emails = vec!["boss@example.com".into()];
        assert!(!config.identity_is_admin("uid-1", Some("boss@example.com"), false));
        assert_eq!(
            config.identity_denial_reason("uid-1", Some("boss@example.com"), false),
            Some("email_unverified")
        );
        assert!(config.identity_is_admin("uid-1", Some("BOSS@example.com"), true));
    }

    #[test]
    fn invite_lists_are_enforced_by_email_or_uid() {
        let mut config = Config::default();
        config.allowed_emails = vec!["friend@example.com".into()];
        config.allowed_user_ids = vec!["uid-2".into()];

        assert!(config.identity_is_allowed("uid-1", Some("friend@example.com"), true));
        assert_eq!(
            config.identity_denial_reason("uid-1", Some("friend@example.com"), false),
            Some("email_unverified")
        );
        assert!(config.identity_is_allowed("uid-2", None, false));
        assert_eq!(
            config.identity_denial_reason("uid-3", Some("stranger@example.com"), true),
            Some("not_invited")
        );
    }

    #[test]
    fn auth_mode_fails_closed_without_a_provider_or_dev_flag() {
        let mut config = Config::default();
        assert_eq!(config.auth_mode(), "unconfigured");
        config.allow_dev_auth = true;
        assert_eq!(config.auth_mode(), "dev");
    }
}
