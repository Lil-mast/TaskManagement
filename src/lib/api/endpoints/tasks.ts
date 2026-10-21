import { z } from 'zod';

import { apiFetch } from '../client';
import { parseWire } from '../parse';
import {
  taskSchema,
  type CreateTaskInput,
  type Task,
  type TaskStatus,
  type UpdateTaskInput,
} from '../schemas/common';

const TASKS = '/api/tasks';

const taskListSchema = z.array(taskSchema);

export const tasksApi = {
  async list(status: TaskStatus = 'open', signal?: AbortSignal): Promise<Task[]> {
    const payload = await apiFetch<unknown>(TASKS, { query: { status }, signal });
    return parseWire(taskListSchema, payload, `${TASKS}?status=${status}`);
  },

  async create(input: CreateTaskInput): Promise<Task> {
    const payload = await apiFetch<unknown>(TASKS, { method: 'POST', body: input });
    return parseWire(taskSchema, payload, TASKS);
  },

  async update(id: string, input: UpdateTaskInput): Promise<Task> {
    const path = `${TASKS}/${encodeURIComponent(id)}`;
    const payload = await apiFetch<unknown>(path, { method: 'PATCH', body: input });
    return parseWire(taskSchema, payload, path);
  },

  async complete(id: string): Promise<Task> {
    return tasksApi.update(id, { status: 'done' });
  },

  async reopen(id: string): Promise<Task> {
    return tasksApi.update(id, { status: 'open' });
  },

  async archive(id: string): Promise<number> {
    const path = `${TASKS}/${encodeURIComponent(id)}`;
    const payload = await apiFetch<unknown>(path, { method: 'DELETE' });
    return parseWire(z.object({ archived: z.number().int() }).passthrough(), payload, path).archived;
  },

  async purge(id: string): Promise<number> {
    const path = `${TASKS}/${encodeURIComponent(id)}`;
    const payload = await apiFetch<unknown>(path, { method: 'DELETE', query: { purge: true } });
    return parseWire(z.object({ purged: z.number().int() }).passthrough(), payload, path).purged;
  },
};
