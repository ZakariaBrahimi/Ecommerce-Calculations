import { DeliveryProviderGateway, RawDeliveryOrderRecord } from '../../domain/ports/DeliveryProviderGateway';
import { DeliveryOrderRepository } from '../../domain/ports/DeliveryOrderRepository';
import { DeliveryStatusMapper } from '../../domain/ports/DeliveryStatusMapper';
import { Logger } from '../../domain/ports/Logger';
import { TenantCredentialsService } from '../services/TenantCredentialsService';
import { DeliveryOrder } from '../../domain/entities/DeliveryOrder';
import { DeliveryStatusEvent } from '../../domain/entities/DeliveryStatusEvent';
import { InternalDeliveryStatus } from '../../domain/enums/InternalDeliveryStatus';
import {
  DeliveryProviderUnavailableError,
  UnknownDeliveryStatusError,
} from '../../domain/errors/DeliveryIntegrationErrors';

export interface FetchDeliveryOrdersInput {
  tenantId: string;
  /** Omit to pull the full order list (backfill/reconciliation only - see docs). */
  trackingNumber?: string;
}

export interface FetchDeliveryOrdersResult {
  fetched: number;
  created: number;
  updated: number;
  unmapped: number;
}

/**
 * "Fetching delivery orders" use case. Pulls orders from the provider,
 * normalizes each into a DeliveryOrder aggregate (mapping the provider's raw
 * status into InternalDeliveryStatus), and upserts them. Safe to re-run -
 * upserts are keyed on (tenantId, trackingNumber).
 */
export class FetchDeliveryOrdersUseCase {
  constructor(
    private readonly gateway: DeliveryProviderGateway,
    private readonly repository: DeliveryOrderRepository,
    private readonly statusMapper: DeliveryStatusMapper,
    private readonly credentials: TenantCredentialsService,
    private readonly logger: Logger,
  ) {}

  async execute(input: FetchDeliveryOrdersInput): Promise<FetchDeliveryOrdersResult> {
    const log = this.logger.child({ tenantId: input.tenantId, provider: this.gateway.provider });
    const apiKey = await this.credentials.getApiKey(input.tenantId, this.gateway.provider);

    let raw: RawDeliveryOrderRecord[];
    try {
      raw = await this.gateway.fetchOrders(apiKey, { trackingNumber: input.trackingNumber });
    } catch (err) {
      log.error('Failed to fetch delivery orders from provider', { error: describeError(err) });
      throw err instanceof DeliveryProviderUnavailableError
        ? err
        : new DeliveryProviderUnavailableError('Unexpected error fetching orders', err);
    }

    const result: FetchDeliveryOrdersResult = { fetched: raw.length, created: 0, updated: 0, unmapped: 0 };
    const now = new Date();

    for (const record of raw) {
      const existing = await this.repository.findByTrackingNumber(input.tenantId, record.trackingNumber);

      let internalStatus;
      try {
        internalStatus = this.statusMapper.map(record.rawStatus);
      } catch (err) {
        if (!(err instanceof UnknownDeliveryStatusError)) throw err;
        result.unmapped += 1;
        log.warn('Unmapped raw delivery status - keeping prior status, flagged for review', {
          trackingNumber: record.trackingNumber,
          rawStatus: record.rawStatus,
        });
        // Fall back to the existing status (no-op update) rather than guessing;
        // a brand-new order with no mapping is recorded as NEW pending review.
        internalStatus = existing?.internalStatus ?? InternalDeliveryStatus.NEW;
      }

      if (!existing) {
        const order = DeliveryOrder.create({
          tenantId: input.tenantId,
          provider: this.gateway.provider,
          externalOrderId: record.externalOrderId,
          trackingNumber: record.trackingNumber,
          customerName: record.customerName,
          customerPhone: record.customerPhone,
          address: record.address,
          commune: record.commune,
          wilaya: record.wilaya,
          deliveryFee: record.deliveryFee,
          // Elogistia has no clean price field here - orderValue/productCost
          // are populated from the store/order source once that integration
          // exists (see DeliveryOrder's doc comment).
          orderValue: null,
          productCost: null,
          internalStatus,
          rawStatus: record.rawStatus,
          lastSyncedAt: now,
        });
        await this.repository.upsert(order);
        await this.repository.appendStatusEvent(
          DeliveryStatusEvent.create({
            deliveryOrderId: order.id,
            tenantId: input.tenantId,
            internalStatus,
            rawStatus: record.rawStatus,
            occurredAt: now,
          }),
        );
        result.created += 1;
        continue;
      }

      const changed = existing.applyStatus(internalStatus, record.rawStatus, now);
      await this.repository.upsert(existing);
      if (changed) {
        await this.repository.appendStatusEvent(
          DeliveryStatusEvent.create({
            deliveryOrderId: existing.id,
            tenantId: input.tenantId,
            internalStatus,
            rawStatus: record.rawStatus,
            occurredAt: now,
          }),
        );
        result.updated += 1;
      }
    }

    log.info('Delivery orders fetch complete', { ...result });
    return result;
  }
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
