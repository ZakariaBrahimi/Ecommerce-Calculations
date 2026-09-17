import express, { Express } from 'express';
import { Logger } from '../../domain/ports/Logger';
import { requestLogger } from './middleware/requestLogger';
import { errorHandler } from './errorHandler';
import { buildDeliveryRoutes, DeliveryRouteDeps } from './routes/deliveryRoutes';
import { buildMetaAdsRoutes, MetaAdsRouteDeps } from './routes/metaAdsRoutes';

export function createServer(
  logger: Logger,
  deliveryRouteDeps: DeliveryRouteDeps,
  metaAdsRouteDeps: MetaAdsRouteDeps,
): Express {
  const app = express();

  app.use(express.json());
  app.use(requestLogger(logger));

  app.get('/health', (_req, res) => res.status(200).json({ status: 'ok' }));
  app.use('/api/delivery', buildDeliveryRoutes(deliveryRouteDeps));
  app.use('/api/meta-ads', buildMetaAdsRoutes(metaAdsRouteDeps));

  // Must be registered last - Express matches error-handling middleware by arity.
  app.use(errorHandler(logger));

  return app;
}
