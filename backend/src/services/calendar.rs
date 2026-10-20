//! Sync: Google Calendar → `calendar_events` mirror (user-triggered and from
//! the briefing job). Only titles + timestamps cross over; attendee emails are
//! never requested, never persisted (PHASE_3 profile handling).

use chrono::{DateTime, Duration, Utc};
use sqlx::PgPool;

use super::crypto::TokenCrypto;
use super::google::GoogleClient;
use crate::core::error::{AppError, AppResult};

pub const SYNC_HORIZON_DAYS: i64 = 7;

pub struct CalendarService {
    google: GoogleClient,
    crypto: TokenCrypto,
}

impl CalendarService {
    pub fn new(google: GoogleClient, crypto: TokenCrypto) -> Self {
        Self { google, crypto }
    }

    pub fn is_configured(&self) -> bool {
        self.google.is_configured()
    }

    pub fn consent_url(&self, user_id: &str) -> String {
        self.google.consent_url(&self.crypto, "google", user_id)
    }

    /// Validate the signed OAuth state; returns `(provider, user_id)`.
    pub fn verify_state(&self, state: &str) -> Option<(String, String)> {
        self.crypto.verify_state(state)
    }

    pub async fn exchange_code(
        &self,
        code: &str,
        state_user_id: &str,
        pool: &PgPool,
    ) -> AppResult<()> {
        self.google
            .exchange_code(
                code,
                &self.crypto,
                "google",
                vec![super::google::CALENDAR_SCOPE.into()],
                state_user_id,
                pool,
            )
            .await
    }

    /// Pull the next-7-day window and upsert every event into the mirror.
    /// Returns the number of events seen for the window.
    pub async fn sync(&self, pool: &PgPool, user_id: &str) -> AppResult<usize> {
        let token = self
            .google
            .get_valid_token(pool, &self.crypto, user_id, "google")
            .await?;
        let now = Utc::now();
        let events = self
            .google
            .list_events(&token, now, now + Duration::days(SYNC_HORIZON_DAYS))
            .await?;

        let mut stored = 0;
        for ev in &events {
            let Some((start, end)) = ev.times() else {
                continue; // malformed time — skip, never poison the mirror
            };
            sqlx::query(
                "INSERT INTO calendar_events
                   (user_id, event_id, title, start_at, end_at, busy, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, NOW())
                 ON CONFLICT (user_id, event_id) DO UPDATE
                 SET title = EXCLUDED.title,
                     start_at = EXCLUDED.start_at,
                     end_at = EXCLUDED.end_at,
                     busy = EXCLUDED.busy,
                     updated_at = NOW()",
            )
            .bind(user_id)
            .bind(&ev.id)
            .bind(ev.title().trim().to_string())
            .bind(&start)
            .bind(&end)
            .bind(ev.is_busy())
            .execute(pool)
            .await
            .map_err(|e| AppError::Database(format!("event upsert: {e}")))?;
            stored += 1;
        }
        Ok(stored)
    }

    /// Disconnect: revoke at Google (best-effort), then clear token + mirror.
    /// Returns whether a token row existed.
    pub async fn disconnect(&self, pool: &PgPool, user_id: &str) -> AppResult<bool> {
        let enc: Option<Vec<u8>> = sqlx::query_scalar(
            "SELECT access_token_enc FROM integrations
             WHERE user_id = $1 AND provider = 'google'",
        )
        .bind(user_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| AppError::Database(format!("token read: {e}")))?;
        if let Some(enc) = enc {
            if let Ok(token) = self.crypto.decrypt_for_user(user_id, &enc) {
                self.google.revoke(&token).await;
            }
        }
        let deleted = sqlx::query(
            "DELETE FROM integrations WHERE user_id = $1 AND provider = 'google'",
        )
        .bind(user_id)
        .execute(pool)
        .await
        .map_err(|e| AppError::Database(format!("token delete: {e}")))?;
        sqlx::query("DELETE FROM calendar_events WHERE user_id = $1")
            .bind(user_id)
            .execute(pool)
            .await
            .map_err(|e| AppError::Database(format!("events delete: {e}")))?;
        Ok(deleted.rows_affected() > 0)
    }

    /// Read the mirrored window (no network) — briefing + plan + frontend all read
    /// this cache; sync first for freshness.
    pub async fn mirrored_events(
        pool: &PgPool,
        user_id: &str,
        from: DateTime<Utc>,
        to: DateTime<Utc>,
    ) -> AppResult<Vec<StoredEvent>> {
        sqlx::query_as::<_, StoredEvent>(
            "SELECT event_id, title, start_at, end_at, busy
             FROM calendar_events
             WHERE user_id = $1 AND start_at >= $2 AND start_at < $3
             ORDER BY start_at",
        )
        .bind(user_id)
        .bind(&from)
        .bind(&to)
        .fetch_all(pool)
        .await
        .map_err(|e| AppError::Database(format!("mirror read: {e}")))
    }
}

/// One mirrored event (DB row shape).
#[derive(Debug, Clone, serde::Serialize, sqlx::FromRow)]
pub struct StoredEvent {
    pub event_id: String,
    pub title: String,
    pub start_at: DateTime<Utc>,
    pub end_at: DateTime<Utc>,
    pub busy: bool,
}
