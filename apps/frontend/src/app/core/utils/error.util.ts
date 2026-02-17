import { getRecord, getString, isRecord } from './typed-access';

export function toErrorMessage(err: unknown): string {
  if (typeof err === 'string') return err;

  const root = getRecord(err);
  if (!root) return 'Unknown error';

  // Common Angular HttpErrorResponse shapes
  const errObj = isRecord(root.error) ? root.error : null;
  const nestedMsg = errObj ? getString(errObj, 'message') : null;
  const directMsg = getString(root, 'message');

  return String(nestedMsg ?? directMsg ?? 'Unknown error');
}
