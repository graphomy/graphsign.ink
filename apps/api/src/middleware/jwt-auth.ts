import type { MiddlewareHandler } from 'hono';
import { verifyJwt, type JwtPayload } from '../utils/jwt.js';
import { UnauthorizedError } from '../utils/errors.js';

declare module 'hono' {
  interface ContextVariableMap {
    userPayload: JwtPayload;
  }
}

/**
 * Hono Middleware enforcing JWT authentication.
 * Verifies HMAC-SHA256 signature, expiry, and revocation.
 */
export function jwtAuth(): MiddlewareHandler {
  return async (c, next) => {
    const authHeader = c.req.header('authorization');
    const cookieHeader = c.req.header('cookie');

    let token: string | undefined;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    } else if (cookieHeader) {
      const match = cookieHeader.match(/graphsign_session=([^;]+)/);
      if (match && match[1]) {
        token = match[1];
      }
    }

    if (!token) {
      throw new UnauthorizedError('Authentication token is required.');
    }

    try {
      const payload = await verifyJwt(token);
      c.set('userPayload', payload);
      await next();
    } catch (err: any) {
      throw new UnauthorizedError(err?.message ?? 'Invalid or tampered session token.');
    }
  };
}
