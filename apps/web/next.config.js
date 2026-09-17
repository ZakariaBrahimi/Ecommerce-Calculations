/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // Security headers for every response - Vercel serves these as-is, no
  // extra config needed on their side. Mirrors the backend's helmet() setup
  // (apps/api/src/interfaces/http/middleware/security.ts) so both halves of
  // the app carry the same baseline hardening. Content-Security-Policy is
  // NOT set here - it needs a fresh nonce per request, so src/middleware.ts
  // sets it instead (a static, nonce-less CSP would block Next's own inline
  // hydration scripts and break every client component in the app).
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
