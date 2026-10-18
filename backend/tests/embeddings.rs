//! Embeddings client contract (wiremock): request shape, ordering, and the
//! two failure modes that matter — count mismatch and dimension mismatch.

use growth_copilot::core::error::AppError;
use growth_copilot::services::embeddings::{EmbeddingClient, EmbeddingSettings};
use wiremock::matchers::{bearer_token, body_partial_json, method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

fn client(server: &MockServer, expected_dim: usize) -> EmbeddingClient {
    EmbeddingClient::new(EmbeddingSettings {
        api_key: "test-embeddings-key".into(),
        model: "text-embedding-3-small".into(),
        expected_dim,
        base_url: server.uri(),
    })
}

fn ok_body(vectors: serde_json::Value) -> ResponseTemplate {
    ResponseTemplate::new(200).set_body_json(serde_json::json!({
        "object": "list",
        "data": vectors,
        "model": "text-embedding-3-small"
    }))
}

#[tokio::test]
async fn embeds_batch_in_order_and_sends_auth() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/embeddings"))
        .and(bearer_token("test-embeddings-key"))
        .and(body_partial_json(serde_json::json!({
            "model": "text-embedding-3-small",
            "input": ["a", "b"]
        })))
        .respond_with(ok_body(serde_json::json!([
            { "index": 0, "embedding": [0.1, 0.2] },
            { "index": 1, "embedding": [0.3, 0.4] }
        ])))
        .mount(&server)
        .await;

    let out = client(&server, 2)
        .embed(&["a".into(), "b".into()])
        .await
        .expect("embed ok");
    assert_eq!(out.len(), 2);
    assert_eq!(out[0], vec![0.1, 0.2]);
    assert_eq!(out[1], vec![0.3, 0.4]);
}

#[tokio::test]
async fn count_mismatch_is_an_upstream_error() {
    let server = MockServer::start().await;
    // provider "lost" one vector — must fail, never silently misalign
    Mock::given(method("POST"))
        .and(path("/embeddings"))
        .respond_with(ok_body(serde_json::json!([
            { "index": 0, "embedding": [0.1, 0.2] }
        ])))
        .mount(&server)
        .await;

    let err = client(&server, 2)
        .embed(&["a".into(), "b".into()])
        .await
        .expect_err("must fail");
    assert!(matches!(err, AppError::Upstream(_)));
}

#[tokio::test]
async fn dim_mismatch_is_an_upstream_error() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/embeddings"))
        .respond_with(ok_body(serde_json::json!([
            { "index": 0, "embedding": [0.1, 0.2, 0.3] } // configured 4
        ])))
        .mount(&server)
        .await;

    let err = client(&server, 4).embed(&["a".into()]).await.expect_err("must fail");
    assert!(matches!(err, AppError::Upstream(_)));
    let msg = err.to_string();
    assert!(msg.contains("dim"), "error should mention dimension: {msg}");
}

#[tokio::test]
async fn missing_key_short_circuits_without_http() {
    let server = MockServer::start().await;
    let client = EmbeddingClient::new(EmbeddingSettings {
        api_key: String::new(), // unconfigured
        model: "text-embedding-3-small".into(),
        expected_dim: 2,
        base_url: server.uri(),
    });
    let err = client.embed(&["a".into()]).await.expect_err("must fail");
    assert!(matches!(err, AppError::Unavailable(_)));
}
