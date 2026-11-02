//! Daily books inspiration route — deterministic date-based weighted random selection.

use std::sync::Arc;

use axum::{extract::State, routing::get, Json, Router};
use serde::{Deserialize, Serialize};

use crate::core::error::{AppError, AppResult};
use crate::AppState;

pub fn routes() -> Router<Arc<AppState>> {
    Router::new().route("/daily-inspiration", get(daily_inspiration))
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize, Clone)]
pub struct BookIdea {
    pub book: String,
    #[serde(default)]
    pub chapter: Option<String>,
    pub idea: String,
    #[serde(default)]
    pub application: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub weight: Option<f64>,
}

#[derive(Debug, Serialize)]
pub struct DailyInspirationResponse {
    pub book: String,
    pub chapter: Option<String>,
    pub idea: String,
    pub application: Option<String>,
    pub tags: Vec<String>,
    pub alternatives: Vec<DailyInspirationResponse>,
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

/// `GET /api/books/daily-inspiration` — unauthenticated
/// Returns today's deterministic weighted-random book idea + alternatives.
async fn daily_inspiration(
    State(state): State<Arc<AppState>>,
) -> AppResult<Json<DailyInspirationResponse>> {
    let mut all_ideas = load_books_from_disk(&state)?;

    if all_ideas.is_empty() {
        return Err(AppError::BadRequest(
            "no book ideas available — populate data/books/*.json".into(),
        ));
    }

    // Normalize weights: each item gets weight 1.0 if not specified
    for idea in &mut all_ideas {
        if idea.weight.is_none() || idea.weight == Some(0.0) {
            idea.weight = Some(1.0);
        }
    }

    // Calculate days since Unix epoch for deterministic seeding
    let days_since_epoch = {
        use std::time::{SystemTime, UNIX_EPOCH};
        let now = SystemTime::now();
        let duration = now
            .duration_since(UNIX_EPOCH)
            .map_err(|e| AppError::Internal(format!("time error: {e}")))?;
        (duration.as_secs() / 86400) as u64
    };

    // Perform weighted random selection with deterministic seeding
    let selected_idx = weighted_random_selection(&all_ideas, days_since_epoch);
    let selected = all_ideas[selected_idx].clone();

    // Generate alternatives: pick up to 9 more items using sequential RNG seeds
    let mut alternatives = Vec::new();
    let mut used_indices = std::collections::HashSet::new();
    used_indices.insert(selected_idx);

    for i in 1..=9 {
        if used_indices.len() >= all_ideas.len() {
            break;
        }
        let alt_idx = weighted_random_selection(&all_ideas, days_since_epoch + i as u64);
        if !used_indices.contains(&alt_idx) {
            used_indices.insert(alt_idx);
            alternatives.push(all_ideas[alt_idx].clone());
        }
    }

    let response = DailyInspirationResponse {
        book: selected.book,
        chapter: selected.chapter,
        idea: selected.idea,
        application: selected.application,
        tags: selected.tags,
        alternatives: alternatives
            .into_iter()
            .map(|idea| DailyInspirationResponse {
                book: idea.book,
                chapter: idea.chapter,
                idea: idea.idea,
                application: idea.application,
                tags: idea.tags,
                alternatives: vec![],
            })
            .collect(),
    };

    Ok(Json(response))
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Read + parse every `*.json` under the books dir (GROWTH_BOOKS_DIR,
/// default `data/books`). Each file is an array of BookIdea.
fn load_books_from_disk(state: &AppState) -> AppResult<Vec<BookIdea>> {
    use std::path::PathBuf;

    let dir = PathBuf::from(
        state
            .config
            .books_dir
            .clone()
            .unwrap_or_else(|| "data/books".into()),
    );

    let entries = std::fs::read_dir(&dir)
        .map_err(|e| AppError::BadRequest(format!("books dir {:?} unreadable: {e}", dir)))?;

    let mut ideas = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let raw = std::fs::read_to_string(&path)
            .map_err(|e| AppError::BadRequest(format!("read {:?}: {e}", path)))?;
        let parsed: Result<Vec<BookIdea>, _> = serde_json::from_str(&raw);
        match parsed {
            Ok(mut list) => ideas.append(&mut list),
            Err(e) => {
                tracing::warn!("skipping malformed books JSON {:?}: {e}", path);
                continue;
            }
        }
    }

    if ideas.is_empty() {
        return Err(AppError::BadRequest(format!(
            "no book ideas found in {dir:?} — put an array of ideas in a .json file there"
        )));
    }

    Ok(ideas)
}

/// Simple LCG (Linear Congruential Generator) for deterministic randomness.
/// Seeded by days_since_epoch to ensure same pick all day, different each day.
fn simple_rng(seed: u64) -> u64 {
    // Constants from Numerical Recipes
    let a: u64 = 1664525;
    let c: u64 = 1013904223;
    let m: u64 = 2u64.pow(32);
    a.wrapping_mul(seed).wrapping_add(c) % m
}

/// Weighted random selection using deterministic RNG.
/// Normalizes weights across all items, then picks via cumulative distribution.
fn weighted_random_selection(ideas: &[BookIdea], seed: u64) -> usize {
    let total_weight: f64 = ideas
        .iter()
        .filter_map(|idea| idea.weight)
        .sum::<f64>();

    if total_weight <= 0.0 {
        return 0; // Fallback to first if no valid weights
    }

    let rng_value = simple_rng(seed);
    // Normalize RNG output to [0, 1)
    let pick = (rng_value as f64) / (u32::MAX as f64);
    let target = pick * total_weight;

    let mut cumulative = 0.0;
    for (idx, idea) in ideas.iter().enumerate() {
        let weight = idea.weight.unwrap_or(1.0);
        cumulative += weight;
        if cumulative >= target {
            return idx;
        }
    }

    ideas.len().saturating_sub(1)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_deterministic_seeding() {
        let ideas = vec![
            BookIdea {
                book: "Book A".into(),
                chapter: None,
                idea: "Idea A".into(),
                application: None,
                tags: vec![],
                weight: Some(1.0),
            },
            BookIdea {
                book: "Book B".into(),
                chapter: None,
                idea: "Idea B".into(),
                application: None,
                tags: vec![],
                weight: Some(1.0),
            },
        ];

        // Same seed should return same index
        let idx1 = weighted_random_selection(&ideas, 12345);
        let idx2 = weighted_random_selection(&ideas, 12345);
        assert_eq!(idx1, idx2, "Deterministic seeding failed");

        // Different seed might return different index (not guaranteed, but likely with more items)
        let idx3 = weighted_random_selection(&ideas, 54321);
        // We just verify it's a valid index
        assert!(idx3 < ideas.len());
    }

    #[test]
    fn test_weighted_bias() {
        let ideas = vec![
            BookIdea {
                book: "Rare".into(),
                chapter: None,
                idea: "Rare idea".into(),
                application: None,
                tags: vec![],
                weight: Some(0.1), // 10% weight
            },
            BookIdea {
                book: "Common".into(),
                chapter: None,
                idea: "Common idea".into(),
                application: None,
                tags: vec![],
                weight: Some(0.9), // 90% weight
            },
        ];

        // With many seeds, "Common" (index 1) should appear more often
        let mut common_count = 0;
        for seed in 0..100 {
            let idx = weighted_random_selection(&ideas, seed);
            if idx == 1 {
                common_count += 1;
            }
        }
        // Expect roughly 90 out of 100, but allow some variance
        assert!(
            common_count > 50,
            "Weighted selection not working; common appeared {}/100 times",
            common_count
        );
    }
}
