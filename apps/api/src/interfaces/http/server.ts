import express, { Express } from 'express';
import { Logger } from '../../domain/ports/Logger';
import { requestLogger } from './middleware/requestLogger';
import { baselineRateLimit, corsPolicy, securityHeaders, sensitiveEndpointRateLimit } from './middleware/security';
import { errorHandler } from './errorHandler';
import { buildDeliveryRoutes, DeliveryRouteDeps } from './routes/deliveryRoutes';
import { buildMetaAdsRoutes, MetaAdsRouteDeps } from './routes/metaAdsRoutes';

export function createServer(
  logger: Logger,
  deliveryRouteDeps: DeliveryRouteDeps,
  metaAdsRouteDeps: MetaAdsRouteDeps,
  corsAllowedOrigins: string[] = [],
): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(securityHeaders());
  app.use(corsPolicy(corsAllowedOrigins));
  app.use(express.json());
  app.use(requestLogger(logger));
  app.use('/api', baselineRateLimit());

  app.get('/health', (_req, res) => res.status(200).json({ status: 'ok' }));

  // Endpoints that trigger an external OAuth exchange or write a new
  // connection get a tighter limit than the general baseline above.
  const strictLimit = sensitiveEndpointRateLimit();
  app.use('/api/delivery/connections', strictLimit);
  app.use('/api/meta-ads/oauth/callback', strictLimit);
  app.use('/api/meta-ads/ad-account', strictLimit);

  app.use('/api/delivery', buildDeliveryRoutes(deliveryRouteDeps));
  app.use('/api/meta-ads', buildMetaAdsRoutes(metaAdsRouteDeps));

  // Must be registered last - Express matches error-handling middleware by arity.
  app.use(errorHandler(logger));

  return app;
}
