import { PrismaClient } from '@prisma/client';
import { loadConfig } from '../infrastructure/config/env';
import { PinoLogger } from '../infrastructure/logging/PinoLogger';
import { AesGcmCredentialsCipher } from '../infrastructure/security/AesGcmCredentialsCipher';
import { JwtTenantSessionIssuer } from '../infrastructure/security/JwtTenantSessionIssuer';
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
import { IssueDemoTenantTokenUseCase } from '../application/use-cases/IssueDemoTenantTokenUseCase';
import { GetOverviewDashboardUseCase } from '../application/use-cases/GetOverviewDashboardUseCase';
import { DeliverySyncScheduler } from '../infrastructure/jobs/DeliverySyncScheduler';
import { DeliveryConnectionController } from '../interfaces/http/controllers/DeliveryConnectionController';
import { DeliveryOrderController } from '../interfaces/http/controllers/DeliveryOrderController';
import { DeliverySyncController } from '../interfaces/http/controllers/DeliverySyncController';
import { DemoAuthController } from '../interfaces/http/controllers/DemoAuthController';
import { OverviewController } from '../interfaces/http/controllers/OverviewController';
import { DeliveryRouteDeps } from '../interfaces/http/routes/deliveryRoutes';
import { ServerDeps } from '../interfaces/http/server';
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
  syncCronExpression: string;
  metaAds: MetaAdsModule;
  /** Ready to pass straight to createServer(logger, serverDeps). */
  serverDeps: ServerDeps;
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

  const deliveryRouteDeps: DeliveryRouteDeps = {
    jwtSecret: config.jwtSecret,
    internalApiToken: config.internalApiToken,
    connectionController: new DeliveryConnectionController(connectUseCase),
    orderController: new DeliveryOrderController(fetchOrdersUseCase, fetchOrderStatusUseCase, orderRepository),
    syncController: new DeliverySyncController(scheduler),
  };

  const metaAds = buildMetaAdsModule({ prisma, cipher, logger, config });

  // Cross-cutting: joins delivery outcomes with ad spend for the
  // Overview/Delivery Funnel/Profit Breakdown dashboard sections.
  const overviewUseCase = new GetOverviewDashboardUseCase(orderRepository, metaAds.dailySpendRepository);

  // Demo-only tenant session issuance - see IssueDemoTenantTokenUseCase's doc comment.
  const sessionIssuer = new JwtTenantSessionIssuer(config.jwtSecret);
  const issueDemoTokenUseCase = new IssueDemoTenantTokenUseCase(sessionIssuer, logger);

  const serverDeps: ServerDeps = {
    delivery: deliveryRouteDeps,
    metaAds: metaAds.routeDeps,
    auth: {
      internalApiToken: config.internalApiToken,
      demoAuthEnabled: config.enableDemoAuth,
      demoAuthController: new DemoAuthController(issueDemoTokenUseCase),
    },
    overview: {
      jwtSecret: config.jwtSecret,
      overviewController: new OverviewController(overviewUseCase),
    },
    corsAllowedOrigins: config.corsAllowedOrigins,
  };

  return { logger, prisma, scheduler, syncCronExpression: config.syncIntervalCron, metaAds, serverDeps };
}
