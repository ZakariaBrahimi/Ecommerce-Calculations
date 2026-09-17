import { PrismaClient } from '@prisma/client';
import { loadConfig } from '../infrastructure/config/env';
import { PinoLogger } from '../infrastructure/logging/PinoLogger';
import { AesGcmCredentialsCipher } from '../infrastructure/security/AesGcmCredentialsCipher';
import { createRateLimiter } from '../infrastructure/rate-limit/createRateLimiter';
import { ElogistiaHttpClient } from '../infrastructure/providers/elogistia/ElogistiaHttpClient';
import { ElogistiaDeliveryProvider } from '../infrastructure/providers/elogistia/ElogistiaDeliveryProvider';
import { ElogistiaStatusMapper } from '../infrastructure/providers/elogistia/ElogistiaStatusMapper';
import { PrismaDeliveryOrderRepository } from '../infrastructure/persistence/prisma/PrismaDeliveryOrderRepository';
import { PrismaDeliveryProviderConnectionRepository } from '../infrastructure/persistence/prisma/PrismaDeliveryProviderConnectionRepository';
import { TenantCredentialsService } from '../application/services/TenantCredentialsService';
import { ConnectDeliveryProviderUseCase } from '../application/use-cases/ConnectDeliveryProviderUseCase';
import { FetchDeliveryOrdersUseCase } from '../application/use-cases/FetchDeliveryOrdersUseCase';
import { FetchOrderStatusUseCase } from '../application/use-cases/FetchOrderStatusUseCase';
import { SyncDeliveryOrdersUseCase } from '../application/use-cases/SyncDeliveryOrdersUseCase';
import { DeliverySyncScheduler } from '../infrastructure/jobs/DeliverySyncScheduler';
import { DeliveryConnectionController } from '../interfaces/http/controllers/DeliveryConnectionController';
import { DeliveryOrderController } from '../interfaces/http/controllers/DeliveryOrderController';
import { DeliverySyncController } from '../interfaces/http/controllers/DeliverySyncController';
import { DeliveryRouteDeps } from '../interfaces/http/routes/deliveryRoutes';
import { buildMetaAdsModule, MetaAdsModule } from './metaAdsContainer';

/**
 * Composition root - the only place in the codebase allowed to `new` up
 * concrete infrastructure classes and wire them into the application layer
 * via its port interfaces. Nothing above this file (domain, application,
 * interfaces) imports Prisma, Express internals, pino, or the Elogistia
 * client directly.
 */
export interface Container {
  logger: PinoLogger;
  prisma: PrismaClient;
  scheduler: DeliverySyncScheduler;
  routeDeps: DeliveryRouteDeps;
  syncCronExpression: string;
  metaAds: MetaAdsModule;
}

export function buildContainer(): Container {
  const config = loadConfig();
  const logger = PinoLogger.create();
  const prisma = new PrismaClient({ datasources: { db: { url: config.database.url } } });

  const cipher = new AesGcmCredentialsCipher(config.credentialsEncryptionKeyBase64);
  const rateLimiter = createRateLimiter({
    upstashRedis: config.upstashRedis,
    capacityPerMinute: config.deliveryElogistia.rateLimitPerMinute,
    isServerless: config.isServerless,
    logger,
    keyPrefix: 'elogistia',
  });

  const httpClient = new ElogistiaHttpClient(
    { baseUrl: config.deliveryElogistia.apiUrl, timeoutMs: config.deliveryElogistia.timeoutMs },
    rateLimiter,
    logger,
  );
  const gateway = new ElogistiaDeliveryProvider(httpClient);
  const statusMapper = new ElogistiaStatusMapper();

  const orderRepository = new PrismaDeliveryOrderRepository(prisma);
  const connectionRepository = new PrismaDeliveryProviderConnectionRepository(prisma);
  const credentials = new TenantCredentialsService(connectionRepository, cipher);

  const connectUseCase = new ConnectDeliveryProviderUseCase(gateway, connectionRepository, cipher, logger);
  const fetchOrdersUseCase = new FetchDeliveryOrdersUseCase(
    gateway,
    orderRepository,
    statusMapper,
    credentials,
    logger,
  );
  const fetchOrderStatusUseCase = new FetchOrderStatusUseCase(
    gateway,
    orderRepository,
    statusMapper,
    credentials,
    logger,
  );
  const syncUseCase = new SyncDeliveryOrdersUseCase(orderRepository, fetchOrderStatusUseCase, logger);

  const scheduler = new DeliverySyncScheduler(gateway.provider, connectionRepository, syncUseCase, logger);

  const routeDeps: DeliveryRouteDeps = {
    jwtSecret: config.jwtSecret,
    internalApiToken: config.internalApiToken,
    connectionController: new DeliveryConnectionController(connectUseCase),
    orderController: new DeliveryOrderController(fetchOrdersUseCase, fetchOrderStatusUseCase, orderRepository),
    syncController: new DeliverySyncController(scheduler),
  };

  const metaAds = buildMetaAdsModule({ prisma, cipher, logger, config });

  return { logger, prisma, scheduler, routeDeps, syncCronExpression: config.syncIntervalCron, metaAds };
}
