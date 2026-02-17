// Comments in English as requested.

import { ErrorHandler, Injectable, NgZone, inject } from '@angular/core';
import { ToastService } from '../../ui/toast/toast.service';

@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private readonly zone = inject(NgZone);
  private readonly toast = inject(ToastService);

  handleError(error: unknown): void {
    // Keep default console reporting.

    console.error('[GlobalError]', error);

    const msg = this.toMessage(error);

    // Ensure UI update runs inside Angular.
    this.zone.run(() => {
      this.toast.error('JavaScript error', msg, false);
    });
  }

  private toMessage(error: unknown): string {
    if (!error) return 'Unknown error';

    // Angular sometimes wraps errors.
    const anyErr = error as any;
    const maybeMessage = anyErr?.message ?? anyErr?.rejection?.message;
    if (typeof maybeMessage === 'string' && maybeMessage.trim()) return maybeMessage;

    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
}
