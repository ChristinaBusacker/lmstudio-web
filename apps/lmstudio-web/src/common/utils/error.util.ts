export interface NormalizedError {
  message: string;
  stack?: string;
  raw: unknown;
}

export function normalizeError(err: unknown): NormalizedError {
  if (err instanceof Error) {
    return {
      message: err.message,
      stack: err.stack,
      raw: err,
    };
  }

  if (typeof err === 'string') {
    return {
      message: err,
      raw: err,
    };
  }

  return {
    message: 'Unknown error',
    raw: err,
  };
}
