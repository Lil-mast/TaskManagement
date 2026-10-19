//! Golden-set retrieval evals (RAG_PIPELINE §8) — CI-gated.
//!
//! Requires:
//!   GROWTH_TEST_DATABASE_URL   — a disposable Postgres with migration 0002
//!   GROWTH_TEST_EMBEDDINGS_KEY — real embeddings API access
//!
//! Without these the suite prints a skip note and passes (never flakes CI
//! environments that lack the secrets); with them it hard-fails on retrieval
//! regressions — that is the prompt-drift tripwire PHASE_5 §5 asks for.

#![allow(dead_code)]

const GOLDEN_SET: &[(&str, &str, &str, &str)] = &[
    // (book, idea, application, expected query)
    (
        "Golden Book",
        "If a task takes under two minutes, do it immediately instead of scheduling it.",
        "Route tiny chores straight to done.",
        "what to do with quick small tasks",
    ),
    (
        "Golden Book",
        "Deep work requires long uninterrupted blocks free of context switching.",
        "Batch meetings into one afternoon.",
        "how to focus on hard problems",
    ),
    (
        "Golden Book 2",
        "Preparation beats improvisation: rehearse the hardest interview question first.",
        "Study weak patterns before strong ones.",
        "interview preparation strategy",
    ),
];

use growth_copilot::services::embeddings::{
    EmbeddingClient, EmbeddingSettings, DEFAULT_EMBEDDINGS_BASE_URL, DEFAULT_EMBEDDINGS_MODEL,
};
use growth_copilot::services::rag::{KnowledgeIngestItem, RagService};

fn fixture() -> Vec<KnowledgeIngestItem> {
    GOLDEN_SET
        .iter()
        .map(|(book, idea, application, _)| KnowledgeIngestItem {
            book: book.to_string(),
            chapter: Some("golden".into()),
            idea: idea.to_string(),
            application: Some(application.to_string()),
            tags: vec!["golden".into()],
            weight: Some(1.0),
        })
        .collect()
}

#[tokio::test]
async fn golden_set_top3_relevance() {
    let db_url = match std::env::var("GROWTH_TEST_DATABASE_URL") {
        Ok(u) if !u.is_empty() => u,
        _ => skip_suite(),
    };
    let emb_key = match std::env::var("GROWTH_TEST_EMBEDDINGS_KEY") {
        Ok(k) if !k.is_empty() => k,
        _ => skip_suite(),
    };

    let pool = sqlx::postgres::PgPoolOptions::new()
        .connect(&db_url)
        .await
        .expect("connect to GROWTH_TEST_DATABASE_URL");

    let embeddings = EmbeddingClient::new(EmbeddingSettings {
        api_key: emb_key,
        model: DEFAULT_EMBEDDINGS_MODEL.into(),
        expected_dim: 1536,
        base_url: DEFAULT_EMBEDDINGS_BASE_URL.into(),
    });
    let rag = RagService::new(embeddings.clone());
    let user = "golden-set-user";

    // ingest is idempotent — CI runs can re-use a seeded db
    rag.ingest(&pool, user, &fixture()).await.expect("ingest");

    let mut failures = Vec::new();
    for (book, _, _, query) in GOLDEN_SET {
        let hits = rag
            .retrieve(&pool, user, query, 3, "golden")
            .await
            .expect("retrieve");
        let top_books: Vec<&str> = hits.iter().map(|h| h.source_ref.as_str()).collect();
        let found = top_books.iter().any(|s| s.contains(book));
        if !found {
            failures.push(format!(
                "query {query:?} → top-3 did not contain {book:?}: {top_books:?}"
            ));
        }
    }

    if !failures.is_empty() {
        panic!("golden set regressions:\n{}", failures.join("\n"));
    }
}

/// Prints the reason and ends the test as a pass (CI skip semantics).
fn skip_suite() -> ! {
    println!(
        "SKIPPED golden-set evals — set GROWTH_TEST_DATABASE_URL + \
         GROWTH_TEST_EMBEDDINGS_KEY to run the drift tripwire."
    );
    std::process::exit(0)
}
