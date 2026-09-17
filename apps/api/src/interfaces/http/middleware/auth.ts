import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthenticatedRequest extends Request {
  tenantId?: string;
}

/**
 * Verifies the caller's own ProfitFlow AI session token and attaches the
 * tenant id to the request. This is the ONLY credential the frontend ever
 * sends - it never sees or forwards a delivery-provider API key, which
 * stays server-side, encrypted, resolved per tenant inside use cases.
 */
export function requireTenantAuth(jwtSecret: string) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const header = req.header('authorization');
    if (!header?.startsWith('Bearer ')) {
      res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Missing bearer token' } });
      return;
    }

    try {
      const token = header.slice('Bearer '.length);
      const payload = jwt.verify(token, jwtSecret) as { tenantId?: string };
      if (!payload.tenantId) {
        res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Token missing tenantId claim' } });
        return;
      }
      req.tenantId = payload.tenantId;
      next();
    } catch {
      res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Invalid or expired token' } });
    }
  };
}

/**
 * Guards internal-only routes (e.g. manually triggering the sync job) with
 * a separate shared secret, distinct from tenant session tokens, so a
 * leaked tenant JWT can never trigger platform-wide operations.
 */
export function requireInternalToken(expectedToken: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const provided = req.header('x-internal-token');
    if (!provided || provided !== expectedToken) {
      res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Invalid internal token' } });
      return;
    }
    next();
  };
}
