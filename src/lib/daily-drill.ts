import type { DailyChallenge } from '@/lib/api/schemas/briefing';

/**
 * Saved drills keep the practice surface usable when the LLM is unavailable
 * (for example, an exhausted API quota). The AI-composed drill from the brief
 * always wins when it is present.
 */
const OFFLINE_DRILLS: DailyChallenge[] = [
  {
    title: 'The Longest Budget Window',
    difficulty: 'medium',
    pattern: 'Sliding Window',
    time_limit_min: 25,
    prompt:
      'You are given a list of daily costs and a fixed budget. Find the length of the longest contiguous run of days whose total cost is at most the budget.',
    examples: [
      {
        input: 'costs = [1, 2, 1, 1, 3], budget = 4',
        output: '3',
        explanation: 'The run [1, 2, 1] costs 4, so its length is 3.',
      },
      {
        input: 'costs = [5, 1, 1, 1], budget = 2',
        output: '2',
        explanation: 'The longest run within budget is [1, 1].',
      },
    ],
    constraints: [
      '1 <= costs.length <= 100,000',
      '0 <= costs[i] <= 1,000',
      '0 <= budget <= 1,000,000,000',
    ],
    hints: [
      'The window only ever moves forward. Keep a left and a right pointer.',
      'Expand the right edge, then shrink the left edge while the sum is too large.',
      'After every shrink, the remaining window is valid; update the best length.',
    ],
    approach:
      'Maintain a sliding window with a running sum. Add each cost at the right edge. While the sum exceeds the budget, remove costs from the left edge. Every time the window is valid, compare its length with the best seen so far.',
    complexity: 'O(n) time and O(1) extra space.',
    code: `function longestBudgetWindow(costs: number[], budget: number): number {
  let left = 0;
  let sum = 0;
  let best = 0;

  for (let right = 0; right < costs.length; right++) {
    sum += costs[right];

    while (sum > budget) {
      sum -= costs[left];
      left++;
    }

    best = Math.max(best, right - left + 1);
  }

  return best;
}`,
    language: 'TypeScript',
  },
  {
    title: 'Merge the Meeting Blocks',
    difficulty: 'medium',
    pattern: 'Intervals',
    time_limit_min: 20,
    prompt:
      'Given a list of meeting intervals, merge every pair that overlaps or touches, then return the merged intervals in ascending order.',
    examples: [
      {
        input: 'intervals = [[1,3],[2,6],[8,10],[15,18]]',
        output: '[[1,6],[8,10],[15,18]]',
        explanation: '[1,3] and [2,6] overlap, so they become [1,6].',
      },
      {
        input: 'intervals = [[1,4],[4,5]]',
        output: '[[1,5]]',
        explanation: 'Touching intervals are merged.',
      },
    ],
    constraints: [
      '1 <= intervals.length <= 10,000',
      '0 <= start <= end <= 1,000,000,000',
    ],
    hints: [
      'Sorting by start time makes the overlap decision local.',
      'Keep the last merged interval and compare its end with the next start.',
      'If the next start is greater than the last end, the blocks are separate.',
    ],
    approach:
      'Sort the intervals by start. Walk through them while keeping the last merged interval. If the next interval starts at or before the current end, extend the end to the larger value. Otherwise, start a new block.',
    complexity: 'O(n log n) time for sorting and O(n) space for the result.',
    code: `function mergeBlocks(intervals: number[][]): number[][] {
  if (intervals.length === 0) return [];

  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  const merged: number[][] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const last = merged[merged.length - 1];

    if (current[0] <= last[1]) {
      last[1] = Math.max(last[1], current[1]);
    } else {
      merged.push(current);
    }
  }

  return merged;
}`,
    language: 'TypeScript',
  },
  {
    title: 'The Missing Ledger ID',
    difficulty: 'easy',
    pattern: 'Binary Search',
    time_limit_min: 20,
    prompt:
      'A ledger should contain every integer from 1 through n exactly once, but one ID is missing. Given the remaining IDs in ascending order, return the missing ID. If nothing is missing, return n + 1.',
    examples: [
      {
        input: 'ids = [1, 2, 4, 5, 6]',
        output: '3',
        explanation: 'The sequence skips 3.',
      },
      {
        input: 'ids = [1, 2, 3]',
        output: '4',
        explanation: 'The ledger contains 1 through 3, so the next ID is 4.',
      },
    ],
    constraints: [
      '1 <= ids.length <= 100,000',
      '1 <= ids[i] <= 100,000',
      'ids is sorted in strictly increasing order',
    ],
    hints: [
      'For every index before the gap, ids[i] equals i + 1.',
      'That condition is true for a prefix and false after the missing value.',
      'Binary-search the first index where ids[i] != i + 1.',
    ],
    approach:
      'Use binary search over the index. If ids[mid] equals mid + 1, the missing value is to the right; otherwise it is at mid or to the left. When the search ends, left is the first broken position, and left + 1 is the missing ID.',
    complexity: 'O(log n) time and O(1) extra space.',
    code: `function missingId(ids: number[]): number {
  let left = 0;
  let right = ids.length;

  while (left < right) {
    const mid = Math.floor((left + right) / 2);

    if (ids[mid] === mid + 1) {
      left = mid + 1;
    } else {
      right = mid;
    }
  }

  return left + 1;
}`,
    language: 'TypeScript',
  },
  {
    title: 'Shortest Path Through Rooms',
    difficulty: 'medium',
    pattern: 'Breadth-First Search',
    time_limit_min: 25,
    prompt:
      'A building is represented as a grid. Open rooms are 0 and walls are 1. Starting at the top-left room, find the minimum number of moves needed to reach the bottom-right room using four-directional movement. Return -1 if the exit is unreachable.',
    examples: [
      {
        input: 'rooms = [[0,0,0],[1,1,0],[0,0,0]]',
        output: '4',
        explanation: 'Move right twice, down twice. The middle row is blocked.',
      },
      {
        input: 'rooms = [[0,1],[1,0]]',
        output: '-1',
        explanation: 'The exit is isolated by walls.',
      },
    ],
    constraints: [
      '1 <= rooms.length, rooms[0].length <= 200',
      'rooms[i][j] is 0 or 1',
      'Start and exit may themselves be walls',
    ],
    hints: [
      'Every move has the same cost, so breadth-first search gives the shortest path.',
      'Store the distance with each queue entry instead of a separate map.',
      'Mark a room visited as soon as it enters the queue.',
    ],
    approach:
      'Run BFS from the start. Each queue entry carries a row, column, and distance. Skip walls, out-of-bounds cells, and cells already visited. Return the distance when the exit is dequeued, or -1 when the queue is empty.',
    complexity: 'O(rows × columns) time and O(rows × columns) space.',
    code: `function shortestPath(rooms: number[][]): number {
  const rows = rooms.length;
  const cols = rooms[0].length;
  if (rooms[0][0] === 1 || rooms[rows - 1][cols - 1] === 1) return -1;

  const queue: Array<[number, number, number]> = [[0, 0, 0]];
  const seen = new Set<string>(['0,0']);
  const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  for (let head = 0; head < queue.length; head++) {
    const [row, col, distance] = queue[head];

    if (row === rows - 1 && col === cols - 1) return distance;

    for (const [dr, dc] of directions) {
      const nextRow = row + dr;
      const nextCol = col + dc;
      const key = nextRow + ',' + nextCol;

      if (
        nextRow < 0 || nextRow >= rows ||
        nextCol < 0 || nextCol >= cols ||
        rooms[nextRow][nextCol] === 1 ||
        seen.has(key)
      ) {
        continue;
      }

      seen.add(key);
      queue.push([nextRow, nextCol, distance + 1]);
    }
  }

  return -1;
}`,
    language: 'TypeScript',
  },
  {
    title: 'Rebuild the Dependency Order',
    difficulty: 'medium',
    pattern: 'Topological Sort',
    time_limit_min: 25,
    prompt:
      'You have n tasks and a list of prerequisite pairs. A pair [a, b] means task b must be completed before task a. Return any valid completion order for all tasks, or an empty array if the dependencies contain a cycle.',
    examples: [
      {
        input: 'n = 4, prerequisites = [[1,0],[2,1],[3,2]]',
        output: '[0,1,2,3]',
        explanation: 'Each task depends on the one before it.',
      },
      {
        input: 'n = 2, prerequisites = [[0,1],[1,0]]',
        output: '[]',
        explanation: 'The two tasks depend on each other.',
      },
    ],
    constraints: [
      '1 <= n <= 10,000',
      '0 <= prerequisites.length <= 50,000',
      'prerequisite pairs refer to tasks 0 through n - 1',
    ],
    hints: [
      'Count how many prerequisites each task has.',
      'Start with every task whose prerequisite count is zero.',
      'Removing a task reduces the count of the tasks that depend on it.',
    ],
    approach:
      'Build an adjacency list and an indegree count. Put every zero-indegree task into a queue. Repeatedly remove a task, append it to the order, and decrement the indegree of its dependents. If the order contains all n tasks, return it; otherwise a cycle exists.',
    complexity: 'O(n + e) time and O(n + e) space, where e is the number of prerequisite pairs.',
    code: `function dependencyOrder(n: number, prerequisites: number[][]): number[] {
  const graph: number[][] = Array.from({ length: n }, () => []);
  const indegree = new Array<number>(n).fill(0);

  for (const [task, before] of prerequisites) {
    graph[before].push(task);
    indegree[task]++;
  }

  const queue: number[] = [];
  for (let task = 0; task < n; task++) {
    if (indegree[task] === 0) queue.push(task);
  }

  const order: number[] = [];
  for (let head = 0; head < queue.length; head++) {
    const task = queue[head];
    order.push(task);

    for (const next of graph[task]) {
      indegree[next]--;
      if (indegree[next] === 0) queue.push(next);
    }
  }

  return order.length === n ? order : [];
}`,
    language: 'TypeScript',
  },
];

function dateKey(value?: string): string {
  if (value) return value.slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

export function offlineDrillForDate(value?: string): DailyChallenge {
  const key = dateKey(value);
  let hash = 0;
  for (const character of key) {
    hash = (hash * 31 + character.charCodeAt(0)) | 0;
  }
  return OFFLINE_DRILLS[Math.abs(hash) % OFFLINE_DRILLS.length];
}
