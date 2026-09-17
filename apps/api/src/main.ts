import { buildContainer } from './composition/container';
import { createServer } from './interfaces/http/server';
import { loadConfig } from './infrastructure/config/env';

async function main(): Promise<void> {
  const config = loadConfig();
  const { logger, prisma, scheduler, routeDeps, metaAds } = buildContainer();

  const app = createServer(logger, routeDeps, metaAds.routeDeps);
  const server = app.listen(config.port, () => {
    logger.info('ProfitFlow AI backend listening', { port: config.port });
  });

  scheduler.start(config.syncIntervalCron);
  metaAds.scheduler.start(metaAds.syncCronExpression);

  const shutdown = async (signal: string): Promise<void> => {
    logger.info('Shutting down', { signal });
    scheduler.stop();
    metaAds.scheduler.stop();
    server.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal error during startup', err);
  process.exit(1);
});
