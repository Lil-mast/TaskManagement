import type { ZodType } from 'zod';

import { ContractError } from './errors';

/**
 * Runtime-validate a durable payload. A contract miss becomes an explicit
 * error boundary state, never `undefined` rendered into the UI.
 */
export function parseWire<T>(schema: ZodType<T>, data: unknown, path: string): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ContractError(path, result.error.issues);
  }
  return result.data;
}
