import type { Request } from 'express';

type HeaderValue = string | undefined;

/**
 * Creates a minimal Express Request mock that only supports `header(name)`.
 *
 * The real Express `Request` type is huge. For controller unit tests we only
 * need `header()`, but the controller signatures often require a full `Request`.
 *
 * To keep tests strict (no `any`) while still satisfying the signature, we
 * build a tiny object and cast through `unknown`.
 */
export function createMockRequest(headers: Record<string, string>): Request {
  const normalized = new Map<string, string>();
  for (const [k, v] of Object.entries(headers)) normalized.set(k.toLowerCase(), v);

  const header = (name: string): HeaderValue => normalized.get(name.toLowerCase());
  return { header } as unknown as Request;
}
