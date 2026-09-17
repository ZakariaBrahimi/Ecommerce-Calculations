import { PrismaClient } from '@prisma/client';
import { DeliveryOrderRepository } from '../../../domain/ports/DeliveryOrderRepository';
import { DeliveryOrder } from '../../../domain/entities/DeliveryOrder';
import { DeliveryStatusEvent } from '../../../domain/entities/DeliveryStatusEvent';
import { InternalDeliveryStatus, TERMINAL_STATUSES } from '../../../domain/enums/InternalDeliveryStatus';
import { toDomainDeliveryOrder, toPrismaDeliveryOrderData } from './mappers';

export class PrismaDeliveryOrderRepository implements DeliveryOrderRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByTrackingNumber(tenantId: string, trackingNumber: string): Promise<DeliveryOrder | null> {
    const row = await this.prisma.deliveryOrder.findUnique({
      where: { tenantId_trackingNumber: { tenantId, trackingNumber } },
    });
    return row ? toDomainDeliveryOrder(row) : null;
  }

  async upsert(order: DeliveryOrder): Promise<void> {
    const data = toPrismaDeliveryOrderData(order);
    await this.prisma.deliveryOrder.upsert({
      where: { tenantId_trackingNumber: { tenantId: data.tenantId, trackingNumber: data.trackingNumber } },
      create: data,
      update: data,
    });
  }

  async listActive(tenantId: string): Promise<DeliveryOrder[]> {
    const nonTerminal = Object.values(InternalDeliveryStatus).filter(
      (s) => !TERMINAL_STATUSES.has(s),
    );
    const rows = await this.prisma.deliveryOrder.findMany({
      where: { tenantId, internalStatus: { in: nonTerminal } },
    });
    return rows.map(toDomainDeliveryOrder);
  }

  async list(tenantId: string, options?: { limit?: number; offset?: number }): Promise<DeliveryOrder[]> {
    const rows = await this.prisma.deliveryOrder.findMany({
      where: { tenantId },
      take: options?.limit,
      skip: options?.offset,
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map(toDomainDeliveryOrder);
  }

  async appendStatusEvent(event: DeliveryStatusEvent): Promise<void> {
    const p = event.toPrimitives();
    await this.prisma.deliveryStatusEvent.create({
      data: {
        id: p.id,
        deliveryOrderId: p.deliveryOrderId,
        tenantId: p.tenantId,
        internalStatus: p.internalStatus,
        rawStatus: p.rawStatus,
        occurredAt: p.occurredAt,
        recordedAt: p.recordedAt,
      },
    });
  }

  async listStatusHistory(tenantId: string, trackingNumber: string): Promise<DeliveryStatusEvent[]> {
    const order = await this.prisma.deliveryOrder.findUnique({
      where: { tenantId_trackingNumber: { tenantId, trackingNumber } },
    });
    if (!order) return [];

    const rows = await this.prisma.deliveryStatusEvent.findMany({
      where: { deliveryOrderId: order.id },
      orderBy: { occurredAt: 'asc' },
    });

    return rows.map((row) =>
      DeliveryStatusEvent.create({
        id: row.id,
        deliveryOrderId: row.deliveryOrderId,
        tenantId: row.tenantId,
        internalStatus: row.internalStatus as InternalDeliveryStatus,
        rawStatus: row.rawStatus,
        occurredAt: row.occurredAt,
        recordedAt: row.recordedAt,
      }),
    );
  }
}
