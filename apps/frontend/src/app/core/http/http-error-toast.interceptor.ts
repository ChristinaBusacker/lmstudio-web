// Comments in English as requested.

import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { ToastService } from '../../ui/toast/toast.service';

type ServerErrorBody = {
  statusCode?: number;
  message?: any;
  error?: string;
  code?: string;
  baseUrl?: string;
  detail?: string;
};

export const httpErrorToastInterceptor: HttpInterceptorFn = (req, next) => {
  const toast = inject(ToastService);

  return next(req).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse) {
        const body = (err.error ?? null) as ServerErrorBody | null;
        const code = body?.code;

        // External services
        if (code === 'LMSTUDIO_UNREACHABLE') {
          toast.error(
            'LM Studio not reachable',
            body?.baseUrl ? `Base URL: ${body.baseUrl}` : null,
          );
        } else if (code === 'LMSTUDIO_ERROR') {
          toast.error('LM Studio error', body?.detail ?? null);
        } else if (code === 'SEARXNG_UNREACHABLE') {
          toast.warning(
            'SearXNG not reachable',
            body?.baseUrl ? `Base URL: ${body.baseUrl}` : null,
          );
        } else if (code === 'SEARXNG_ERROR') {
          toast.warning('SearXNG error', body?.detail ?? null);
        } else if (err.status === 0) {
          toast.error('Network error', 'Could not reach the server.');
        } else if (err.status >= 500) {
          toast.error('Server error', `HTTP ${err.status}`);
        }
      }

      return throwError(() => err);
    }),
  );
};
