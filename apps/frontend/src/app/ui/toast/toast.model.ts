export type ToastKind = 'success' | 'info' | 'warning' | 'error';

export interface ToastItem {
  id: string;
  kind: ToastKind;
  title: string;
  message?: string | null;
  createdAt: number;
  /** Auto dismiss in ms. If null => sticky until closed. */
  ttlMs: number | null;
}
