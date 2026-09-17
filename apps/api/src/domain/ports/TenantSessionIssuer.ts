export interface IssuedTenantSession {
  token: string;
  expiresInSeconds: number;
}

/**
 * Issues the tenant session token `requireTenantAuth` verifies. Today the
 * only implementation is a demo/placeholder (see IssueDemoTenantTokenUseCase)
 * - there is no real login/signup system yet (ARCHITECTURE.md's separate
 * Auth/Tenancy module). Kept as a port so a real implementation swaps in
 * without touching anything that depends on this interface.
 */
export interface TenantSessionIssuer {
  issue(tenantId: string): IssuedTenantSession;
}
