/**
 * Vercel serverless entrypoint. Vercel's Node.js builder treats any default
 * export from a file under `api/` as a request handler - an Express app IS
 * one (it's callable as `(req, res) => void`), so no adapter/wrapper is
 * needed and no `@vercel/node` dependency has to be pulled in just for
 * request/response types.
 *
 * Built once at module scope rather than per-request: Vercel reuses a warm
 * function instance (and this module's state, including the PrismaClient
 * connection buildContainer() creates) across multiple invocations, so a
 * per-request container would reconnect to Postgres on every single call.
 *
 * Deliberately does NOT start DeliverySyncScheduler/MetaAdsSyncScheduler -
 * a serverless function has no persistent background process for node-cron
 * to run in. Automatic synchronization instead runs via the Vercel Cron
 * Jobs configured in vercel.json, which hit the same /internal/sync routes
 * main.ts's in-process scheduler would otherwise call directly. See
 * docs/deployment-vercel.md for the full explanation.
 */
import { buildContainer } from '../src/composition/container';
import { createServer } from '../src/interfaces/http/server';
import { loadConfig } from '../src/infrastructure/config/env';

const config = loadConfig();
const { logger, routeDeps, metaAds } = buildContainer();
const app = createServer(logger, routeDeps, metaAds.routeDeps, config.corsAllowedOrigins);

export default app;
