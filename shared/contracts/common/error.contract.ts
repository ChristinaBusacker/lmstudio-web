/**
 * Generic API error shape returned by REST endpoints.
 * You can map this to Nest's HttpException responses easily.
 */
export interface ApiError {
  statusCode: number;
  error: string; // e.g. "Bad Request"
  message: string | string[];
  path?: string;
  timestamp?: string;
}

/**
 * Optional machine-readable error codes.
 * Keep this small and grow it only when needed.
 */
export type ApiErrorCode =
  | 'VALIDATION_FAILED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';
