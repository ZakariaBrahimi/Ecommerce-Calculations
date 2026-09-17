import { NextRequest, NextResponse } from 'next/server';

/**
 * Issues a fresh nonce per request and builds the CSP from it, so
 * script-src can stay locked to 'self' + this one nonce instead of
 * 'unsafe-inline' - Next.js's own hydration/RSC payload scripts are inline
 * by design and would otherwise be blocked outright (see next.config.js,
 * which used to set a static, nonce-less CSP that did exactly that).
 * 'strict-dynamic' lets scripts the nonced script loads (Next's chunk
 * loader) run too, without needing a nonce/hash of their own - this is
 * Next.js's documented pattern for CSP + App Router.
 */
export function middleware(request: NextRequest) {
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
