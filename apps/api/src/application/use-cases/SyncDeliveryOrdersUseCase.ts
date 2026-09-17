import { DeliveryOrderRepository } from '../../domain/ports/DeliveryOrderRepository';
import { Logger } from '../../domain/ports/Logger';
import { FetchOrderStatusUseCase } from './FetchOrderStatusUseCase';
import { DeliveryIntegrationError } from '../../domain/errors/DeliveryIntegrationErrors';

export interface SyncDeliveryOrdersInput {
  tenantId: string;
}

export interface SyncDeliveryOrdersResult {
  tenantId: string;
  checked: number;
  changed: number;
  batchesFailed: number;
}

const BATCH_SIZE = 50;

/**
 * Core sync-job logic for a single tenant: re-checks every non-terminal
 * shipment's status in provider-friendly batches. One tenant's failure never
 * throws past this use case silently - callers (the scheduler) decide
 * whether to propagate or just log and move to the next tenant.
 */
export class SyncDeliveryOrdersUseCase {
  constructor(
    private readonly repository: DeliveryOrderRepository,
    private readonly fetchOrderStatus: FetchOrderStatusUseCase,
    private readonly logger: Logger,
  ) {}

  async execute(input: SyncDeliveryOrdersInput): Promise<SyncDeliveryOrdersResult> {
    const log = this.logger.child({ tenantId: input.tenantId, job: 'sync-delivery-orders' });
    const active = await this.repository.listActive(input.tenantId);

    if (active.length === 0) {
      log.debug('No active shipments to sync');
      return { tenantId: input.tenantId, checked: 0, changed: 0, batchesFailed: 0 };
    }

    const trackingNumbers = active.map((o) => o.trackingNumber);
    const batches = chunk(trackingNumbers, BATCH_SIZE);

    let changed = 0;
    let batchesFailed = 0;

    for (const batch of batches) {
      try {
        const results = await this.fetchOrderStatus.execute({
          tenantId: input.tenantId,
          trackingNumbers: batch,
        });
        changed += results.filter((r) => r.changed).length;
      } catch (err) {
        batchesFailed += 1;
        log.error('Sync batch failed - continuing with remaining batches', {
          batchSize: batch.length,
          errorCode: err instanceof DeliveryIntegrationError ? err.code : 'UNKNOWN',
          error: err instanceof Error ? err.message : String(err),
        });
        // A single bad/rate-limited batch should not abort the whole tenant's
        // sync run; the next scheduled run will retry these tracking numbers
        // since they remain "active" until a terminal status is observed.
      }
    }

    const result = { tenantId: input.tenantId, checked: trackingNumbers.length, changed, batchesFailed };
    log.info('Tenant sync complete', result);
    return result;
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
