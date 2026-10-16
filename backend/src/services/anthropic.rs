//! Anthropic Messages API client with rate limiting, concurrency control, and
//! retry/backoff honoring `Retry-After`.
//!
//! This is the **only** code path in the app that talks to Anthropic — no
//! route or job may construct its own request.

use std::{
    sync::Arc,
    time::{Duration, Instant},
};

use rand::Rng;
use serde::Serialize;
use tokio::sync::{Mutex, Semaphore};

use crate::core::error::{AppError, AppResult};

/// Messages API base; overridable for tests / proxies via config.
pub const DEFAULT_BASE_URL: &str = "https://api.anthropic.com";
pub const ANTHROPIC_VERSION: &str = "2023-06-01";

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

/// Token-bucket limiter. Capacity = tokens per minute; awaits (instead of
/// failing) until a token is available.
pub struct BucketLimiter {
    state: Mutex<Inner>,
    capacity: f64,
    /// tokens per second
    refill_rate: f64,
}

struct Inner {
    tokens: f64,
    last: Instant,
}

impl BucketLimiter {
    pub fn new(requests_per_minute: u32) -> Self {
        let rpm = requests_per_minute.max(1) as f64;
        Self {
            state: Mutex::new(Inner { tokens: rpm, last: Instant::now() }),
            capacity: rpm,
            refill_rate: rpm / 60.0,
        }
    }

    /// Elapsed-time refill.
    fn refill(&self, inner: &mut Inner) {
        let now = Instant::now();
        let elapsed = now.duration_since(inner.last).as_secs_f64();
        if elapsed > 0.0 {
            inner.tokens = (inner.tokens + elapsed * self.refill_rate).min(self.capacity);
            inner.last = now;
        }
    }

    /// Waits until one token is available, then consumes it.
    pub async fn acquire(&self) {
        let mut inner = self.state.lock().await;
        loop {
            self.refill(&mut inner);
            if inner.tokens >= 1.0 {
                inner.tokens -= 1.0;
                return;
            }
            // vault time until the next full token
            let wait_secs = (1.0 - inner.tokens) / self.refill_rate;
            tokio::time::sleep(Duration::from_secs_f64(wait_secs.max(0.001))).await;
        }
    }

    /// Live token level (for /healthz and tests).
    pub async fn tokens(&self) -> f64 {
        let mut inner = self.state.lock().await;
        self.refill(&mut inner);
        inner.tokens
    }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
pub struct AnthropicSettings {
    pub api_key: String,
    pub model: String,
    pub max_tokens: u32,
    /// char ceiling for prompts before send (guards vs runaway prompt assembly)
    pub max_input_chars: usize,
    pub requests_per_minute: u32,
    pub max_concurrency: usize,
    pub max_retries: u32,
    pub base_url: String,
}

#[derive(Debug, Serialize, Clone, Copy)]
#[serde(rename_all = "lowercase")]
pub enum Role {
    User,
    Assistant,
}

#[derive(Debug, Serialize)]
pub struct Message {
    pub role: Role,
    pub content: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ToolDefinition {
    pub name: String,
    pub description: String,
    /// JSON `input_schema` block
    pub input_schema: serde_json::Value,
}

#[derive(Debug, Serialize)]
pub struct MessagesRequest {
    pub model: String,
    pub max_tokens: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub system: Option<String>,
    pub messages: Vec<Message>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tools: Option<Vec<ToolDefinition>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_choice: Option<serde_json::Value>,
}

#[derive(Debug)]
pub struct MessagesResponse {
    pub stop_reason: String,
    pub text: Option<String>,
    pub tool_uses: Vec<ToolUse>,
}

#[derive(Debug, Clone)]
pub struct ToolUse {
    pub id: String,
    pub name: String,
    pub input: serde_json::Value,
}

/// Shared Anthropic client — cheap to clone per request.
#[derive(Clone)]
pub struct AnthropicClient {
    http: reqwest::Client,
    settings: Arc<AnthropicSettings>,
    limiter: Arc<BucketLimiter>,
    slots: Arc<Semaphore>,
}

impl AnthropicClient {
    pub fn new(settings: AnthropicSettings) -> Self {
        let limiter = BucketLimiter::new(settings.requests_per_minute);
        let slots = Semaphore::new(settings.max_concurrency);
        let http = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(10))
            .timeout(Duration::from_secs(120))
            .build()
            .expect("reqwest builds with sane static config");
        Self {
            http,
            settings: Arc::new(settings),
            limiter: Arc::new(limiter),
            slots: Arc::new(slots),
        }
    }

    pub fn is_configured(&self) -> bool {
        !self.settings.api_key.is_empty()
    }

    pub fn settings(&self) -> &AnthropicSettings {
        &self.settings
    }

    /// Live token-bucket level (for /healthz).
    pub async fn tokens_available(&self) -> f64 {
        self.limiter.tokens().await
    }

    /// The one true Anthropic call.
    ///
    /// - token bucket awaits between calls (`requests_per_minute`)
    /// - semaphore caps in-flight calls (`max_concurrency`)
    /// - retries 429/529 with `Retry-After` (fallback: fixed per code)
    /// - retries 5xx / transport errors with exponential + jitter
    /// - other 4xx fails immediately (`AppError::Upstream`)
    pub async fn chat(
        &self,
        messages: Vec<Message>,
        system: Option<String>,
        tools: Vec<ToolDefinition>,
    ) -> AppResult<MessagesResponse> {
        if !self.is_configured() {
            return Err(AppError::Unavailable(
                "GROWTH_ANTHROPIC_API_KEY not configured".into(),
            ));
        }

        // Input guard — respect the prompt budget before any network cost.
        let input_total: usize = messages.iter().map(|m| m.content.len()).sum::<usize>()
            + system.as_deref().map(str::len).unwrap_or(0);
        if input_total > self.settings.max_input_chars {
            return Err(AppError::BadRequest(format!(
                "prompt too large: {input_total} chars > limit {}",
                self.settings.max_input_chars
            )));
        }

        let has_tools = !tools.is_empty();
        let req = MessagesRequest {
            model: self.settings.model.clone(),
            max_tokens: self.settings.max_tokens,
            system,
            messages,
            tools: if has_tools { Some(tools) } else { None },
            tool_choice: if has_tools {
                Some(serde_json::json!({ "type": "auto" }))
            } else {
                None
            },
        };

        let url = format!("{}/v1/messages", self.settings.base_url);
        let payload = serde_json::to_string(&req)
            .map_err(|e| AppError::Internal(anyhow::anyhow!("serialize messages: {e}")))?;
        let mut backoff_secs = 1.0_f64;
        let max_attempts = self.settings.max_retries.max(1);

        for attempt in 1..=max_attempts {
            // bucket + slot — held for the entire HTTP call
            self.limiter.acquire().await;
            let _permit = self
                .slots
                .acquire()
                .await
                .map_err(|e| AppError::Internal(anyhow::anyhow!("semaphore closed: {e}")));

            let result = self
                .http
                .post(&url)
                .header("x-api-key", &self.settings.api_key)
                .header("anthropic-version", ANTHROPIC_VERSION)
                .header("content-type", "application/json")
                .body(payload.clone())
                .send()
                .await;

            match result {
                Ok(resp) => {
                    let status = resp.status();

                    if status.is_success() {
                        let body: serde_json::Value = resp
                            .json()
                            .await
                            .map_err(|e| AppError::Upstream(format!("messages parse: {e}")))?;
                        return parse_response(&body);
                    }

                    if status.as_u16() == 429 || status.as_u16() == 529 {
                        let default_wait = if status.as_u16() == 429 { 10.0 } else { 30.0 };
                        let retry_after = resp
                            .headers()
                            .get("retry-after")
                            .and_then(|v| v.to_str().ok())
                            .and_then(|v| v.parse::<f64>().ok())
                            .unwrap_or(default_wait);
                        tracing::warn!(attempt, %status, retry_after, "Anthropic rate limited — backing off");
                        tokio::time::sleep(Duration::from_secs_f64(retry_after)).await;
                        continue;
                    }

                    if status.is_server_error() {
                        tracing::warn!(attempt, %status, "Anthropic 5xx — retrying");
                        let jitter = rand::thread_rng().gen_range(0.0..0.5);                        tokio::time::sleep(Duration::from_secs_f64(backoff_secs + jitter)).await;
                        backoff_secs *= 2.0;
                        if attempt >= max_attempts {
                            return Err(AppError::Upstream(format!("anthropic {status}: server error after retries")));
                        }
                        continue;
                    }

                    // other 4xx — the request itself is invalid; retrying won't fix it
                    let msg = resp
                        .json::<serde_json::Value>()
                        .await
                        .ok()
                        .and_then(|b| b.get("error").and_then(|e| e.get("message")).cloned())
                        .and_then(|m| m.as_str().map(str::to_owned))
                        .unwrap_or_else(|| "anthropic rejected request".into());
                    return Err(AppError::Upstream(format!("anthropic {status}: {msg}")));
                }
                Err(err) => {
                    // transport error — retry with backoff
                    tracing::warn!(attempt, error = %err, "Anthropic transport error — retrying");
                    if attempt >= max_attempts {
                        return Err(AppError::Upstream(format!("anthropic unreachable: {err}")));
                    }
                    let jitter = rand::thread_rng().gen_range(0.0..0.5);
                    tokio::time::sleep(Duration::from_secs_f64(backoff_secs + jitter)).await;
                    backoff_secs *= 2.0;
                }
            }
        }

        Err(AppError::Upstream(
            "anthropic: exhausted retries after upstream failures".into(),
        ))
    }
}

fn parse_response(body: &serde_json::Value) -> AppResult<MessagesResponse> {
    let stop_reason = body
        .get("stop_reason")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown")
        .to_string();

    let mut text = None;
    let mut tool_uses = Vec::new();

    if let Some(content) = body.get("content").and_then(|v| v.as_array()) {
        for block in content {
            match block.get("type").and_then(|v| v.as_str()) {
                Some("text") => {
                    if let Some(t) = block.get("text").and_then(|v| v.as_str()) {
                        text = Some(t.to_string());
                    }
                }
                Some("tool_use") => {
                    tool_uses.push(ToolUse {
                        id: block.get("id").and_then(|v| v.as_str()).unwrap_or("unknown").into(),
                        name: block.get("name").and_then(|v| v.as_str()).unwrap_or("unknown").into(),
                        input: block.get("input").cloned().unwrap_or(serde_json::Value::Null),
                    });
                }
                _ => {}
            }
        }
    }
    Ok(MessagesResponse { stop_reason, text, tool_uses })
}

/// Shared tool-schema builders for capture / briefing / triage.
pub mod tool_helpers {
    use super::ToolDefinition;

    /// Convenience: object schema with typed properties.
    pub fn object_schema(properties: serde_json::Value, required: &[&str]) -> serde_json::Value {
        serde_json::json!({
            "type": "object",
            "properties": properties,
            "required": required
        })
    }

    /// Build a `ToolDefinition` with free-capture-friendly typing.
    pub fn tool(name: &str, description: &str, input_schema: serde_json::Value) -> ToolDefinition {
        ToolDefinition {
            name: name.into(),
            description: description.into(),
            input_schema,
        }
    }
}
