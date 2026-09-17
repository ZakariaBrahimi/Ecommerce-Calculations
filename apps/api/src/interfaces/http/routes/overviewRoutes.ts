import { NextFunction, Request, Response, Router } from 'express';
import { requireTenantAuth } from '../middleware/auth';
import { OverviewController } from '../controllers/OverviewController';

export interface OverviewRouteDeps {
  jwtSecret: string;
  overviewController: OverviewController;
}

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

function asyncHandler(handler: AsyncHandler) {
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res).catch(next);
  };
}

export function buildOverviewRoutes(deps: OverviewRouteDeps): Router {
  const router = Router();
  const tenantAuth = requireTenantAuth(deps.jwtSecret);

  router.get('/', tenantAuth, asyncHandler(deps.overviewController.getOverview));

  return router;
}
