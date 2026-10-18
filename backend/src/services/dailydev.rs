//! daily.dev Public API connector.
//! Token stays server-side (`GROWTH_DAILY_DEV_TOKEN`); every feed is cached in
//! the `dailydev_cache` table with a 24h TTL so the API is touched at most
//! once per day per user per feed.

#[cfg(test)]
use serde_json::json;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;

use crate::core::error::{AppError, AppResult};

pub const BASE_URL: &str = "https://api.daily.dev/public/v1";
/// Two supported feeds → respects the cache contract (one row per user+feed).
const FEEDS: [&str; 2] = ["foryou", "discussed"];
const TTL: chrono::Duration = chrono::Duration::hours(24);

// ---------------------------------------------------------------------------
// Normalized feed item
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WatchItem {
    pub id: String,
    pub title: String,
    pub permalink: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pub_time: Option<DateTime<Utc>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub read_time: Option<i64>,
    #[serde(default)]
    pub num_upvotes: i64,
    #[serde(default)]
    pub num_comments: i64,
}

#[derive(Debug, Serialize)]
pub struct DailyDevFeeds {
    pub for_you: Vec<WatchItem>,
    pub discussed: Vec<WatchItem>,
    pub fetched_at: Option<DateTime<Utc>>,
    pub from_cache: bool,
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

#[derive(Clone)]
pub struct DailyDevClient {
    http: reqwest::Client,
    token: Option<String>,
}

impl DailyDevClient {
    pub fn new(token: Option<String>) -> Self {
        Self {
            http: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(30))
                .build()
                .expect("reqwest trivially valid"),
            token: token.filter(|t| !t.trim().is_empty()),
        }
    }

    pub fn is_configured(&self) -> bool {
        self.token.is_some()
    }

    async fn fetch_feed(&self, feed: &str, limit: usize) -> AppResult<Vec<WatchItem>> {
        let token = self
            .token
            .as_ref()
            .ok_or_else(|| AppError::Unavailable("daily.dev token not configured".into()))?;
        let path = match feed {
            "foryou" => "/feeds/foryou",
            "discussed" => "/feeds/discussed?period=1",
            other => return Err(AppError::BadRequest(format!("unknown feed {other:?}"))),
        };
        let url = format!("{BASE_URL}{path}&limit={limit}");
        let raw: serde_json::Value = self
            .http
            .get(&url)
            .bearer_auth(token)
            .send()
            .await
            .map_err(|e| AppError::Upstream(format!("daily.dev fetch failed: {e}")))?
            .error_for_status()
            .map_err(|e| AppError::Upstream(format!("daily.dev status: {e}")))?
            .json()
            .await
            .map_err(|e| AppError::Upstream(format!("daily.dev body invalid: {e}")))?;
        tracing::debug!(%feed, "daily.dev feed fetched");
        Ok(normalize_items(&raw))
    }

    /// Both feeds with cache; the API is touched at most once per 24h/user/feed.
    /// `force = true` bypasses TTL (briefing refresh).
    pub async fn get_feeds_with_cache(
        &self,
        pool: &PgPool,
        user_id: &str,
        force: bool,
    ) -> AppResult<DailyDevFeeds> {
        // 1) read existing cache rows
        let rows = sqlx::query_as::<_, (String, serde_json::Value, DateTime<Utc>)>(
            "SELECT feed, payload, fetched_at FROM dailydev_cache WHERE user_id = $1",
        )
        .bind(user_id)
        .fetch_all(pool)
        .await
        .map_err(|e| AppError::Database(format!("dailydev cache read: {e}")))?;

        let mut cached: std::collections::HashMap<String, (Vec<WatchItem>, DateTime<Utc>)> =
            Default::default();
        for (feed, payload, fetched_at) in rows {
            if let Ok(items) = serde_json::from_value::<Vec<WatchItem>>(payload) {
                cached.insert(feed, (items, fetched_at));
            }
        }

        // 2) decide what needs fetching
        let now = Utc::now();
        let cutoff = now - TTL;
        let mut for_you = Vec::new();
        let mut discussed = Vec::new();
        let mut newest = None::<DateTime<Utc>>;
        let mut any_pulled_fresh = false;

        for feed in FEEDS {
            let cached = cached.get(feed);
            let stale_or_missing = cached
                .map(|(_i, t)| need_refresh(Some(*t), cutoff))
                .unwrap_or(true);
            let items = if stale_or_missing || force {
                let fresh = self.fetch_feed(feed, 10).await.unwrap_or_else(|e| {
                    tracing::error!(feed, error = %e, "daily.dev feed error");
                    Vec::new() // degrade to empty; briefing flags the gap
                });
                // upsert into cache
                let payload = serde_json::to_value(&fresh).unwrap_or_default();
                sqlx::query(
                    "INSERT INTO dailydev_cache (user_id, feed, payload, fetched_at)
                     VALUES ($1, $2, $3, $4)
                     ON CONFLICT (user_id, feed) DO UPDATE
                     SET payload = EXCLUDED.payload, fetched_at = EXCLUDED.fetched_at",
                )
                .bind(user_id)
                .bind(feed)
                .bind(payload)
                .bind(&now)
                .execute(pool)
                .await
                .map_err(|e| AppError::Database(format!("dailydev cache write: {e}")))?;
                any_pulled_fresh = true;
                newest = Some(now);
                fresh
            } else {
                let (items, t) = cached.expect("cached present");
                newest = newest.max(Some(*t));
                items.clone()
            };
            match feed {
                "foryou" => for_you = items,
                "discussed" => discussed = items,
                _ => {}
            }
        }

        Ok(DailyDevFeeds {
            for_you,
            discussed,
            fetched_at: newest,
            from_cache: !any_pulled_fresh,
        })
    }
}

/// Refresh when the cache entry is older than the TTL (or missing).
fn need_refresh(fetched_at: Option<DateTime<Utc>>, cutoff: DateTime<Utc>) -> bool {
    match fetched_at {
        Some(t) => t < cutoff,
        None => true,
    }
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

/// The beta API returns post arrays (shape has moved between fields). Accept
/// the root array or common wrapper keys; degrade to empty rather than fail.
pub fn normalize_items(raw: &serde_json::Value) -> Vec<WatchItem> {
    // root array → items[] → data.items[] (the beta API has shifted shapes)
    let empty = Vec::new();
    let array = raw
        .as_array()
        .or_else(|| raw.get("items").and_then(|v| v.as_array()))
        .or_else(|| raw.pointer("/data/items").and_then(|v| v.as_array()))
        .unwrap_or(&empty);

    let mut out = Vec::with_capacity(array.len());
        for raw_item in array {
            let raw_item = &raw_item;
            let id = str_field(&[
                (raw_item, "id"),
                (raw_item, "postId"),
            ])
            .unwrap_or_else(|| format!("post-{}", out.len() + 1));
            let title = str_field(&[(raw_item, "title")]).unwrap_or_default();
            if title.is_empty() {
                continue;
            }
            let permalink = str_field(&[(raw_item, "permalink"), (raw_item, "url")])
                .unwrap_or_else(|| format!("https://app.daily.dev/posts/{id}"));
            out.push(WatchItem {
                id: id.clone(),
                title,
                permalink,
                source: str_field(&[(raw_item, "source")]),
                pub_time: str_field(&[(raw_item, "createdAt")])
                    .and_then(|s| DateTime::parse_from_rfc3339(&s).ok())
                    .map(|d| d.with_timezone(&Utc)),
                read_time: num_field(&[(raw_item, "readTime"), (raw_item, "read_time")]),
                num_upvotes: num_field(&[
                    (raw_item, "numUpvotes"),
                    (raw_item, "upvotes"),
                    (raw_item, "num_upvotes"),
                ])
                .unwrap_or(0),
                num_comments: num_field(&[
                    (raw_item, "numComments"),
                    (raw_item, "comments"),
                    (raw_item, "num_comments"),
                ])
                .unwrap_or(0),
            });
        }
    out
}

type FieldSpec<'a> = (&'a serde_json::Value, &'a str);

fn str_field(specs: &[FieldSpec<'_>]) -> Option<String> {
    for (obj, key) in specs {
        if let Some(v) = obj.get(*key).and_then(|k| k.as_str()) {
            return Some(v.to_owned());
        }
    }
    None
}

fn num_field(specs: &[FieldSpec<'_>]) -> Option<i64> {
    for (obj, key) in specs {
        if let Some(item) = obj
            .get(*key)
            .and_then(|k| k.as_i64().or_else(|| k.as_str().and_then(|s| s.parse().ok())))
        {
            return Some(item);
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_root_array_shape() {
        let raw = json!([
            { "id": "tr11", "title": "Rust vectors deep dive", "permalink": "https://app.daily.dev/posts/tr11",
              "source": "blog.rust-lang.org", "createdAt": "2026-10-18T06:00:00.000Z",
              "readTime": 7, "numUpvotes": 210, "numComments": 23 }
        ]);
        let out = normalize_items(&raw);
        assert_eq!(out.len(), 1);
        let item = &out[0];
        assert_eq!(item.id, "tr11");
        assert_eq!(item.title, "Rust vectors deep dive");
        assert_eq!(item.num_upvotes, 210);
        assert!(item.pub_time.is_some());
        assert_eq!(item.read_time, Some(7));
    }

    #[test]
    fn parses_nested_items_shape() {
        let raw = json!({ "items": [
            { "postId": "ab12", "title": "Skipping auth pitfalls" },
            { "title": "" } // skipped: empty title
        ]});
        let out = normalize_items(&raw);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].id, "ab12");
        // permalink synthesized from id when absent
        assert_eq!(out[0].permalink, "https://app.daily.dev/posts/ab12");
    }

    #[test]
    fn parses_nested_postid_and_aliases() {
        let raw = json!({ "data": { "items": [
            { "postId": "zz9", "title": "Postgres pitfalls", "url": "https://example.com/x",
              "upvotes": "5", "comments": 2 }
        ]}});
        let out = normalize_items(&raw);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].id, "zz9");
        assert_eq!(out[0].permalink, "https://example.com/x");
        assert_eq!(out[0].num_upvotes, 5); // string-number alias accepted
        assert_eq!(out[0].num_comments, 2);
    }

    #[test]
    fn unknown_shape_degrades_to_empty_not_error() {
        assert!(normalize_items(&json!({ "error": "novel wrapper" })).is_empty());
        assert!(normalize_items(&json!(42)).is_empty());
    }

    #[test]
    fn cache_ttl_staleness() {
        let now = Utc::now();
        // fresh cache entry → no refresh
        assert!(!need_refresh(Some(now - chrono::Duration::minutes(10)), now - TTL));
        // stale (>24h) → refresh
        assert!(need_refresh(Some(now - TTL - chrono::Duration::minutes(1)), now - TTL));
        // missing → refresh
        assert!(need_refresh(None, now - TTL));
    }
}
