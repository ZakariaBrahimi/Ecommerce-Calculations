import { Router, Request, Response, NextFunction } from 'express';
import { requireInternalToken, requireTenantAuth } from '../middleware/auth';
import { DeliveryConnectionController } from '../controllers/DeliveryConnectionController';
import { DeliveryOrderController } from '../controllers/DeliveryOrderController';
import { DeliverySyncController } from '../controllers/DeliverySyncController';

export interface DeliveryRouteDeps {
  jwtSecret: string;
  internalApiToken: string;
  connectionController: DeliveryConnectionController;
  orderController: DeliveryOrderController;
  syncController: DeliverySyncController;
}

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

/** Forwards a rejected promise to Express's error-handling middleware. */
function asyncHandler(handler: AsyncHandler) {
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res).catch(next);
  };
}

export function buildDeliveryRoutes(deps: DeliveryRouteDeps): Router {
  const router = Router();
  const tenantAuth = requireTenantAuth(deps.jwtSecret);
  const internalAuth = requireInternalToken(deps.internalApiToken);

  router.post('/connections', tenantAuth, asyncHandler(deps.connectionController.connect));

  router.get('/orders', tenantAuth, asyncHandler(deps.orderController.listOrders));
  router.post('/orders/refresh', tenantAuth, asyncHandler(deps.orderController.refreshOrders));
  router.post(
    '/orders/:trackingNumber/refresh-status',
    tenantAuth,
    asyncHandler(deps.orderController.refreshStatus),
  );
  router.get('/orders/:trackingNumber/history', tenantAuth, asyncHandler(deps.orderController.getHistory));

  // POST for manual/API-triggered runs; GET too because Vercel Cron Jobs only issue GET requests
  // (see docs/deployment-vercel.md) - both require the same internal token either way.
  router.post('/internal/sync', internalAuth, asyncHandler(deps.syncController.triggerNow));
  router.get('/internal/sync', internalAuth, asyncHandler(deps.syncController.triggerNow));

  return router;
}
