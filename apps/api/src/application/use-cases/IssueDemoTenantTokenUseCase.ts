import { TenantSessionIssuer, IssuedTenantSession } from '../../domain/ports/TenantSessionIssuer';
import { Logger } from '../../domain/ports/Logger';

export interface IssueDemoTenantTokenInput {
  tenantId: string;
}

/**
 * Mints a tenant session token with no password, no signup, no user record -
 * NOT a real login system. It exists only so the frontend/demo has a way to
 * authenticate against the real API before ARCHITECTURE.md's Auth/Tenancy
 * module is built. Every call is logged at `warn` for visibility, and the
 * route this backs is gated behind BOTH `requireInternalToken` and the
 * `ENABLE_DEMO_AUTH` flag (default off) - see docs/security-review.md.
 */
export class IssueDemoTenantTokenUseCase {
  constructor(
    private readonly issuer: TenantSessionIssuer,
    private readonly logger: Logger,
  ) {}

  execute(input: IssueDemoTenantTokenInput): IssuedTenantSession {
    this.logger.warn('Demo tenant token issued - not a real login, see IssueDemoTenantTokenUseCase', {
      tenantId: input.tenantId,
    });
    return this.issuer.issue(input.tenantId);
  }
}
