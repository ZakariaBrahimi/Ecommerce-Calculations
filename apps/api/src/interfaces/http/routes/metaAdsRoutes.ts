import { NextFunction, Request, Response, Router } from 'express';
import { requireInternalToken, requireTenantAuth } from '../middleware/auth';
import { MetaOAuthController } from '../controllers/MetaOAuthController';
import { MetaAdAccountController } from '../controllers/MetaAdAccountController';
import { MetaDashboardController } from '../controllers/MetaDashboardController';
import { MetaSyncController } from '../controllers/MetaSyncController';

export interface MetaAdsRouteDeps {
  jwtSecret: string;
  internalApiToken: string;
  oauthController: MetaOAuthController;
  adAccountController: MetaAdAccountController;
  dashboardController: MetaDashboardController;
  syncController: MetaSyncController;
}

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

function asyncHandler(handler: AsyncHandler) {
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res).catch(next);
  };
}

export function buildMetaAdsRoutes(deps: MetaAdsRouteDeps): Router {
  const router = Router();
  const tenantAuth = requireTenantAuth(deps.jwtSecret);
  const internalAuth = requireInternalToken(deps.internalApiToken);

  router.get('/oauth/start', tenantAuth, asyncHandler(deps.oauthController.start));
  // No tenantAuth here on purpose - Meta's redirect carries no bearer token,
  // only the signed `state` param (see MetaOAuthController's doc comment).
  router.get('/oauth/callback', asyncHandler(deps.oauthController.callback));

  router.post('/ad-account', tenantAuth, asyncHandler(deps.adAccountController.select));
  router.get('/dashboard', tenantAuth, asyncHandler(deps.dashboardController.getDashboard));

  // POST for manual/API-triggered runs; GET too because Vercel Cron Jobs only issue GET requests
  // (see docs/deployment-vercel.md) - both require the same internal token either way.
  router.post('/internal/sync', internalAuth, asyncHandler(deps.syncController.triggerNow));
  router.get('/internal/sync', internalAuth, asyncHandler(deps.syncController.triggerNow));

  return router;
}
