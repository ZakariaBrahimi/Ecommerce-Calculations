import { PrismaClient } from '@prisma/client';
import { AppConfig } from '../infrastructure/config/env';
import { Logger } from '../domain/ports/Logger';
import { CredentialsCipher } from '../domain/ports/CredentialsCipher';
import { createRateLimiter } from '../infrastructure/rate-limit/createRateLimiter';
import { MetaGraphHttpClient } from '../infrastructure/providers/meta-ads/MetaGraphHttpClient';
import { MetaAdsProvider } from '../infrastructure/providers/meta-ads/MetaAdsProvider';
import { MetaCampaignStatusMapper } from '../infrastructure/providers/meta-ads/MetaCampaignStatusMapper';
import { MetaOAuthStateCodec } from '../infrastructure/security/MetaOAuthStateCodec';
import { PrismaMetaAdAccountConnectionRepository } from '../infrastructure/persistence/prisma/PrismaMetaAdAccountConnectionRepository';
import { PrismaCampaignRepository } from '../infrastructure/persistence/prisma/PrismaCampaignRepository';
import { PrismaAdSetRepository } from '../infrastructure/persistence/prisma/PrismaAdSetRepository';
import { PrismaAdRepository } from '../infrastructure/persistence/prisma/PrismaAdRepository';
import { PrismaDailySpendRepository } from '../infrastructure/persistence/prisma/PrismaDailySpendRepository';
import { MetaConnectionResolver } from '../application/services/MetaConnectionResolver';
import { StartMetaOAuthUseCase } from '../application/use-cases/StartMetaOAuthUseCase';
import { CompleteMetaOAuthUseCase } from '../application/use-cases/CompleteMetaOAuthUseCase';
import { SelectMetaAdAccountUseCase } from '../application/use-cases/SelectMetaAdAccountUseCase';
import { SyncCampaignStructureUseCase } from '../application/use-cases/SyncCampaignStructureUseCase';
import { SyncDailyInsightsUseCase } from '../application/use-cases/SyncDailyInsightsUseCase';
import { SyncMetaAdsUseCase } from '../application/use-cases/SyncMetaAdsUseCase';
import { GetCampaignDashboardUseCase } from '../application/use-cases/GetCampaignDashboardUseCase';
import { MetaAdsSyncScheduler } from '../infrastructure/jobs/MetaAdsSyncScheduler';
import { MetaOAuthController } from '../interfaces/http/controllers/MetaOAuthController';
import { MetaAdAccountController } from '../interfaces/http/controllers/MetaAdAccountController';
import { MetaDashboardController } from '../interfaces/http/controllers/MetaDashboardController';
import { MetaSyncController } from '../interfaces/http/controllers/MetaSyncController';
import { MetaAdsRouteDeps } from '../interfaces/http/routes/metaAdsRoutes';

export interface MetaAdsModule {
  scheduler: MetaAdsSyncScheduler;
  routeDeps: MetaAdsRouteDeps;
  syncCronExpression: string;
}

/**
 * Composition for the Meta Ads feature module - shares the platform's
 * Prisma client, credentials cipher and logger with the delivery module
 * (see container.ts) but every Meta-specific class lives only here,
 * matching the modular-monolith boundary described in ARCHITECTURE.md.
 */
export function buildMetaAdsModule(deps: {
  prisma: PrismaClient;
  cipher: CredentialsCipher;
  logger: Logger;
  config: AppConfig;
}): MetaAdsModule {
  const { prisma, cipher, logger, config } = deps;

  const rateLimiter = createRateLimiter({
    upstashRedis: config.upstashRedis,
    capacityPerMinute: config.metaAds.rateLimitPerMinute,
    isServerless: config.isServerless,
    logger,
    keyPrefix: 'meta-ads',
  });
  const httpClient = new MetaGraphHttpClient(
    {
      baseUrl: config.metaAds.graphApiBaseUrl,
      apiVersion: config.metaAds.graphApiVersion,
      timeoutMs: config.metaAds.timeoutMs,
    },
    rateLimiter,
    logger,
  );
  const gateway = new MetaAdsProvider(httpClient, {
    appId: config.metaAds.appId,
    appSecret: config.metaAds.appSecret,
    redirectUri: config.metaAds.oauthRedirectUri,
    oauthDialogBaseUrl: 'https://www.facebook.com',
  });
  const statusMapper = new MetaCampaignStatusMapper();
  const stateCodec = new MetaOAuthStateCodec(config.metaAds.oauthStateSecret);

  const connectionRepository = new PrismaMetaAdAccountConnectionRepository(prisma);
  const campaignRepository = new PrismaCampaignRepository(prisma);
  const adSetRepository = new PrismaAdSetRepository(prisma);
  const adRepository = new PrismaAdRepository(prisma);
  const dailySpendRepository = new PrismaDailySpendRepository(prisma);
  const connectionResolver = new MetaConnectionResolver(connectionRepository, cipher);

  const startOAuthUseCase = new StartMetaOAuthUseCase(gateway, stateCodec);
  const completeOAuthUseCase = new CompleteMetaOAuthUseCase(
    gateway,
    stateCodec,
    connectionRepository,
    cipher,
    logger,
  );
  const selectAdAccountUseCase = new SelectMetaAdAccountUseCase(gateway, connectionRepository, cipher, logger);
  const syncStructureUseCase = new SyncCampaignStructureUseCase(
    gateway,
    campaignRepository,
    adSetRepository,
    adRepository,
    statusMapper,
    connectionResolver,
    logger,
  );
  const syncInsightsUseCase = new SyncDailyInsightsUseCase(
    gateway,
    campaignRepository,
    dailySpendRepository,
    connectionResolver,
    logger,
  );
  const syncUseCase = new SyncMetaAdsUseCase(syncStructureUseCase, syncInsightsUseCase, logger);
  const dashboardUseCase = new GetCampaignDashboardUseCase(campaignRepository, dailySpendRepository);

  const scheduler = new MetaAdsSyncScheduler(connectionRepository, syncUseCase, logger);

  const routeDeps: MetaAdsRouteDeps = {
    jwtSecret: config.jwtSecret,
    internalApiToken: config.internalApiToken,
    oauthController: new MetaOAuthController(startOAuthUseCase, completeOAuthUseCase),
    adAccountController: new MetaAdAccountController(selectAdAccountUseCase, syncUseCase),
    dashboardController: new MetaDashboardController(dashboardUseCase),
    syncController: new MetaSyncController(scheduler),
  };

  return { scheduler, routeDeps, syncCronExpression: config.metaAds.syncIntervalCron };
}
