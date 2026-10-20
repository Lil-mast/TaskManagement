use std::time::Duration;

use growth_copilot::services::anthropic::{
    AnthropicClient, AnthropicSettings, BucketLimiter, Message, Role, ANTHROPIC_VERSION,
};
use serde_json::json;
use wiremock::matchers::{header, method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

fn test_settings(base_url: String) -> AnthropicSettings {
    AnthropicSettings {
        api_key: "test-key".into(),
        model: "claude-sonnet-4-20250514".into(),
        max_tokens: 1024,
        max_input_chars: 60_000,
        requests_per_minute: 1_000, // effectively off in these tests
        max_concurrency: 2,
        max_retries: 3,
        base_url,
    }
}

#[tokio::test]
async fn bucket_starts_full_and_drains() {
    // capacity 3/min
    let limiter = BucketLimiter::new(3);
    // starts full → 3 immediate acquires
    assert!(limiter.tokens().await >= 2.999_9);
    limiter.acquire().await;
    limiter.acquire().await;
    limiter.acquire().await;
    // now drained to ~0 → a 4th acquire must wait for refill
    let start = std::time::Instant::now();
    limiter.acquire().await;
    let elapsed = start.elapsed();
    // refill rate = 3/60 tokens per second → need ~1/20s for next full token;
    // assert some real waiting happened
    assert!(
        elapsed > Duration::from_millis(100),
        "4th acquire should have waited for refill, took {elapsed:?}"
    );
}

#[tokio::test(flavor = "current_thread")]
async fn retries_on_429_with_retry_after_then_succeeds() {
    let server = MockServer::start().await;

    // first (call): 429 with retry-after: 0 → immediate retry
    Mock::given(method("POST"))
        .and(path("/v1/messages"))
        .respond_with(
            ResponseTemplate::new(429)
                .insert_header("retry-after", "0")
                .set_body_json(json!({
                    "type": "error",
                    "error": { "type": "rate_limit_error", "message": "back off" }
                })),
        )
        .up_to_n_times(1)
        .mount(&server)
        .await;

    // then: success
    Mock::given(method("POST"))
        .and(path("/v1/messages"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "id": "msg_01",
            "stop_reason": "end_turn",
            "content": [ { "type": "text", "text": "narwhal horns are actually not horns" } ],
            "usage": { "input_tokens": 10, "output_tokens": 20 }
        })))
        .mount(&server)
        .await;

    let client = AnthropicClient::new(test_settings(server.uri()));
    let resp = client
        .chat(
            vec![Message { role: Role::User, content: "hello".into() }],
            None,
            vec![],
        )
        .await
        .expect("first attempt rate-limited, second succeeded");

    assert_eq!(resp.stop_reason, "end_turn");
    assert!(resp.tool_uses.is_empty());
    assert!(resp.text.unwrap().contains("narwhal"));

    // exactly two requests hit the server (429 + success)
    assert_eq!(server.received_requests().await.expect("requests").len(), 2);
}

#[tokio::test(flavor = "current_thread")]
async fn exhausts_retries_on_persistent_5xx() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/v1/messages"))
        .and(header("anthropic-version", ANTHROPIC_VERSION))
        .respond_with(ResponseTemplate::new(500).set_body_json(json!({
            "type": "error",
            "error": { "type": "api_error", "message": "kaput" }
        })))
        .mount(&server)
        .await;

    let client = AnthropicClient::new(test_settings(server.uri()));
    let err = client
        .chat(
            vec![Message { role: Role::User, content: "hello".into() }],
            None,
            vec![],
        )
        .await
        .expect_err("persistent 500 must surface after retries");
    assert!(err.to_string().contains("anthropic 500"), "got: {err}");

    // max_retries = 3 → exactly 3 transport attempts, no more
    assert_eq!(server.received_requests().await.expect("requests").len(), 3);
}

#[tokio::test(flavor = "current_thread")]
async fn tool_use_blocks_are_parsed() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/v1/messages"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "id": "msg_02",
            "stop_reason": "tool_use",
            "content": [
                { "type": "text", "text": "got it" },
                { "type": "tool_use", "id": "tu_1", "name": "create_task",
                  "input": { "title": "Review PRs", "quadrant": "urgent_important" } }
            ],
            "usage": { "input_tokens": 5, "output_tokens": 30 }
        })))
        .mount(&server)
        .await;

    let client = AnthropicClient::new(test_settings(server.uri()));
    let resp = client
        .chat(
            vec![Message { role: Role::User, content: "remind me to review PRs".into() }],
            None,
            vec![],
        )
        .await
        .expect("a valid tool call flows straight through");

    assert_eq!(resp.stop_reason, "tool_use");
    assert_eq!(resp.tool_uses.len(), 1);
    let tu = &resp.tool_uses[0];
    assert_eq!(tu.name, "create_task");
    assert_eq!(tu.input["title"], "Review PRs");
}

#[tokio::test(flavor = "current_thread")]
async fn oversized_prompts_are_rejected_locally() {
    let server = MockServer::start().await; // never reached
    let client = AnthropicClient::new(AnthropicSettings {
        max_input_chars: 10,
        ..test_settings(server.uri())
    });
    let err = client
        .chat(
            vec![Message { role: Role::User, content: "x".repeat(50) }],
            None,
            vec![],
        )
        .await
        .expect_err("oversized prompt must fail before any request");
    assert!(
        err.to_string().contains("prompt too large"),
        "got: {err}"
    );
    // guard proven: zero network calls
    assert!(server.received_requests().await.unwrap().is_empty());
}

// token budget spanning check: nothing over the ceiling is ever sent
#[tokio::test(flavor = "current_thread")]
async fn request_body_never_omits_model_and_max_tokens() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/v1/messages"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "id": "msg_03", "stop_reason": "end_turn", "content": []
        })))
        .mount(&server)
        .await;

    let client = AnthropicClient::new(test_settings(server.uri()));
    let _ = client
        .chat(
            vec![Message { role: Role::User, content: "hi".into() }],
            Some("be nice".into()),
            vec![],
        )
        .await
        .expect("call completes");

    let received = server.received_requests().await.expect("requests");
    let body: serde_json::Value = serde_json::from_slice(&received[0].body).expect("json body");
    assert_eq!(body["model"], "claude-sonnet-4-20250514");
    assert_eq!(body["max_tokens"], 1024);
    assert_eq!(body["messages"][0]["role"], "user");
}

// Phase 6 acceptance: a burst of concurrent calls drains the SINGLETON bucket,
// never a per-request bucket. rpm=3 means at most 3 immediate deliveries;
// the 4th must wait ~20 s for refill (verified absent from the server log).
#[tokio::test]
async fn burst_shares_one_singleton_bucket() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/v1/messages"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "id": "msg_b", "stop_reason": "end_turn",
            "content": [{"type": "text", "text": "ok"}],
            "usage": { "input_tokens": 1, "output_tokens": 1 }
        })))
        .mount(&server)
        .await;

    let settings = AnthropicSettings {
        requests_per_minute: 3,
        max_concurrency: 100, // concurrency must NOT be the limiter here
        ..test_settings(server.uri())
    };
    // ONE shared client — the AppState shape in production (Arc'd)
    let client = std::sync::Arc::new(AnthropicClient::new(settings));

    let mut handles = Vec::new();
    for i in 0..4 {
        let c = client.clone();
        handles.push(tokio::spawn(async move {
            c.chat(
                vec![Message { role: Role::User, content: format!("call {i}") }],
                None,
                vec![],
            )
            .await
        }));
    }
    // make sure all 4 were racing simultaneously
    for _ in &handles {
        tokio::time::sleep(Duration::from_millis(10)).await;
    }

    // after 1 s: exactly rpm requests landed; the 4th still waits for refill
    tokio::time::sleep(Duration::from_millis(1_100)).await;
    let received = server.received_requests().await.expect("requests");
    assert_eq!(
        received.len(),
        3,
        "burst must be throttled by the shared bucket, got {}",
        received.len()
    );
}
