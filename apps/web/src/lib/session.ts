/**
 * The tenant session token lives ONLY in an httpOnly cookie - client-side
 * JavaScript can never read it (defends against XSS exfiltration), and it
 * never appears in a URL, localStorage, or any client-visible state. Every
 * page/data fetch that needs it runs server-side (Server Components, Route
 * Handlers) - see backendClient.ts.
 */
export const SESSION_COOKIE = 'pf_session';

export interface CookieReader {
  get(name: string): { value: string } | undefined;
}

export function readSessionToken(cookies: CookieReader): string | null {
  return cookies.get(SESSION_COOKIE)?.value ?? null;
}

/**
 * Reads the `tenantId` claim out of the session token for display purposes
 * only (e.g. the top bar) - this does NOT verify the signature. Every real
 * data request still goes through the backend, which verifies it properly
 * (requireTenantAuth); this is purely cosmetic and never used for an access
 * decision.
 */
export function tenantIdFromToken(token: string): string {
  try {
    const payloadSegment = token.split('.')[1];
    const json = Buffer.from(payloadSegment, 'base64url').toString('utf8');
    const payload = JSON.parse(json) as { tenantId?: string };
    return payload.tenantId ?? 'unknown-tenant';
  } catch {
    return 'unknown-tenant';
  }
}

export function sessionCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSeconds,
  };
}
