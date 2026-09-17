import { DeliveryProviderGateway } from '../../domain/ports/DeliveryProviderGateway';
import { DeliveryOrderRepository } from '../../domain/ports/DeliveryOrderRepository';
import { DeliveryStatusMapper } from '../../domain/ports/DeliveryStatusMapper';
import { Logger } from '../../domain/ports/Logger';
import { TenantCredentialsService } from '../services/TenantCredentialsService';
import { DeliveryStatusEvent } from '../../domain/entities/DeliveryStatusEvent';
import { InternalDeliveryStatus } from '../../domain/enums/InternalDeliveryStatus';
import {
  DeliveryProviderUnavailableError,
  UnknownDeliveryStatusError,
} from '../../domain/errors/DeliveryIntegrationErrors';

export interface FetchOrderStatusInput {
  tenantId: string;
  trackingNumbers: string[];
}

export interface OrderStatusResult {
  trackingNumber: string;
  internalStatus: InternalDeliveryStatus;
  rawStatus: string;
  changed: boolean;
}

/**
 * "Fetching order status" use case: batched status lookup for tracking
 * numbers already known to ProfitFlow AI. This is what the sync job calls
 * on a schedule, and what a user-triggered "refresh status" action uses.
 */
export class FetchOrderStatusUseCase {
  constructor(
    private readonly gateway: DeliveryProviderGateway,
    private readonly repository: DeliveryOrderRepository,
    private readonly statusMapper: DeliveryStatusMapper,
    private readonly credentials: TenantCredentialsService,
    private readonly logger: Logger,
  ) {}

  async execute(input: FetchOrderStatusInput): Promise<OrderStatusResult[]> {
    const log = this.logger.child({ tenantId: input.tenantId, provider: this.gateway.provider });
    if (input.trackingNumbers.length === 0) return [];

    const apiKey = await this.credentials.getApiKey(input.tenantId, this.gateway.provider);

    let raw;
    try {
      raw = await this.gateway.fetchOrderStatuses(apiKey, input.trackingNumbers);
    } catch (err) {
      log.error('Failed to fetch order statuses from provider', {
        trackingCount: input.trackingNumbers.length,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err instanceof DeliveryProviderUnavailableError
        ? err
        : new DeliveryProviderUnavailableError('Unexpected error fetching order statuses', err);
    }

    const results: OrderStatusResult[] = [];

    for (const record of raw) {
      const order = await this.repository.findByTrackingNumber(input.tenantId, record.trackingNumber);
      if (!order) {
        log.warn('Received a status update for an untracked shipment - skipping', {
          trackingNumber: record.trackingNumber,
        });
        continue;
      }

      let internalStatus: InternalDeliveryStatus;
      try {
        internalStatus = this.statusMapper.map(record.rawStatus);
      } catch (err) {
        if (!(err instanceof UnknownDeliveryStatusError)) throw err;
        log.warn('Unmapped raw delivery status during status sync - keeping prior status', {
          trackingNumber: record.trackingNumber,
          rawStatus: record.rawStatus,
        });
        internalStatus = order.internalStatus;
      }

      const changed = order.applyStatus(internalStatus, record.rawStatus, record.occurredAt);
      await this.repository.upsert(order);
      if (changed) {
        await this.repository.appendStatusEvent(
          DeliveryStatusEvent.create({
            deliveryOrderId: order.id,
            tenantId: input.tenantId,
            internalStatus,
            rawStatus: record.rawStatus,
            occurredAt: record.occurredAt,
          }),
        );
      }

      results.push({
        trackingNumber: record.trackingNumber,
        internalStatus,
        rawStatus: record.rawStatus,
        changed,
      });
    }

    log.info('Order status fetch complete', {
      requested: input.trackingNumbers.length,
      received: raw.length,
      changed: results.filter((r) => r.changed).length,
    });

    return results;
  }
}
