import cron, { ScheduledTask } from 'node-cron';
import { MetaAdAccountConnectionRepository } from '../../domain/ports/MetaAdAccountConnectionRepository';
import { SyncMetaAdsUseCase } from '../../application/use-cases/SyncMetaAdsUseCase';
import { Logger } from '../../domain/ports/Logger';

/**
 * "Automatic synchronization" scheduling concern: runs SyncMetaAdsUseCase
 * for every tenant with an active Meta connection, in sequence, isolating
 * one tenant's failure (expired token, transient Meta outage) from the
 * rest. Mirrors DeliverySyncScheduler's shape deliberately.
 */
export class MetaAdsSyncScheduler {
  private task: ScheduledTask | undefined;

  constructor(
    private readonly connections: MetaAdAccountConnectionRepository,
    private readonly syncUseCase: SyncMetaAdsUseCase,
    private readonly logger: Logger,
  ) {}

  start(cronExpression: string): void {
    if (this.task) return;
    this.task = cron.schedule(cronExpression, () => {
      void this.runOnce();
    });
    this.logger.info('Meta Ads sync scheduler started', { cronExpression });
  }

  stop(): void {
    this.task?.stop();
    this.task = undefined;
  }

  async runOnce(): Promise<void> {
    const log = this.logger.child({ job: 'meta-ads-sync-scheduler' });
    const tenantIds = await this.connections.listActiveTenantIds();
    log.info('Starting Meta Ads sync run', { tenantCount: tenantIds.length });

    let succeeded = 0;
    let failed = 0;

    for (const tenantId of tenantIds) {
      try {
        await this.syncUseCase.execute({ tenantId });
        succeeded += 1;
      } catch (err) {
        failed += 1;
        log.error('Tenant Meta Ads sync threw unexpectedly - skipping to next tenant', {
          tenantId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    log.info('Meta Ads sync run complete', { tenantCount: tenantIds.length, succeeded, failed });
  }
}
