import jwt from 'jsonwebtoken';
import { IssuedTenantSession, TenantSessionIssuer } from '../../domain/ports/TenantSessionIssuer';

const SESSION_TTL_SECONDS = 24 * 60 * 60; // 24h - short-lived since re-issuing costs nothing today

export class JwtTenantSessionIssuer implements TenantSessionIssuer {
  constructor(private readonly jwtSecret: string) {}

  issue(tenantId: string): IssuedTenantSession {
    const token = jwt.sign({ tenantId }, this.jwtSecret, { expiresIn: SESSION_TTL_SECONDS });
    return { token, expiresInSeconds: SESSION_TTL_SECONDS };
  }
}
