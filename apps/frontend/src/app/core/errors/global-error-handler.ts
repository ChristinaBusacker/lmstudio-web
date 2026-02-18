// Comments in English as requested.

import { ErrorHandler, Injectable, NgZone, inject } from '@angular/core';
import { ToastService } from '../../ui/toast/toast.service';
import { getString, isRecord } from '../utils/typed-access';

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

    if (error instanceof Error) return error.message;

    // Angular sometimes wraps errors.
    if (isRecord(error)) {
      const direct = getString(error, 'message');
      if (direct && direct.trim()) return direct;

      const rejection = error['rejection'];
      if (isRecord(rejection)) {
        const rejMsg = getString(rejection, 'message');
        if (rejMsg && rejMsg.trim()) return rejMsg;
      }
    }

    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
}
