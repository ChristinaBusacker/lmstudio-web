import { getRecord, getString, isRecord } from './typed-access';

export function toErrorMessage(err: unknown, fallback = 'Unknown error'): string {
  if (typeof err === 'string') return err;

  const root = getRecord(err);
  if (!root) return fallback;

  // Common Angular HttpErrorResponse shapes
  const errObj = isRecord(root.error) ? root.error : null;
  const nestedMsg = errObj ? getString(errObj, 'message') : null;
  const directMsg = getString(root, 'message');

  return String(nestedMsg ?? directMsg ?? fallback);
}
