import { z } from 'zod';

export const PRIORITIES = ['now', 'schedule', 'delegate', 'drop'] as const;
export const TASK_STATUSES = ['open', 'done', 'archived'] as const;
export const CONFIDENCES = ['high', 'medium', 'low'] as const;

export const prioritySchema = z.enum(PRIORITIES);
export const taskStatusSchema = z.enum(TASK_STATUSES);
export const confidenceSchema = z.enum(CONFIDENCES);

export type Priority = z.infer<typeof prioritySchema>;
export type TaskStatus = z.infer<typeof taskStatusSchema>;
export type Confidence = z.infer<typeof confidenceSchema>;

/** `YYYY-MM-DD` — Postgres DATE / chrono NaiveDate. */
export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

/** RFC3339 from chrono; accepts both `Z` and `+00:00`. */
export const isoDateTimeSchema = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), 'expected an RFC3339 timestamp');

export const idSchema = z.string().min(1);

export const taskSchema = z
  .object({
    id: idSchema,
    user_id: z.string(),
    title: z.string(),
    description: z.string().nullable().optional(),
    priority: prioritySchema,
    status: taskStatusSchema,
    due_date: isoDateSchema.nullable().optional(),
    completed_at: isoDateTimeSchema.nullable().optional(),
    source: z.string(),
    meta: z.record(z.unknown()).default({}),
    tags: z
      .array(z.string())
      .nullable()
      .optional()
      .transform((value) => value ?? []),
    created_at: isoDateTimeSchema,
  })
  .passthrough();

export type Task = z.infer<typeof taskSchema>;

export interface CreateTaskInput {
  title: string;
  description?: string;
  priority: Priority;
  due_date?: string;
  tags?: string[];
  source?: string;
}

export interface UpdateTaskInput {
  title?: string;
  /** `null` clears the description (backend tri-state patch). */
  description?: string | null;
  priority?: Priority;
  status?: TaskStatus;
  /** `null` clears the due date (backend tri-state patch). */
  due_date?: string | null;
  /** `[]` clears tags. */
  tags?: string[];
}
