-- ============================================================================
-- 0008 — DROP SPA LEGACY TABLES (Phase 6 §7, destructive — deliberate act)
-- ============================================================================
-- Per the recorded decision (2026-10-19): the consolidated DB eliminates
-- tables that contradict the agents' functions. These six were created
-- outside the backend (SPA streaks/notifications era), no DB trigger and no
-- deployed edge function reads them anymore (verified: public triggers = 0,
-- supabase/functions are not deployed), and none is referenced by backend
-- code paths.
--
-- Data note (reset path): `user_streaks` is derivable from
-- tasks.completed_at; `motivation_quotes` (10 rows) can re-enter the corpus
-- as knowledge items on request. Nothing else holds unique content.
--
-- CONSEQUENCE: SPA-side streak/quote/notification reads (src/lib/streaks.ts
-- and dormant edge functions) stop working. That is the consolidation the
-- user asked for; the SPA handover will remove those call sites.
--
-- Apply only after user confirmation:
--   cargo run --bin apply_migration -- migrations/0008_drop_spa_legacy.sql
-- ============================================================================

DROP TABLE IF EXISTS task_completions CASCADE;
DROP TABLE IF EXISTS user_streaks CASCADE;
DROP TABLE IF EXISTS user_notifications CASCADE;
DROP TABLE IF EXISTS monthly_reports CASCADE;
DROP TABLE IF EXISTS motivation_quotes CASCADE;
DROP TABLE IF EXISTS task_trash CASCADE;
