import { NextFunction, Request, Response, Router } from 'express';
import { requireInternalToken } from '../middleware/auth';
import { DemoAuthController } from '../controllers/DemoAuthController';

export interface AuthRouteDeps {
  internalApiToken: string;
  /** Off by default - see docs/security-review.md. Must be explicitly enabled via ENABLE_DEMO_AUTH. */
  demoAuthEnabled: boolean;
  demoAuthController: DemoAuthController;
}

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

function asyncHandler(handler: AsyncHandler) {
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res).catch(next);
  };
}

export function buildAuthRoutes(deps: AuthRouteDeps): Router {
  const router = Router();

  if (deps.demoAuthEnabled) {
    const internalAuth = requireInternalToken(deps.internalApiToken);
    router.post('/demo-token', internalAuth, asyncHandler(deps.demoAuthController.issueToken));
  }

  return router;
}
