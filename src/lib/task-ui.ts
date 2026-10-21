import { format, isBefore, isToday, isTomorrow, parseISO, startOfDay } from 'date-fns';

import type { Confidence, Priority, Task } from '@/lib/api/schemas/common';
import { ApiError } from '@/lib/api/errors';

export const PRIORITY_ORDER: Priority[] = ['now', 'schedule', 'delegate', 'drop'];

export const PRIORITY_LABEL: Record<Priority, string> = {
  now: 'Now',
  schedule: 'Schedule',
  delegate: 'Delegate',
  drop: 'Drop',
};

export const PRIORITY_NOTE: Record<Priority, string> = {
  now: 'Crises and deadlines. Do it today.',
  schedule: 'Growth and principles. Put it on the calendar.',
  delegate: 'Interruptions. Hand it off or quash it.',
  drop: 'Trivial. Name it and let it go.',
};

export function taskConfidence(task: Task): Confidence | null {
  const raw = task.meta?.confidence;
  return raw === 'high' || raw === 'medium' || raw === 'low' ? raw : null;
}

export function sourceLabel(source: string): string {
  const labels: Record<string, string> = {
    user: 'Manual',
    manual: 'Manual',
    ai_briefing: 'Brief',
    gmail: 'Gmail',
    dailydev: 'Daily.dev',
    leetcode: 'Prep',
    nl_capture: 'Capture',
  };
  return labels[source] ?? source;
}

export function sourceClass(source: string): string {
  return `source-pip source-pip--${source.replace(/[^a-z0-9_-]/gi, '').toLowerCase() || 'other'}`;
}

export function dueLabel(dueDate: string | null | undefined): string {
  if (!dueDate) return 'NO DATE';
  const date = parseISO(dueDate);
  if (isToday(date)) return 'TODAY';
  if (isTomorrow(date)) return 'TOMORROW';
  return format(date, 'EEE dd MMM').toUpperCase();
}

export function isOverdue(dueDate: string | null | undefined): boolean {
  if (!dueDate) return false;
  return isBefore(parseISO(dueDate), startOfDay(new Date()));
}

export function createdLabel(iso: string): string {
  return format(parseISO(iso), 'dd MMM yyyy').toUpperCase();
}

export function completedLabel(iso: string | null | undefined): string {
  if (!iso) return '—';
  return format(parseISO(iso), 'dd MMM yyyy · HH:mm');
}

export function parseTags(value: string): string[] {
  const seen = new Set<string>();
  for (const raw of value.split(/[,\n]/)) {
    const tag = raw.trim().replace(/^#/, '');
    if (tag) seen.add(tag);
  }
  return [...seen].slice(0, 12);
}

export function tagsText(tags: string[]): string {
  return tags.join(', ');
}

export function describeApiError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Your session expired. Sign in again.';
    if (error.status === 429) {
      const wait = error.retryAfter ? ` Try again in ${error.retryAfter}s.` : ' Try again shortly.';
      return `${error.message}${wait}`;
    }
    if (error.status === 503) return error.message || 'This service is temporarily unavailable.';
    if (error.status === 0) return error.message;
    return error.message || `Request failed (${error.status || 'network'}).`;
  }
  return error instanceof Error ? error.message : 'Something went wrong.';
}

export function taskCounts(tasks: Task[]): Record<Priority, number> {
  return {
    now: tasks.filter((task) => task.priority === 'now').length,
    schedule: tasks.filter((task) => task.priority === 'schedule').length,
    delegate: tasks.filter((task) => task.priority === 'delegate').length,
    drop: tasks.filter((task) => task.priority === 'drop').length,
  };
}
