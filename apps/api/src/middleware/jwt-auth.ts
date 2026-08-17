import type { MiddlewareHandler } from 'hono';
import { verifyJwt, type JwtPayload } from '../utils/jwt.js';
import { UnauthorizedError } from '../utils/errors.js';

declare module 'hono' {
  interface ContextVariableMap {
    userPayload: JwtPayload;
    userId: string;
    userEmail: string;
    userRole: string;
    orgId: string;
    requestId: string;
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
    const queryToken = c.req.query('token');

    let token: string | undefined;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    } else if (queryToken) {
      token = queryToken.trim();
    } else if (cookieHeader) {
      const match =
        cookieHeader.match(/graphsign_session=([^;]+)/) ||
        cookieHeader.match(/graphsign_session_token=([^;]+)/);
      if (match && match[1]) {
        token = match[1];
      }
    }

    if (!token) {
      throw new UnauthorizedError('Authentication token is required.');
    }

    try {
      const secret = (c.env as any)?.JWT_SECRET || process.env.JWT_SECRET;
      const payload = await verifyJwt(token, secret);
      c.set('userPayload', payload);
      if (payload.sub) c.set('userId', payload.sub);
      if (payload.email) c.set('userEmail', payload.email);
      if (payload.role) c.set('userRole', payload.role);
      if (payload.orgId) c.set('orgId', payload.orgId);
      await next();
    } catch (err: any) {
      throw new UnauthorizedError(err?.message ?? 'Invalid or tampered session token.');
    }
  };
}
