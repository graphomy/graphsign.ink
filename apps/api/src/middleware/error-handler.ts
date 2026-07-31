import type { Context, ErrorHandler } from 'hono';
import { AppError } from '../utils/errors.js';

/**
 * Standard error response format per api.md.
 * Every error includes requestId for tracing and support.
 */
interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, string>;
    timestamp: string;
    requestId: string;
    path: string;
  };
}

/**
 * Builds the standard error response body.
 */
function buildErrorBody(c: Context, code: string, message: string, details?: Record<string, string>): ErrorResponse {
  return {
    error: {
      code,
      message,
      details,
      timestamp: new Date().toISOString(),
      requestId: c.get('requestId') ?? crypto.randomUUID(),
      path: c.req.path,
    },
  };
}

/**
 * Global error handler for Hono's onError hook.
 * Catches all errors and returns the standard error format.
 * Never exposes internal implementation details (security.md).
 */
export const errorHandler: ErrorHandler = (err: Error, c: Context) => {
  if (err instanceof AppError) {
    const body = buildErrorBody(c, err.code, err.message, err.details);
    return c.json(body, err.statusCode as 400 | 401 | 403 | 404 | 409 | 422 | 429 | 500);
  }

  // Unknown errors — never expose internal details
  console.error('Unhandled error:', err);
  const body = buildErrorBody(c, 'INTERNAL_SERVER_ERROR', 'An unexpected error occurred.');
  return c.json(body, 500);
};
