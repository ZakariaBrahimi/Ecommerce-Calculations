import cron, { ScheduledTask } from 'node-cron';
import { DeliveryProviderConnectionRepository } from '../../domain/ports/DeliveryProviderConnectionRepository';
import { SyncDeliveryOrdersUseCase } from '../../application/use-cases/SyncDeliveryOrdersUseCase';
import { Logger } from '../../domain/ports/Logger';

/**
 * Fan-out/scheduling concern: runs SyncDeliveryOrdersUseCase for every
 * tenant with an active connection to this provider, in sequence, isolating
 * one tenant's failure from the rest. This is deliberately a thin
 * infrastructure wrapper - all the actual sync logic lives in the use case,
 * which is unit-testable without node-cron in the loop at all.
 */
export class DeliverySyncScheduler {
  private task: ScheduledTask | undefined;

  constructor(
    private readonly provider: string,
    private readonly connections: DeliveryProviderConnectionRepository,
    private readonly syncUseCase: SyncDeliveryOrdersUseCase,
    private readonly logger: Logger,
  ) {}

  start(cronExpression: string): void {
    if (this.task) return;
    this.task = cron.schedule(cronExpression, () => {
      void this.runOnce();
    });
    this.logger.info('Delivery sync scheduler started', { provider: this.provider, cronExpression });
  }

  stop(): void {
    this.task?.stop();
    this.task = undefined;
  }

  async runOnce(): Promise<void> {
    const log = this.logger.child({ job: 'delivery-sync-scheduler', provider: this.provider });
    const tenantIds = await this.connections.listActiveTenantIds(this.provider);
    log.info('Starting delivery sync run', { tenantCount: tenantIds.length });

    let succeeded = 0;
    let failed = 0;

    for (const tenantId of tenantIds) {
      try {
        await this.syncUseCase.execute({ tenantId });
        succeeded += 1;
      } catch (err) {
        failed += 1;
        log.error('Tenant sync run threw unexpectedly - skipping to next tenant', {
          tenantId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    log.info('Delivery sync run complete', { tenantCount: tenantIds.length, succeeded, failed });
  }
}
