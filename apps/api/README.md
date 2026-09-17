# ProfitFlow AI — Delivery Integration Service

Backend service for the Elogistia delivery-provider integration, built with
clean architecture: domain and application logic have no dependency on
Express, Prisma, or the Elogistia HTTP API — only on the port interfaces
under `src/domain/ports`. See `docs/integrations/elogistia-api.md` (repo
root) for the API analysis this implementation is based on.

## Layout

```
src/
  domain/          entities, enums, errors, port interfaces — no framework imports
  application/      use cases + services orchestrating ports
  infrastructure/   Prisma repos, Elogistia HTTP client/gateway, logging,
                    encryption, rate limiting, the sync job scheduler
  interfaces/http/  Express controllers/routes/middleware
  composition/      the one place that wires concrete infra into use cases
  main.ts           process entrypoint
prisma/schema.prisma  database models
test/unit/            fast tests against fakes/in-memory repos, no DB needed
```

## Getting started

```bash
cp .env.example .env      # fill in DATABASE_URL, DELIVERY_CREDENTIALS_ENCRYPTION_KEY, JWT_SECRET, INTERNAL_API_TOKEN
npm install
npx prisma migrate dev    # creates the delivery_* tables
npm run dev
```

## Scripts

- `npm run dev` — runs the API with hot reload
- `npm run build` / `npm start` — compiles to `dist/` and runs it
- `npm test` — unit tests (fakes/in-memory repos, no live DB or network)
- `npm run typecheck` — `tsc --noEmit`

## Key design points

- **No delivery-provider API key ever reaches the frontend.** The frontend
  only holds its own ProfitFlow AI session JWT; a seller's Elogistia key is
  submitted once via `POST /api/delivery/connections`, validated, encrypted
  (AES-256-GCM), and stored per tenant — never returned in any response.
- **One adapter per provider.** `ElogistiaDeliveryProvider` is the only
  class that knows Elogistia's endpoints; a second delivery provider is
  added by implementing `DeliveryProviderGateway` and `DeliveryStatusMapper`
  again, without touching use cases, controllers, or the sync job.
- **Sync job isolates failures per tenant and per batch** — one seller's
  expired key or one bad batch never blocks anyone else's sync run.
- **Errors** are a typed hierarchy (`DeliveryIntegrationError` and
  subclasses) translated to HTTP status codes in one place
  (`interfaces/http/errorHandler.ts`); nothing else constructs a raw `Error`
  for a provider failure.
- **Logging** goes through the `Logger` port (Pino in production), with
  provider API keys and encrypted credentials redacted at the logger level
  as defense in depth on top of callers never passing them in.
