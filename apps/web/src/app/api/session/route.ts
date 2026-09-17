import { NextRequest, NextResponse } from 'next/server';
import { mintDemoToken, BackendRequestError } from '@/lib/backendClient';
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/session';

/**
 * Demo-only "login": exchanges a tenant id for a session, entirely
 * server-side. The backend's INTERNAL_API_TOKEN (required to mint a token)
 * is read from this route's own server environment and never sent to the
 * browser - see backendClient.ts and docs/deployment-vercel-frontend.md.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.json().catch(() => null);
  const tenantId = typeof body?.tenantId === 'string' ? body.tenantId.trim() : '';

  if (!tenantId) {
    return NextResponse.json({ error: 'tenantId is required' }, { status: 400 });
  }

  try {
    const session = await mintDemoToken(tenantId);
    const response = NextResponse.json({ tenantId: session.tenantId });
    response.cookies.set(SESSION_COOKIE, session.token, sessionCookieOptions(session.expiresInSeconds));
    return response;
  } catch (err) {
    const status = err instanceof BackendRequestError ? err.status : 502;
    return NextResponse.json({ error: 'Could not start a session for that tenant' }, { status });
  }
}
