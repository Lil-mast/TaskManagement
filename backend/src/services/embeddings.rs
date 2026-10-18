//! Embeddings client — the RAG layer's only network dependency.
//!
//! Anthropic does not serve embeddings; the default provider is OpenAI's
//! `text-embedding-3-small` (1536-dim). Provider/model/dim are config; the
//! same model must generate document chunks **and** queries (a mismatch
//! invalidates retrieval — RAG_PIPELINE §5).

use crate::core::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};

pub const DEFAULT_EMBEDDINGS_BASE_URL: &str = "https://api.openai.com/v1";
pub const DEFAULT_EMBEDDINGS_MODEL: &str = "text-embedding-3-small";

#[derive(Debug, Clone)]
pub struct EmbeddingSettings {
    pub api_key: String,
    pub model: String,
    /// dims are pinned in the migrations (`vector(1536)`); must match the model
    pub expected_dim: usize,
    pub base_url: String,
}

#[derive(Serialize)]
struct EmbeddingsRequest<'a> {
    model: &'a str,
    input: &'a [&'a str],
}

#[derive(Deserialize)]
struct EmbeddingsResponse {
    data: Vec<EmbeddingsData>,
}

#[derive(Deserialize)]
struct EmbeddingsData {
    embedding: Vec<f64>,
}

#[derive(Clone)]
pub struct EmbeddingClient {
    http: reqwest::Client,
    settings: std::sync::Arc<EmbeddingSettings>,
}

impl EmbeddingClient {
    pub fn new(settings: EmbeddingSettings) -> Self {
        let http = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .expect("reqwest trivially valid");
        Self { http, settings: std::sync::Arc::new(settings) }
    }

    pub fn is_configured(&self) -> bool {
        !self.settings.api_key.is_empty()
    }

    pub fn model(&self) -> &str {
        &self.settings.model
    }

    /// One batching call — N texts, N vectors in order. `Batchable by the
    /// caller`; cap batch size around ≤64 to keep request bodies sane.
    pub async fn embed(&self, texts: &[String]) -> AppResult<Vec<Vec<f64>>> {
        if !self.is_configured() {
            return Err(AppError::Unavailable(
                "embeddings API key not configured (GROWTH_EMBEDDINGS_API_KEY)".into(),
            ));
        }
        if texts.is_empty() {
            return Ok(Vec::new());
        }
        let refs: Vec<&str> = texts.iter().map(|t| t.as_str()).collect();
        let url = format!("{}/embeddings", self.settings.base_url);
        let resp = self
            .http
            .post(&url)
            .bearer_auth(&self.settings.api_key)
            .json(&EmbeddingsRequest {
                model: &self.settings.model,
                input: &refs,
            })
            .send()
            .await
            .map_err(|e| AppError::Upstream(format!("embeddings fetch failed: {e}")))?;

        let status = resp.status();
        let body: EmbeddingsResponse = resp
            .json()
            .await
            .map_err(|e| AppError::Upstream(format!("embeddings body invalid: {e}")))?;
        if status.is_client_error() || status.is_server_error() {
            return Err(AppError::Upstream(format!(
                "embeddings provider returned {status} with data"
            )));
        }

        if body.data.len() != texts.len() {
            return Err(AppError::Upstream(format!(
                "embeddings mismatch: sent {} got {}",
                texts.len(),
                body.data.len()
            )));
        }

        let expected = self.settings.expected_dim;
        if let Some(first) = body.data.first() {
            if first.embedding.len() != expected {
                return Err(AppError::Upstream(format!(
                    "embedding dim {} != configured {expected} — re-run ingest after fixing config",
                    first.embedding.len()
                )));
            }
        }

        Ok(body.data.into_iter().map(|d| d.embedding).collect())
    }
}

/// Serialize an embedding vector as a pgvector literal ("[1,2,3]") usable via
/// `$N::vector`. Values are floats — injection-safe.
pub fn to_pgvector_literal(vec: &[f64]) -> String {
    let joined = vec
        .iter()
        .map(|f| format!("{f}"))
        .collect::<Vec<_>>()
        .join(",");
    format!("[{joined}]")
}
