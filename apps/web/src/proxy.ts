import { NextRequest, NextResponse } from 'next/server';

/**
 * The stateless serverless integration (/live, /api/elogistia/*, /api/meta/*)
 * has no per-tenant session of its own - unlike /dashboard, which gates on
 * the pf_session cookie, it's a single-account integration with nothing to
 * scope a session to. Basic Auth in front of it is the simplest thing that
 * actually protects both the page AND the API routes people can curl
 * directly (a page-only gate wouldn't stop that) - browsers cache the
 * credential per-origin after one native prompt and attach it to every
 * same-origin fetch() automatically, so LiveDashboard.tsx needs no client
 * code for this at all.
 *
 * Fails CLOSED: if LIVE_DASHBOARD_USER/PASSWORD aren't set, every protected
 * path 401s rather than silently deploying unauthenticated (see
 * .env.example) - customer PII (name/phone/address) and live ad spend
 * render on this page, so "unconfigured" must never mean "open".
 */
const PROTECTED_PATH_PREFIXES = ['/live', '/api/elogistia', '/api/meta'];

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function timingSafeEqual(a: string, b: string): boolean {
  const aBytes = Buffer.from(a);
  const bBytes = Buffer.from(b);
  if (aBytes.length !== bBytes.length) return false;
  let diff = 0;
  for (let i = 0; i < aBytes.length; i += 1) diff |= aBytes[i] ^ bBytes[i];
  return diff === 0;
}

function hasValidBasicAuth(request: NextRequest): boolean {
  const expectedUser = process.env.LIVE_DASHBOARD_USER;
  const expectedPassword = process.env.LIVE_DASHBOARD_PASSWORD;
  if (!expectedUser || !expectedPassword) return false;

  const header = request.headers.get('authorization');
  if (!header?.startsWith('Basic ')) return false;

  let decoded: string;
  try {
    decoded = Buffer.from(header.slice('Basic '.length), 'base64').toString('utf8');
  } catch {
    return false;
  }

  const separatorIndex = decoded.indexOf(':');
  if (separatorIndex === -1) return false;

  const user = decoded.slice(0, separatorIndex);
  const password = decoded.slice(separatorIndex + 1);
  return timingSafeEqual(user, expectedUser) && timingSafeEqual(password, expectedPassword);
}

function unauthorized(): NextResponse {
  return new NextResponse('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="ProfitFlow AI live dashboard"' },
  });
}

export function proxy(request: NextRequest) {
  if (isProtectedPath(request.nextUrl.pathname) && !hasValidBasicAuth(request)) {
    return unauthorized();
  }

  // Issues a fresh nonce per request and builds the CSP from it, so
  // script-src can stay locked to 'self' + this one nonce instead of
  // 'unsafe-inline' - Next.js's own hydration/RSC payload scripts are inline
  // by design and would otherwise be blocked outright (see next.config.js,
  // which used to set a static, nonce-less CSP that did exactly that).
  // 'strict-dynamic' lets scripts the nonced script loads (Next's chunk
  // loader) run too, without needing a nonce/hash of their own - this is
  // Next.js's documented pattern for CSP + App Router.
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
  ].join('; ');

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: [
    // Skip static assets - they carry no inline script and don't need a CSP nonce.
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
