use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;
use thiserror::Error;

/// Single error surface for every handler / service.
#[derive(Debug, Error)]
pub enum AppError {
    #[error("unauthorized: {0}")]
    Unauthorized(String),

    #[error("forbidden: {0}")]
    Forbidden(String),

    #[error("rate limited: {message}")]
    RateLimited {
        message: String,
        retry_after_secs: u64,
    },

    /// an upstream API (Anthropic / Google / daily.dev) failed after retries
    #[error("upstream error: {0}")]
    Upstream(String),

    #[error("bad request: {0}")]
    BadRequest(String),

    #[error("upstream unavailable: {0}")]
    Unavailable(String),

    #[error("database error: {0}")]
    Database(String),

    #[error("configuration error: {0}")]
    Config(String),

    #[error(transparent)]
    Internal(#[from] anyhow::Error),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, code) = match &self {
            AppError::Unauthorized(_) => (StatusCode::UNAUTHORIZED, "unauthorized"),
            AppError::Forbidden(_) => (StatusCode::FORBIDDEN, "forbidden"),
            AppError::RateLimited { .. } => (StatusCode::TOO_MANY_REQUESTS, "rate_limited"),
            AppError::Upstream(_) => (StatusCode::BAD_GATEWAY, "upstream_error"),
            AppError::BadRequest(_) => (StatusCode::BAD_REQUEST, "bad_request"),
            AppError::Unavailable(_) => (StatusCode::SERVICE_UNAVAILABLE, "unavailable"),
            AppError::Database(_) => (StatusCode::INTERNAL_SERVER_ERROR, "database_error"),
            AppError::Config(_) => (StatusCode::INTERNAL_SERVER_ERROR, "config_error"),
            AppError::Internal(_) => (StatusCode::INTERNAL_SERVER_ERROR, "internal"),
        };
        let body = Json(json!({
            "error": { "code": code, "message": self.to_string() }
        }));
        let mut response = (status, body).into_response();
        if let AppError::RateLimited {
            retry_after_secs, ..
        } = &self
        {
            if let Ok(value) = retry_after_secs.to_string().parse() {
                response
                    .headers_mut()
                    .insert(axum::http::header::RETRY_AFTER, value);
            }
        }
        response
    }
}

pub type AppResult<T> = Result<T, AppError>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rate_limited_sets_retry_after() {
        let response = AppError::RateLimited {
            message: "slow down".into(),
            retry_after_secs: 12,
        }
        .into_response();
        assert_eq!(response.status(), StatusCode::TOO_MANY_REQUESTS);
        assert_eq!(
            response
                .headers()
                .get(axum::http::header::RETRY_AFTER)
                .unwrap(),
            "12"
        );
    }

    #[test]
    fn forbidden_is_403() {
        let response = AppError::Forbidden("not invited".into()).into_response();
        assert_eq!(response.status(), StatusCode::FORBIDDEN);
    }
}
