import { DeliveryOrderRepository } from '../../../domain/ports/DeliveryOrderRepository';
import { DeliveryOrder } from '../../../domain/entities/DeliveryOrder';
import { DeliveryStatusEvent } from '../../../domain/entities/DeliveryStatusEvent';
import { isTerminalStatus } from '../../../domain/enums/InternalDeliveryStatus';

/** In-process repository used for tests and local development without a DB. */
export class InMemoryDeliveryOrderRepository implements DeliveryOrderRepository {
  private readonly ordersByKey = new Map<string, DeliveryOrder>();
  private readonly events: DeliveryStatusEvent[] = [];

  async findByTrackingNumber(tenantId: string, trackingNumber: string): Promise<DeliveryOrder | null> {
    return this.ordersByKey.get(key(tenantId, trackingNumber)) ?? null;
  }

  async upsert(order: DeliveryOrder): Promise<void> {
    this.ordersByKey.set(key(order.tenantId, order.trackingNumber), order);
  }

  async listActive(tenantId: string): Promise<DeliveryOrder[]> {
    return [...this.ordersByKey.values()].filter(
      (o) => o.tenantId === tenantId && !isTerminalStatus(o.internalStatus),
    );
  }

  async list(tenantId: string, options?: { limit?: number; offset?: number }): Promise<DeliveryOrder[]> {
    const all = [...this.ordersByKey.values()].filter((o) => o.tenantId === tenantId);
    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? all.length;
    return all.slice(offset, offset + limit);
  }

  async appendStatusEvent(event: DeliveryStatusEvent): Promise<void> {
    this.events.push(event);
  }

  async listStatusHistory(tenantId: string, trackingNumber: string): Promise<DeliveryStatusEvent[]> {
    const order = await this.findByTrackingNumber(tenantId, trackingNumber);
    if (!order) return [];
    return this.events.filter((e) => e.toPrimitives().deliveryOrderId === order.id);
  }
}

function key(tenantId: string, trackingNumber: string): string {
  return `${tenantId}::${trackingNumber}`;
}
