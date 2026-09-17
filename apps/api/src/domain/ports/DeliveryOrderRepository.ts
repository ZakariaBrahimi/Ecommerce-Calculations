import { DeliveryOrder } from '../entities/DeliveryOrder';
import { DeliveryStatusEvent } from '../entities/DeliveryStatusEvent';

export interface DeliveryOrderRepository {
  findByTrackingNumber(tenantId: string, trackingNumber: string): Promise<DeliveryOrder | null>;

  /** Insert-or-update, keyed on (tenantId, trackingNumber). */
  upsert(order: DeliveryOrder): Promise<void>;

  /** Orders not yet in a terminal status - the sync job's polling set. */
  listActive(tenantId: string): Promise<DeliveryOrder[]>;

  list(tenantId: string, options?: { limit?: number; offset?: number }): Promise<DeliveryOrder[]>;

  appendStatusEvent(event: DeliveryStatusEvent): Promise<void>;

  listStatusHistory(tenantId: string, trackingNumber: string): Promise<DeliveryStatusEvent[]>;
}
