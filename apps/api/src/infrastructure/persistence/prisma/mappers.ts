import { Prisma, DeliveryOrder as PrismaDeliveryOrderRow } from '@prisma/client';
import { DeliveryOrder } from '../../../domain/entities/DeliveryOrder';
import { InternalDeliveryStatus } from '../../../domain/enums/InternalDeliveryStatus';

export function toDomainDeliveryOrder(row: PrismaDeliveryOrderRow): DeliveryOrder {
  return DeliveryOrder.fromPersistence({
    id: row.id,
    tenantId: row.tenantId,
    provider: row.provider,
    externalOrderId: row.externalOrderId,
    trackingNumber: row.trackingNumber,
    customerName: row.customerName,
    customerPhone: row.customerPhone,
    address: row.address,
    commune: row.commune,
    wilaya: row.wilaya,
    deliveryFee: row.deliveryFee ? Number(row.deliveryFee) : null,
    orderValue: row.orderValue ? Number(row.orderValue) : null,
    productCost: row.productCost ? Number(row.productCost) : null,
    internalStatus: row.internalStatus as InternalDeliveryStatus,
    rawStatus: row.rawStatus,
    lastSyncedAt: row.lastSyncedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export function toPrismaDeliveryOrderData(order: DeliveryOrder): Prisma.DeliveryOrderUncheckedCreateInput {
  const p = order.toPrimitives();
  return {
    id: p.id,
    tenantId: p.tenantId,
    provider: p.provider,
    externalOrderId: p.externalOrderId,
    trackingNumber: p.trackingNumber,
    customerName: p.customerName,
    customerPhone: p.customerPhone,
    address: p.address,
    commune: p.commune,
    wilaya: p.wilaya,
    deliveryFee: p.deliveryFee,
    orderValue: p.orderValue,
    productCost: p.productCost,
    internalStatus: p.internalStatus,
    rawStatus: p.rawStatus,
    lastSyncedAt: p.lastSyncedAt,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}
