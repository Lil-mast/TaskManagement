import type { z, ZodTypeAny } from 'zod';

import { ContractError } from './errors';

/**
 * Runtime-validate a durable payload. A contract miss becomes an explicit
 * error boundary state, never `undefined` rendered into the UI.
 */
export function parseWire<S extends ZodTypeAny>(
  schema: S,
  data: unknown,
  path: string,
): z.output<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ContractError(path, result.error.issues);
  }
  return result.data;
}
