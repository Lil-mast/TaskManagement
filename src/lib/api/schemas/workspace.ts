import { z } from 'zod';

// ---------------------------------------------------------------------------
// Supported languages
// ---------------------------------------------------------------------------

export const workspaceLanguages = ['python', 'rust', 'javascript', 'c', 'cpp'] as const;
export type WorkspaceLanguage = (typeof workspaceLanguages)[number];

export const languageLabels: Record<WorkspaceLanguage, string> = {
  python: 'PY',
  rust: 'RS',
  javascript: 'JS',
  c: 'C',
  cpp: 'C++',
};

export const languageFullNames: Record<WorkspaceLanguage, string> = {
  python: 'Python',
  rust: 'Rust',
  javascript: 'JavaScript',
  c: 'C',
  cpp: 'C++',
};

// ---------------------------------------------------------------------------
// POST /api/workspace/run
// ---------------------------------------------------------------------------

export interface RunRequest {
  language: WorkspaceLanguage;
  code: string;
  problem_title?: string;
  problem_url?: string;
}

export const runResultSchema = z
  .object({
    submission_id: z.string().uuid(),
    stdout: z.string(),
    stderr: z.string(),
    exit_code: z.number().int(),
    time_ms: z.number(),
    timed_out: z.boolean(),
    language: z.string(),
  })
  .passthrough();

export type RunResult = z.infer<typeof runResultSchema>;

// ---------------------------------------------------------------------------
// POST /api/workspace/debrief
// ---------------------------------------------------------------------------

export interface DebriefRequest {
  submission_id: string;
  pattern?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  time_ms: number;
  needed_help: boolean;
  prev_avg_time_ms?: number;
  exit_code: number;
}

export const pragmaticTipSchema = z
  .object({
    chapter: z.string(),
    idea: z.string(),
    application: z.string(),
  })
  .passthrough();

export const debriefResultSchema = z
  .object({
    message: z.string(),
    /** "hype" = Mr T energy, "mentor" = senior engineer tone */
    tone: z.enum(['hype', 'mentor']),
    tip: pragmaticTipSchema,
  })
  .passthrough();

export type PragmaticTip = z.infer<typeof pragmaticTipSchema>;
export type DebriefResult = z.infer<typeof debriefResultSchema>;

// ---------------------------------------------------------------------------
// Default starter snippets per language
// Two-pointer template — a common starting point for LeetCode practice.
// ---------------------------------------------------------------------------

export const defaultSnippets: Record<WorkspaceLanguage, string> = {
  python: `# Two Pointers template
def solve(nums: list[int]) -> int:
    left, right = 0, len(nums) - 1

    while left < right:
        # TODO: implement your logic
        left += 1
        right -= 1

    return 0


# Quick test
if __name__ == "__main__":
    print(solve([1, 2, 3, 4, 5]))
`,

  rust: `// Two Pointers template
fn solve(nums: &[i32]) -> i32 {
    let (mut left, mut right) = (0usize, nums.len().saturating_sub(1));

    while left < right {
        // TODO: implement your logic
        left += 1;
        right -= 1;
    }

    0
}

fn main() {
    let nums = vec![1, 2, 3, 4, 5];
    println!("{}", solve(&nums));
}
`,

  javascript: `// Two Pointers template
function solve(nums) {
  let left = 0;
  let right = nums.length - 1;

  while (left < right) {
    // TODO: implement your logic
    left++;
    right--;
  }

  return 0;
}

// Quick test
console.log(solve([1, 2, 3, 4, 5]));
`,

  c: `/* Two Pointers template */
#include <stdio.h>

int solve(int *nums, int n) {
    int left = 0, right = n - 1;

    while (left < right) {
        /* TODO: implement your logic */
        left++;
        right--;
    }

    return 0;
}

int main(void) {
    int nums[] = {1, 2, 3, 4, 5};
    printf("%d\\n", solve(nums, 5));
    return 0;
}
`,

  cpp: `// Two Pointers template
#include <iostream>
#include <vector>
using namespace std;

int solve(vector<int>& nums) {
    int left = 0, right = (int)nums.size() - 1;

    while (left < right) {
        // TODO: implement your logic
        left++;
        right--;
    }

    return 0;
}

int main() {
    vector<int> nums = {1, 2, 3, 4, 5};
    cout << solve(nums) << endl;
    return 0;
}
`,
};
