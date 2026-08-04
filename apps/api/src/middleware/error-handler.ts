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
function buildErrorBody(
  c: Context,
  code: string,
  message: string,
  details?: Record<string, string>,
): ErrorResponse {
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

  // Handle Prisma known request errors (e.g., duplicate unique constraint P2002)
  const errCode = (err as any)?.code;
  if (errCode === 'P2002') {
    const body = buildErrorBody(
      c,
      'CONFLICT',
      'An account or resource with this information already exists.',
    );
    return c.json(body, 409);
  }

  // Unknown or infrastructure errors — log full details
  console.error('Unhandled error:', err);

  const isProd = c.env?.NODE_ENV === 'production';
  const isDbError =
    err.name === 'PrismaClientInitializationError' ||
    err.name === 'PrismaClientKnownRequestError' ||
    err.stack?.includes('kn2.connect') ||
    err.stack?.includes('PrismaNeon');

  let message = 'An unexpected error occurred.';
  if (!isProd) {
    message = `An unexpected error occurred: ${err?.message ?? String(err)}`;
  } else if (isDbError) {
    // Keep production message clean per security.md, but ensure log traces are clear
    message = 'An unexpected error occurred.';
  }

  const body = buildErrorBody(c, 'INTERNAL_SERVER_ERROR', message);
  return c.json(body, 500);
};
