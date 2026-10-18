//! proposal binding to unscheduled Schedule-quadrant tasks. Nothing here
//! writes to the matrix: proposals stay proposals (human-in-the-loop).

use chrono::{DateTime, Datelike, Duration, TimeZone, Utc};
/// Working-hours window per day. Override knobs live in env later; these are
/// the documented defaults (PHASE_3 §3).
#[derive(Debug, Clone, Copy)]
pub struct PlanConfig {
    /// inclusive hour the workday blocks (09:00)
    pub day_start_hour: u32,
    /// exclusive hour the workday blocks (18:00)
    pub day_end_hour: u32,
    /// minimum gap worth proposing (a focus block)
    pub min_focus_minutes: i64,
}

impl Default for PlanConfig {
    fn default() -> Self {
        Self { day_start_hour: 9, day_end_hour: 18, min_focus_minutes: 90 }
    }
}

/// A mirrored event flattened to planning input.
#[derive(Debug, Clone)]
pub struct BusyBlock {
    pub start: DateTime<Utc>,
    pub end: DateTime<Utc>,
    pub busy: bool,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct Gap {
    pub start: DateTime<Utc>,
    pub end: DateTime<Utc>,
    pub minutes: i64,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct Suggestion {
    pub task_id: uuid::Uuid,
    pub title: String,
    pub suggested_start: DateTime<Utc>,
    pub duration_minutes: i64,
    pub why: String,
}

/// Working day windows (UTC construction per calendar day between from/to).
fn work_windows(
    from: DateTime<Utc>,
    to: DateTime<Utc>,
    cfg: &PlanConfig,
) -> Vec<(DateTime<Utc>, DateTime<Utc>)> {
    let mut windows = Vec::new();
    let mut day = normalize_day(from);
    while day < to {
        if let Some(ws) = Utc
            .with_ymd_and_hms(day.year(), day.month(), day.day(), cfg.day_start_hour.min(23), 0, 0)
            .single()
        {
            if let Some(we) = Utc
                .with_ymd_and_hms(day.year(), day.month(), day.day(), cfg.day_end_hour.min(23), 0, 0)
                .single()
            {
                if we > ws {
                    let (s, e) = (ws.max(from), we.min(to));
                    if e > s {
                        windows.push((s, e));
                    }
                }
            }
        }
        day += Duration::days(1);
    }
    windows
}

fn normalize_day(t: DateTime<Utc>) -> DateTime<Utc> {
    let day = Utc
        .with_ymd_and_hms(t.year(), t.month(), t.day(), 0, 0, 0)
        .single()
        .unwrap_or(t);
    day
}

/// Merge overlapping/adjacent busy blocks (free events excluded upstream).
pub fn merge_busy(mut blocks: Vec<(DateTime<Utc>, DateTime<Utc>)>) -> Vec<(DateTime<Utc>, DateTime<Utc>)> {
    blocks.sort();
    let mut merged: Vec<(DateTime<Utc>, DateTime<Utc>)> = Vec::with_capacity(blocks.len());
    for (s, e) in blocks {
        if e <= s {
            continue;
        }
        match merged.last_mut() {
            Some((_, last_end)) if s <= *last_end => {
                if e > *last_end {
                    *last_end = e;
                }
            }
            _ => merged.push((s, e)),
        }
    }
    merged
}

/// Free intervals ≥ `min_focus_minutes` inside working windows.
pub fn compute_gaps(
    blocks: &[BusyBlock],
    from: DateTime<Utc>,
    to: DateTime<Utc>,
    cfg: &PlanConfig,
) -> Vec<Gap> {
    let busy: Vec<(DateTime<Utc>, DateTime<Utc>)> = blocks
        .iter()
        .filter(|b| b.busy)
        .map(|b| (b.start, b.end))
        .collect();
    let merged = merge_busy(busy);

    let mut gaps = Vec::new();
    for (ws, we) in work_windows(from, to, cfg) {
        let mut cursor = ws;
        for (bs, be) in &merged {
            // window fully inside this event?
            if *be <= ws || *bs >= we {
                continue;
            }
            if let Some(gap_end) = Some((*bs).min(we)) {
                if gap_end > cursor {
                    push_gap(&mut gaps, cursor, gap_end, cfg);
                }
            }
            if *be > cursor {
                cursor = (*be).max(cursor);
            }
            if cursor >= we {
                break;
            }
        }
        if we > cursor {
            push_gap(&mut gaps, cursor, we, cfg);
        }
    }
    gaps
}

fn push_gap(out: &mut Vec<Gap>, start: DateTime<Utc>, end: DateTime<Utc>, cfg: &PlanConfig) {
    let minutes = (end - start).num_minutes();
    if minutes >= cfg.min_focus_minutes {
        out.push(Gap { start, end, minutes });
    }
}

/// Bind unscheduled Schedule-quadrant tasks to gaps, greedily: each task gets
/// the biggest remaining gap (whole-gap honest, capped at 120 min). Proposals
/// only — nothing touches the matrix.
pub fn suggest_schedule(
    gaps: &[Gap],
    tasks: &[(uuid::Uuid, String)],
) -> Vec<Suggestion> {
    let mut out = Vec::new();
    let mut gaps: Vec<Gap> = gaps.to_vec();
    gaps.sort_by(|a, b| b.minutes.cmp(&a.minutes)); // best real estate first

    for (task_id, title) in tasks {
        let Some(gap) = gaps.first_mut() else { break };
        let duration = gap.minutes.min(120).max(30);
        let why = if gap.minutes >= 180 {
            "best long free block this week"
        } else if gap.minutes >= 120 {
            "solid free block — good focus window"
        } else {
            "last gap big enough for one deep task"
        };
        out.push(Suggestion {
            task_id: *task_id,
            title: title.clone(),
            suggested_start: gap.start,
            duration_minutes: duration,
            why: why.to_string(),
        });
        gaps.remove(0); // one proposal per gap
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn at(y: i32, mo: u32, d: u32, h: u32, mi: u32) -> DateTime<Utc> {
        Utc.with_ymd_and_hms(y, mo, d, h, mi, 0).unwrap()
    }

    fn cfg() -> PlanConfig {
        PlanConfig { day_start_hour: 9, day_end_hour: 18, min_focus_minutes: 90 }
    }

    #[test]
    fn full_free_day_gives_one_gap() {
        let gaps = compute_gaps(&[], at(2026, 10, 19, 0, 0), at(2026, 10, 19, 23, 0), &cfg());
        assert_eq!(gaps.len(), 1);
        assert_eq!(gaps[0].start, at(2026, 10, 19, 9, 0));
        assert_eq!(gaps[0].end, at(2026, 10, 19, 18, 0));
        assert_eq!(gaps[0].minutes, 540);
    }

    #[test]
    fn meeting_splits_the_day() {
        let blocks = vec![BusyBlock {
            start: at(2026, 10, 19, 10, 0),
            end: at(2026, 10, 19, 12, 30),
            busy: true,
        }];
        let gaps = compute_gaps(&blocks, at(2026, 10, 19, 0, 0), at(2026, 10, 19, 23, 0), &cfg());
        // 9:00–10:00 is 60 min < 90 focus minimum → only the long gap survives
        assert_eq!(gaps.len(), 1);
        assert_eq!(gaps[0].start, at(2026, 10, 19, 12, 30));
        assert_eq!(gaps[0].end, at(2026, 10, 19, 18, 0));
    }

    #[test]
    fn overlapping_events_merge() {
        let blocks = vec![
            BusyBlock { start: at(2026, 10, 19, 10, 0), end: at(2026, 10, 19, 13, 0), busy: true },
            BusyBlock { start: at(2026, 10, 19, 11, 0), end: at(2026, 10, 19, 14, 0), busy: true },
            BusyBlock { start: at(2026, 10, 19, 10, 30), end: at(2026, 10, 19, 12, 0), busy: true },
        ];
        let gaps = compute_gaps(&blocks, at(2026, 10, 19, 0, 0), at(2026, 10, 19, 23, 0), &cfg());
        let gap = gaps.iter().find(|g| g.start == at(2026, 10, 19, 14, 0)).unwrap();
        assert_eq!(gap.end, at(2026, 10, 19, 18, 0));
    }

    #[test]
    fn transparent_events_never_block() {
        let blocks = vec![BusyBlock {
            start: at(2026, 10, 19, 10, 0),
            end: at(2026, 10, 19, 12, 0),
            busy: false,
        }];
        let gaps = compute_gaps(&blocks, at(2026, 10, 19, 0, 0), at(2026, 10, 19, 23, 0), &cfg());
        assert_eq!(gaps.len(), 1);
        assert_eq!(gaps[0].minutes, 540);
    }

    #[test]
    fn suggestions_go_biggest_gap_first() {
        let gaps = vec![
            Gap { start: at(2026, 10, 19, 9, 0), end: at(2026, 10, 19, 11, 0), minutes: 120 },
            Gap { start: at(2026, 10, 20, 14, 0), end: at(2026, 10, 20, 18, 0), minutes: 240 },
        ];
        let s = suggest_schedule(&gaps, &[(uuid::Uuid::nil(), "Rewrite report".into())]);
        assert_eq!(s.len(), 1);
        assert_eq!(s[0].suggested_start, at(2026, 10, 20, 14, 0));
        assert_eq!(s[0].duration_minutes, 120); // capped from 240
    }

    #[test]
    fn short_gaps_are_not_proposed() {
        let blocks = vec![BusyBlock {
            start: at(2026, 10, 19, 9, 0),
            end: at(2026, 10, 19, 17, 30),
            busy: true,
        }];
        let gaps = compute_gaps(&blocks, at(2026, 10, 19, 0, 0), at(2026, 10, 19, 23, 0), &cfg());
        assert!(gaps.is_empty()); // 30 min < 90 focus block
    }
}
