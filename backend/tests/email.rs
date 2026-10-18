//! Gmail metadata contract (wiremock): unread list → id list → metadata
//! fetches → normalized `GmailMessage`s. Privacy invariant asserted: only
//! metadata + snippet cross the wire (no body field is ever requested).

use growth_copilot::services::crypto::TokenCrypto;
use growth_copilot::services::email::EmailService;
use growth_copilot::services::google::{GoogleClient, GoogleSettings, GMAIL_SCOPE};
use wiremock::matchers::{method, query_param, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

fn service(server: &MockServer) -> EmailService {
    let crypto = TokenCrypto::from_hex(&hex::encode([7u8; 32])).unwrap();
    let settings = GoogleSettings {
        client_id: "test-client-id".into(),
        client_secret: "test-client-secret".into(),
        redirect_url: format!("{}/api/integrations/google/callback", server.uri()),
        scope: GMAIL_SCOPE.into(),
        calendar_base_url: "https://www.googleapis.com/calendar/v3".into(),
        gmail_base_url: format!("{}/gmail/v1", server.uri()),
    };
    EmailService::new(GoogleClient::new(settings), crypto)
}

#[tokio::test]
async fn metadata_only_contract() {
    let server = MockServer::start().await;
    let long_snippet = "x".repeat(500);

    // list (unread inbox)
    Mock::given(method("GET"))
        .and(path("/gmail/v1/users/me/messages"))
        .and(query_param("q", "is:unread label:inbox"))
        .and(query_param("maxResults", "15"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "messages": [ { "id": "msg1" }, { "id": "msg2" } ]
        })))
        .mount(&server)
        .await;

    // metadata per id: snippet + Subject/From headers, format=metadata
    for (id, subject) in [("msg1", "Deploy checklist"), ("msg2", "Re: interview")] {
        Mock::given(method("GET"))
            .and(path(format!("/gmail/v1/users/me/messages/{id}")))
            .and(query_param("format", "metadata"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "id": id,
                "snippet": long_snippet,
                "payload": { "headers": [
                    { "name": "Subject", "value": subject },
                    { "name": "From", "value": "Someone <s@example.com>" }
                ]}
            })))
            .mount(&server)
            .await;
    }

    let msgs = service(&server)
        .fetch_unread("token")
        .await
        .expect("fetch ok");
    assert_eq!(msgs.len(), 2);
    assert_eq!(msgs[0].subject, "Deploy checklist");
    assert_eq!(msgs[0].from, "Someone <s@example.com>");
    // snippet hard-capped at 140 chars — never a full body
    assert_eq!(msgs[0].snippet.chars().count(), 140);
}

#[tokio::test]
async fn empty_inbox_short_circuits() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/gmail/v1/users/me/messages"))
        .respond_with(
            ResponseTemplate::new(200).set_body_json(serde_json::json!({})),
        )
        .mount(&server)
        .await;

    let msgs = service(&server).fetch_unread("token").await.expect("fetch ok");
    assert!(msgs.is_empty());
}
