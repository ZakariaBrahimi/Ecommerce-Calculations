import { randomBytes } from 'node:crypto';
import { FetchOrderStatusUseCase } from '../../../src/application/use-cases/FetchOrderStatusUseCase';
import { TenantCredentialsService } from '../../../src/application/services/TenantCredentialsService';
import { InMemoryDeliveryOrderRepository } from '../../../src/infrastructure/persistence/in-memory/InMemoryDeliveryOrderRepository';
import { InMemoryDeliveryProviderConnectionRepository } from '../../../src/infrastructure/persistence/in-memory/InMemoryDeliveryProviderConnectionRepository';
import { AesGcmCredentialsCipher } from '../../../src/infrastructure/security/AesGcmCredentialsCipher';
import { DeliveryStatusMapper } from '../../../src/domain/ports/DeliveryStatusMapper';
import { InternalDeliveryStatus } from '../../../src/domain/enums/InternalDeliveryStatus';
import { DeliveryOrder } from '../../../src/domain/entities/DeliveryOrder';
import { UnknownDeliveryStatusError } from '../../../src/domain/errors/DeliveryIntegrationErrors';
import { FakeDeliveryProviderGateway, NoopLogger } from './testFakes';

const TENANT = 'tenant-1';

class FakeStatusMapper implements DeliveryStatusMapper {
  readonly provider = 'fake-provider';
  map(rawStatus: string): InternalDeliveryStatus {
    if (rawStatus === 'Livrée') return InternalDeliveryStatus.DELIVERED;
    if (rawStatus === 'En transit') return InternalDeliveryStatus.SHIPPED;
    throw new UnknownDeliveryStatusError(rawStatus);
  }
}

async function setup() {
  const gateway = new FakeDeliveryProviderGateway();
  const orderRepository = new InMemoryDeliveryOrderRepository();
  const connectionRepository = new InMemoryDeliveryProviderConnectionRepository();
  const cipher = new AesGcmCredentialsCipher(randomBytes(32).toString('base64'));
  const credentials = new TenantCredentialsService(connectionRepository, cipher);

  await connectionRepository.save({
    tenantId: TENANT,
    provider: gateway.provider,
    encryptedApiKey: cipher.encrypt('valid-key'),
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const useCase = new FetchOrderStatusUseCase(
    gateway,
    orderRepository,
    new FakeStatusMapper(),
    credentials,
    new NoopLogger(),
  );

  return { gateway, orderRepository, useCase };
}

async function seedOrder(orderRepository: InMemoryDeliveryOrderRepository, trackingNumber: string) {
  const order = DeliveryOrder.create({
    tenantId: TENANT,
    provider: 'fake-provider',
    externalOrderId: 'order-1',
    trackingNumber,
    customerName: 'Test Customer',
    customerPhone: null,
    address: null,
    commune: null,
    wilaya: null,
    deliveryFee: null,
    orderValue: null,
    productCost: null,
    internalStatus: InternalDeliveryStatus.CONFIRMED,
    rawStatus: 'À ramasser',
    lastSyncedAt: null,
  });
  await orderRepository.upsert(order);
  return order;
}

describe('FetchOrderStatusUseCase', () => {
  it('updates the order status and records a history event when the status changed', async () => {
    const { gateway, orderRepository, useCase } = await setup();
    await seedOrder(orderRepository, 'TRACK-1');
    gateway.statusesByTracking.set('TRACK-1', {
      trackingNumber: 'TRACK-1',
      rawStatus: 'Livrée',
      occurredAt: new Date('2024-01-01T00:00:00Z'),
    });

    const [result] = await useCase.execute({ tenantId: TENANT, trackingNumbers: ['TRACK-1'] });

    expect(result.changed).toBe(true);
    expect(result.internalStatus).toBe(InternalDeliveryStatus.DELIVERED);

    const updated = await orderRepository.findByTrackingNumber(TENANT, 'TRACK-1');
    expect(updated!.internalStatus).toBe(InternalDeliveryStatus.DELIVERED);

    const history = await orderRepository.listStatusHistory(TENANT, 'TRACK-1');
    expect(history).toHaveLength(1);
    expect(history[0].toPrimitives().internalStatus).toBe(InternalDeliveryStatus.DELIVERED);
  });

  it('reports changed=false and records no new event when the status is unchanged', async () => {
    const { gateway, orderRepository, useCase } = await setup();
    await seedOrder(orderRepository, 'TRACK-2');
    gateway.statusesByTracking.set('TRACK-2', {
      trackingNumber: 'TRACK-2',
      rawStatus: 'En transit',
      occurredAt: new Date(),
    });

    // First call moves CONFIRMED -> SHIPPED (changed).
    await useCase.execute({ tenantId: TENANT, trackingNumbers: ['TRACK-2'] });
    // Second call with the same raw status should be a no-op.
    const [second] = await useCase.execute({ tenantId: TENANT, trackingNumbers: ['TRACK-2'] });

    expect(second.changed).toBe(false);
    const history = await orderRepository.listStatusHistory(TENANT, 'TRACK-2');
    expect(history).toHaveLength(1);
  });

  it('skips a status update for a tracking number ProfitFlow AI has never seen', async () => {
    const { gateway, useCase } = await setup();
    gateway.statusesByTracking.set('UNKNOWN-TRACK', {
      trackingNumber: 'UNKNOWN-TRACK',
      rawStatus: 'Livrée',
      occurredAt: new Date(),
    });

    const results = await useCase.execute({ tenantId: TENANT, trackingNumbers: ['UNKNOWN-TRACK'] });

    expect(results).toHaveLength(0);
  });

  it('keeps the prior status when the raw status cannot be mapped', async () => {
    const { gateway, orderRepository, useCase } = await setup();
    const order = await seedOrder(orderRepository, 'TRACK-3');
    gateway.statusesByTracking.set('TRACK-3', {
      trackingNumber: 'TRACK-3',
      rawStatus: 'Statut Mystère',
      occurredAt: new Date(),
    });

    const [result] = await useCase.execute({ tenantId: TENANT, trackingNumbers: ['TRACK-3'] });

    expect(result.internalStatus).toBe(order.internalStatus);
  });

  it('returns an empty array without calling the gateway when given no tracking numbers', async () => {
    const { gateway, useCase } = await setup();
    const spy = jest.spyOn(gateway, 'fetchOrderStatuses');

    const results = await useCase.execute({ tenantId: TENANT, trackingNumbers: [] });

    expect(results).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });
});
