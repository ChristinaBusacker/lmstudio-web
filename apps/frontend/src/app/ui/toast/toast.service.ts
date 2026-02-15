// Comments in English as requested.

import { Injectable, signal } from '@angular/core';
import { v4 as uuidv4 } from 'uuid';
import type { ToastItem, ToastKind } from './toast.model';

@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly _toasts = signal<ToastItem[]>([]);
  readonly toasts = this._toasts.asReadonly();

  success(title: string, message?: string | null): void {
    this.push('success', title, message, 4_000);
  }

  info(title: string, message?: string | null): void {
    this.push('info', title, message, 4_500);
  }

  warning(title: string, message?: string | null): void {
    this.push('warning', title, message, 6_000);
  }

  error(title: string, message?: string | null, sticky = false): void {
    this.push('error', title, message, sticky ? null : 10_000);
  }

  dismiss(id: string): void {
    this._toasts.update((xs) => xs.filter((t) => t.id !== id));
  }

  clear(): void {
    this._toasts.set([]);
  }

  private push(kind: ToastKind, title: string, message: string | null | undefined, ttlMs: number | null): void {
    const id = uuidv4();
    const toast: ToastItem = {
      id,
      kind,
      title,
      message: message ?? null,
      createdAt: Date.now(),
      ttlMs,
    };

    this._toasts.update((xs) => [...xs, toast].slice(-6));

    if (ttlMs != null) {
      setTimeout(() => this.dismiss(id), ttlMs);
    }
  }
}
