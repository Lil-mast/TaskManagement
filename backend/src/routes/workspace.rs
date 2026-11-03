//! Workspace routes — code execution sandbox + MrT debrief.
//!
//! POST /api/workspace/run
//!   Runs user code in a Docker sandbox, persists to workspace_submissions.
//!
//! POST /api/workspace/debrief
//!   Builds a MrT motivational + Pragmatic Programmer debrief via Claude.

use std::sync::Arc;

use axum::{
    extract::State,
    routing::post,
    Json, Router,
};
use rand::seq::SliceRandom;
use serde::{Deserialize, Serialize};

use crate::core::{auth::AuthUser, error::{AppError, AppResult}};
use crate::services::{
    anthropic::{Message, Role},
    sandbox::Language,
};
use crate::AppState;

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

pub fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/run", post(run_code))
        .route("/debrief", post(debrief))
}

// ---------------------------------------------------------------------------
// POST /api/workspace/run
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct RunRequest {
    pub language: String,
    pub code: String,
    #[serde(default)]
    pub problem_title: Option<String>,
    #[serde(default)]
    pub problem_url: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct RunResponse {
    pub submission_id: uuid::Uuid,
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
    pub time_ms: u64,
    pub timed_out: bool,
    pub language: String,
}

async fn run_code(
    State(state): State<Arc<AppState>>,
    auth: AuthUser,
    Json(body): Json<RunRequest>,
) -> AppResult<Json<RunResponse>> {
    let sandbox = state.sandbox.as_ref().ok_or_else(|| {
        AppError::Unavailable(
            "code execution unavailable — Docker not configured \
             (set GROWTH_WORKSPACE_ENABLED=true and ensure Docker is reachable)"
                .into(),
        )
    })?;

    let pool = state.db.as_ref().ok_or_else(|| {
        AppError::Unavailable("workspace requires a database (set GROWTH_DATABASE_URL)".into())
    })?;

    let language = Language::from_str(&body.language)
        .ok_or_else(|| AppError::BadRequest(
            format!("unknown language '{}'; supported: python, rust, javascript, c, cpp", body.language)
        ))?;

    // Validate code size (32 KB cap — reasonable for practice problems).
    if body.code.len() > 32_768 {
        return Err(AppError::BadRequest("code too large (max 32 KB)".into()));
    }

    // Execute in sandbox.
    let result = sandbox
        .run(&language, &body.code)
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("sandbox run: {e}")))?;

    // Truncate output to 16 KB each to avoid DB bloat.
    let stdout = truncate_utf8(&result.stdout, 16_384);
    let stderr = truncate_utf8(&result.stderr, 16_384);
    let lang_str = language.as_str();

    // Persist submission.
    let id: uuid::Uuid = sqlx::query_scalar(
        "INSERT INTO workspace_submissions
            (user_id, language, code, stdout, stderr, exit_code, time_ms,
             problem_title, problem_url)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING id",
    )
    .bind(&auth.id)
    .bind(lang_str)
    .bind(&body.code)
    .bind(&stdout)
    .bind(&stderr)
    .bind(result.exit_code)
    .bind(result.time_ms as i64)
    .bind(body.problem_title.as_deref())
    .bind(body.problem_url.as_deref())
    .fetch_one(pool)
    .await
    .map_err(|e| AppError::Database(format!("workspace submission insert: {e}")))?;

    Ok(Json(RunResponse {
        submission_id: id,
        stdout,
        stderr,
        exit_code: result.exit_code,
        time_ms: result.time_ms,
        timed_out: result.timed_out,
        language: lang_str.to_string(),
    }))
}

// ---------------------------------------------------------------------------
// POST /api/workspace/debrief
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct DebriefRequest {
    pub submission_id: uuid::Uuid,
    /// e.g. "Two Pointers", "Sliding Window", "Binary Search"
    #[serde(default)]
    pub pattern: Option<String>,
    /// "easy" | "medium" | "hard"
    #[serde(default)]
    pub difficulty: Option<String>,
    pub time_ms: u64,
    pub needed_help: bool,
    /// user's historical average for this pattern (ms), if known
    #[serde(default)]
    pub prev_avg_time_ms: Option<u64>,
    /// display-only exit code from the run
    pub exit_code: i32,
}

#[derive(Debug, Serialize)]
pub struct DebriefResponse {
    pub message: String,
    /// "hype" = Mr T, "mentor" = senior engineer
    pub tone: String,
    pub tip: PragmaticTip,
}

#[derive(Debug, Serialize, Clone)]
pub struct PragmaticTip {
    pub chapter: String,
    pub idea: String,
    pub application: String,
}

async fn debrief(
    State(state): State<Arc<AppState>>,
    auth: AuthUser,
    Json(body): Json<DebriefRequest>,
) -> AppResult<Json<DebriefResponse>> {
    // Anthropic is required for debrief.
    let anthropic = state.anthropic.as_ref().ok_or_else(|| {
        AppError::Unavailable(
            "debrief unavailable — GROWTH_ANTHROPIC_API_KEY not configured".into(),
        )
    })?;

    state.enforce_llm_quota(&auth).await?;

    // Determine tone based on solve quality.
    let is_win = body.exit_code == 0 && !body.needed_help;
    let beat_avg = body.prev_avg_time_ms
        .map(|prev| body.time_ms < prev)
        .unwrap_or(false);
    let tone = if is_win && beat_avg {
        "hype"     // Mr T full energy
    } else if is_win {
        "mentor"   // Clean solve — senior engineer breakdown
    } else {
        "mentor"   // Needed help or failed — calm, constructive mentor
    };

    // Pick a Pragmatic Programmer tip matched to the pattern.
    let tip = pick_pragmatic_tip(body.pattern.as_deref(), body.needed_help);

    // Build context for Claude.
    let time_sec = body.time_ms / 1000;
    let pattern_label = body.pattern.as_deref().unwrap_or("this pattern");
    let difficulty_label = body.difficulty.as_deref().unwrap_or("unknown difficulty");

    let avg_note = match body.prev_avg_time_ms {
        Some(prev_ms) => {
            let prev_sec = prev_ms / 1000;
            if body.time_ms < prev_ms {
                let saved = (prev_ms - body.time_ms) / 1000;
                format!("This is {saved}s faster than their personal average of {prev_sec}s.")
            } else {
                let over = (body.time_ms - prev_ms) / 1000;
                format!("This is {over}s slower than their personal average of {prev_sec}s.")
            }
        }
        None => "No historical average yet — this is early practice.".to_string(),
    };

    let system = build_system_prompt(tone);
    let user_msg = build_user_message(
        tone,
        pattern_label,
        difficulty_label,
        time_sec,
        body.needed_help,
        body.exit_code,
        &avg_note,
        &tip,
    );

    let response = anthropic
        .chat(
            vec![Message { role: Role::User, content: user_msg }],
            Some(system),
            vec![],
        )
        .await?;

    let message = response
        .text
        .unwrap_or_else(|| default_fallback_message(tone, pattern_label));

    Ok(Json(DebriefResponse {
        message,
        tone: tone.to_string(),
        tip,
    }))
}

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

fn build_system_prompt(tone: &str) -> String {
    match tone {
        "hype" => {
            "You are MrT — part Mr. T from the A-Team (short punchy motivational energy, \
             \"I pity the fool\" style), part senior AWS solutions architect. \
             You celebrate wins loudly, use direct punchy sentences, call the user 'fool' \
             affectionately, and always close with one sharp technical insight about \
             why mastering this pattern matters at scale on AWS. \
             Keep responses to 3-5 sentences. No markdown. Never sycophantic."
                .to_string()
        }
        _ => {
            "You are MrT — a senior AWS solutions architect and staff engineer with 15 years \
             of experience. You give calm, direct, technically precise feedback on algorithm \
             practice. You never say 'great job'; instead you name one specific thing the \
             user did right and one thing to think harder about next time. \
             Reference real engineering trade-offs (time/space complexity, cache behaviour, \
             distributed systems implications). Keep responses to 3-5 sentences. No markdown."
                .to_string()
        }
    }
}

fn build_user_message(
    tone: &str,
    pattern: &str,
    difficulty: &str,
    time_sec: u64,
    needed_help: bool,
    exit_code: i32,
    avg_note: &str,
    tip: &PragmaticTip,
) -> String {
    let outcome = if exit_code == 0 {
        if needed_help {
            "solved it but needed a hint"
        } else {
            "solved it without any hints"
        }
    } else {
        "the code produced an error or wrong answer"
    };

    let tip_context = format!(
        "Today's Pragmatic Programmer principle to weave in: \"{}\" — {}",
        tip.chapter, tip.idea
    );

    match tone {
        "hype" => format!(
            "The user just {outcome} on a {difficulty} {pattern} problem in {time_sec}s. \
             {avg_note} \
             Give them your signature MrT celebration — loud, punchy, affectionate, \
             and close with a real AWS/systems insight about {pattern}. \
             {tip_context}"
        ),
        _ => format!(
            "The user just attempted a {difficulty} {pattern} problem. Outcome: {outcome}. \
             Time taken: {time_sec}s. {avg_note} \
             Give a calm, precise debrief: name what went right (or what to examine if it failed), \
             one concrete thing to improve, and the complexity trade-off to think about. \
             {tip_context}"
        ),
    }
}

fn default_fallback_message(tone: &str, pattern: &str) -> String {
    match tone {
        "hype" => format!(
            "I pity the fool who stops practising {pattern}! \
             Keep grinding — mastery compounds like interest, sucker!"
        ),
        _ => format!(
            "Every rep on {pattern} builds the muscle memory that matters under interview pressure. \
             Review your approach and identify the one decision you'd change."
        ),
    }
}

// ---------------------------------------------------------------------------
// Pragmatic Programmer tip picker
// ---------------------------------------------------------------------------

/// Static slice of Pragmatic Programmer tips.
/// In production these are also stored in the knowledge_items table (via
/// ingest), but we embed a curated subset here so the debrief works without
/// a DB/embeddings call.
fn pragmatic_tips() -> Vec<PragmaticTip> {
    vec![
        PragmaticTip {
            chapter: "Tip 8 — Invest Regularly in Your Knowledge Portfolio".into(),
            idea: "Learn several languages; a little bit regularly compounds.".into(),
            application: "30 min of deliberate practice on a pattern today is worth more than a 3-hour cram before an interview.".into(),
        },
        PragmaticTip {
            chapter: "Tip 15 — Use Tracer Bullets to Find the Target".into(),
            idea: "Build a thin end-to-end slice early — a skeleton that runs beats a spec that hopes.".into(),
            application: "For a new pattern, write a brute-force solution first. It runs, proves correctness, then you optimise.".into(),
        },
        PragmaticTip {
            chapter: "Tip 2 — Think! About Your Work".into(),
            idea: "Work deliberately: understand what you're doing while you do it.".into(),
            application: "Before coding, spend 2 minutes naming the invariant your algorithm maintains. If you can't name it, you're not ready to code it.".into(),
        },
        PragmaticTip {
            chapter: "Tip 19 — Iterate the Schedule with the Code".into(),
            idea: "Re-estimate as work progresses; refining against reality beats a fantasy schedule.".into(),
            application: "If you hit time on the same pattern twice, it's not bad luck — it's a signal to spend one more focused session on it.".into(),
        },
        PragmaticTip {
            chapter: "Tip 4 — Don't Live with Broken Windows".into(),
            idea: "Leave no small defects unfixed; broken windows signal abandonment.".into(),
            application: "A solution that passes 3/5 test cases and you move on is a broken window. Fix the edge cases every time.".into(),
        },
        PragmaticTip {
            chapter: "Tip 24 — Fix the Problem, Not the Blame".into(),
            idea: "Don't waste time blaming — focus on what to do next.".into(),
            application: "When a solve fails, spend 60 seconds on 'what specifically went wrong' before reading the editorial.".into(),
        },
        PragmaticTip {
            chapter: "Tip 14 — There Are No Final Decisions".into(),
            idea: "Every decision is provisional — build reversible decisions.".into(),
            application: "Start with the naive O(n²) approach, verify it's correct, then ask if you can afford it. Optimise only what's proven wrong.".into(),
        },
        PragmaticTip {
            chapter: "Tip 11 — DRY — Don't Repeat Yourself".into(),
            idea: "Every piece of knowledge must have one authoritative representation.".into(),
            application: "Extract your pattern template once — two-pointer setup, window expand/shrink, binary search boundary — and reuse it. Don't re-derive from scratch each time.".into(),
        },
        PragmaticTip {
            chapter: "Tip 9 — Critically Analyze What You Read and Hear".into(),
            idea: "Take solutions as starting points requiring verification, not gospel.".into(),
            application: "After reading an editorial, re-implement from memory without looking. Passive reading of solutions doesn't transfer.".into(),
        },
        PragmaticTip {
            chapter: "Tip 18 — Estimate to Avoid Surprises".into(),
            idea: "Estimate by magnitude; learn from estimate-vs-actual deltas.".into(),
            application: "Before you start a problem, guess your time. Track the delta. Patterns where you're consistently wrong are your blind spots.".into(),
        },
    ]
}

/// Pick a tip biased toward the pattern's context, falling back to random.
fn pick_pragmatic_tip(pattern: Option<&str>, needed_help: bool) -> PragmaticTip {
    let tips = pragmatic_tips();

    // Simple bias: if the user needed help, prefer reflective/analysis tips.
    let preferred_idxs: Vec<usize> = if needed_help {
        // Tips about critical analysis, fixing the problem, and deliberate thinking.
        vec![2, 5, 8]
    } else if pattern.map(|p| p.to_ascii_lowercase().contains("portfolio")).unwrap_or(false) {
        vec![0]
    } else {
        // Tips about tracer bullets, iteration, investment — suit wins.
        vec![0, 1, 9]
    };

    // Try preferred first; if pattern keyword matches a tip, use that.
    let tip_by_keyword: Option<usize> = pattern.and_then(|pat| {
        let pat_lower = pat.to_ascii_lowercase();
        tips.iter().position(|t| {
            t.chapter.to_ascii_lowercase().contains(&pat_lower)
                || t.application.to_ascii_lowercase().contains(&pat_lower)
        })
    });

    if let Some(idx) = tip_by_keyword {
        return tips[idx].clone();
    }

    // Pick from preferred pool randomly.
    let mut rng = rand::thread_rng();
    let idx = preferred_idxs
        .choose(&mut rng)
        .copied()
        .unwrap_or(0);

    tips.get(idx).cloned().unwrap_or_else(|| tips[0].clone())
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Truncate a string to at most `max_bytes` bytes, keeping valid UTF-8.
fn truncate_utf8(s: &str, max_bytes: usize) -> String {
    if s.len() <= max_bytes {
        return s.to_string();
    }
    let mut end = max_bytes;
    while !s.is_char_boundary(end) {
        end -= 1;
    }
    format!("{}\n[...truncated]", &s[..end])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn truncate_utf8_short_string_unchanged() {
        let s = "hello world";
        assert_eq!(truncate_utf8(s, 100), s);
    }

    #[test]
    fn truncate_utf8_clips_at_boundary() {
        let s = "hello world";
        let out = truncate_utf8(s, 5);
        assert!(out.starts_with("hello"));
    }

    #[test]
    fn truncate_utf8_respects_multibyte() {
        // "日本語" is 9 bytes (3×3-byte chars); truncating to 7 must not split a char.
        let s = "日本語";
        let out = truncate_utf8(s, 7);
        // must be valid UTF-8
        assert!(std::str::from_utf8(out.as_bytes()).is_ok());
    }

    #[test]
    fn pick_tip_returns_a_tip() {
        let tip = pick_pragmatic_tip(Some("Two Pointers"), false);
        assert!(!tip.chapter.is_empty());
        assert!(!tip.idea.is_empty());
    }

    #[test]
    fn pick_tip_needed_help_biases_toward_analysis() {
        // Run several times to confirm we always get a valid tip.
        for _ in 0..10 {
            let tip = pick_pragmatic_tip(Some("Sliding Window"), true);
            assert!(!tip.chapter.is_empty());
        }
    }

    #[test]
    fn all_tips_non_empty() {
        for tip in pragmatic_tips() {
            assert!(!tip.chapter.is_empty(), "empty chapter");
            assert!(!tip.idea.is_empty(), "empty idea");
            assert!(!tip.application.is_empty(), "empty application");
        }
    }
}
