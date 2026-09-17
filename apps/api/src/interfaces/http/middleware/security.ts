import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { RequestHandler } from 'express';

/**
 * Standard security headers (X-Content-Type-Options, disabled X-Powered-By,
 * a conservative default CSP, etc.) - this is a pure JSON API, not a page
 * that renders HTML, so helmet's defaults are safe to use as-is.
 */
export function securityHeaders(): RequestHandler {
  return helmet();
}

/**
 * Cross-origin access for browser-based callers, restricted to an explicit
 * allowlist - never a wildcard, since some routes accept a tenant's bearer
 * token and a wildcard `*` origin combined with credentialed requests is a
 * classic way to let any website read another tenant's data. An empty
 * allowlist (the default) blocks ALL cross-origin browser access; direct
 * server-to-server or same-origin calls are unaffected either way, since
 * CORS is a browser-enforced restriction, not a server-side one.
 */
export function corsPolicy(allowedOrigins: string[]): RequestHandler {
  return cors({
    origin: allowedOrigins.length === 0 ? false : allowedOrigins,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
}

/**
 * Baseline inbound rate limiting so one client can't hammer the API.
 *
 * CAVEAT: the default in-memory store only counts requests seen by THIS
 * process. That's fine for a single long-lived server, but once this runs
 * as multiple instances or serverless invocations (Vercel), each one keeps
 * its own count - the limiter still works, it just enforces the configured
 * limit per-instance rather than globally. A shared store (e.g. Upstash
 * Redis via `rate-limit-redis`) closes that gap; see docs/deployment-vercel.md.
 */
export function baselineRateLimit(): RequestHandler {
  return rateLimit({
    windowMs: 60_000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false,
  });
}

/** Stricter limit for endpoints that trigger an external OAuth/API call or write a new connection. */
export function sensitiveEndpointRateLimit(): RequestHandler {
  return rateLimit({
    windowMs: 60_000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
  });
}
