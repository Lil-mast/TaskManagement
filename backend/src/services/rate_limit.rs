//! Per-user request budgets.
//!
//! This is deliberately in-process: the app is a single backend instance. If it
//! is ever scaled horizontally, move these buckets to Redis or another shared
//! store so every instance sees the same counters.

use std::{collections::HashMap, time::Instant};

use tokio::sync::Mutex;

struct Bucket {
    tokens: f64,
    last: Instant,
}

/// Token bucket keyed by verified user id. A full bucket allows a short burst;
/// tokens refill continuously at `refill_per_sec`.
pub struct UserRateLimiter {
    buckets: Mutex<HashMap<String, Bucket>>,
    capacity: f64,
    refill_per_sec: f64,
}

impl UserRateLimiter {
    pub fn per_minute(limit: u32) -> Self {
        let limit = limit.max(1) as f64;
        Self::new(limit, limit / 60.0)
    }

    pub fn per_hour(limit: u32) -> Self {
        let limit = limit.max(1) as f64;
        Self::new(limit, limit / 3600.0)
    }

    fn new(capacity: f64, refill_per_sec: f64) -> Self {
        Self {
            buckets: Mutex::new(HashMap::new()),
            capacity,
            refill_per_sec,
        }
    }

    /// Consume one token. Returns the number of seconds until the caller can
    /// try again when the bucket is empty.
    pub async fn check(&self, key: &str) -> Result<(), u64> {
        let mut buckets = self.buckets.lock().await;
        let now = Instant::now();

        // Bound memory for abandoned identities. A full bucket is equivalent to
        // a missing one, so dropping those is lossless.
        if buckets.len() > 10_000 {
            buckets.retain(|_, bucket| {
                let elapsed = now.duration_since(bucket.last).as_secs_f64();
                bucket.tokens + elapsed * self.refill_per_sec < self.capacity - 0.001
            });
        }

        let bucket = buckets.entry(key.to_owned()).or_insert(Bucket {
            tokens: self.capacity,
            last: now,
        });

        let elapsed = now.duration_since(bucket.last).as_secs_f64();
        if elapsed > 0.0 {
            bucket.tokens = (bucket.tokens + elapsed * self.refill_per_sec).min(self.capacity);
            bucket.last = now;
        }

        if bucket.tokens >= 1.0 {
            bucket.tokens -= 1.0;
            return Ok(());
        }

        let wait = ((1.0 - bucket.tokens) / self.refill_per_sec).ceil();
        Err(wait.max(1.0) as u64)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[tokio::test]
    async fn allows_a_burst_then_limits() {
        let limiter = UserRateLimiter::per_minute(2);
        assert!(limiter.check("user-a").await.is_ok());
        assert!(limiter.check("user-a").await.is_ok());
        assert!(limiter.check("user-a").await.is_err());
    }

    #[tokio::test]
    async fn budgets_are_per_user() {
        let limiter = UserRateLimiter::per_minute(1);
        assert!(limiter.check("user-a").await.is_ok());
        assert!(limiter.check("user-a").await.is_err());
        assert!(limiter.check("user-b").await.is_ok());
    }

    #[tokio::test]
    async fn refills_over_time() {
        let limiter = UserRateLimiter::new(1.0, 100.0);
        assert!(limiter.check("user-a").await.is_ok());
        assert!(limiter.check("user-a").await.is_err());
        tokio::time::sleep(Duration::from_millis(20)).await;
        assert!(limiter.check("user-a").await.is_ok());
    }
}
