import { randomBytes } from 'node:crypto';
import { SyncDeliveryOrdersUseCase } from '../../../src/application/use-cases/SyncDeliveryOrdersUseCase';
import { FetchOrderStatusUseCase } from '../../../src/application/use-cases/FetchOrderStatusUseCase';
import { TenantCredentialsService } from '../../../src/application/services/TenantCredentialsService';
import { InMemoryDeliveryOrderRepository } from '../../../src/infrastructure/persistence/in-memory/InMemoryDeliveryOrderRepository';
import { InMemoryDeliveryProviderConnectionRepository } from '../../../src/infrastructure/persistence/in-memory/InMemoryDeliveryProviderConnectionRepository';
import { AesGcmCredentialsCipher } from '../../../src/infrastructure/security/AesGcmCredentialsCipher';
import { DeliveryStatusMapper } from '../../../src/domain/ports/DeliveryStatusMapper';
import { InternalDeliveryStatus } from '../../../src/domain/enums/InternalDeliveryStatus';
import { DeliveryOrder } from '../../../src/domain/entities/DeliveryOrder';
import { FakeDeliveryProviderGateway, NoopLogger } from './testFakes';

const TENANT = 'tenant-1';

class PassthroughStatusMapper implements DeliveryStatusMapper {
  readonly provider = 'fake-provider';
  map(rawStatus: string): InternalDeliveryStatus {
    return rawStatus === 'Livrée' ? InternalDeliveryStatus.DELIVERED : InternalDeliveryStatus.SHIPPED;
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

  const fetchOrderStatus = new FetchOrderStatusUseCase(
    gateway,
    orderRepository,
    new PassthroughStatusMapper(),
    credentials,
    new NoopLogger(),
  );
  const syncUseCase = new SyncDeliveryOrdersUseCase(orderRepository, fetchOrderStatus, new NoopLogger());

  return { gateway, orderRepository, syncUseCase };
}

async function seedActiveOrder(repo: InMemoryDeliveryOrderRepository, trackingNumber: string) {
  await repo.upsert(
    DeliveryOrder.create({
      tenantId: TENANT,
      provider: 'fake-provider',
      externalOrderId: null,
      trackingNumber,
      customerName: null,
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
    }),
  );
}

describe('SyncDeliveryOrdersUseCase', () => {
  it('reports zero work when there are no active shipments', async () => {
    const { syncUseCase } = await setup();
    const result = await syncUseCase.execute({ tenantId: TENANT });
    expect(result).toEqual({ tenantId: TENANT, checked: 0, changed: 0, batchesFailed: 0 });
  });

  it('batches large tenants (>50 active shipments) into multiple provider calls', async () => {
    const { gateway, orderRepository, syncUseCase } = await setup();
    const trackingNumbers = Array.from({ length: 120 }, (_, i) => `TRACK-${i}`);
    for (const t of trackingNumbers) {
      await seedActiveOrder(orderRepository, t);
      gateway.statusesByTracking.set(t, { trackingNumber: t, rawStatus: 'Livrée', occurredAt: new Date() });
    }
    const fetchSpy = jest.spyOn(gateway, 'fetchOrderStatuses');

    const result = await syncUseCase.execute({ tenantId: TENANT });

    expect(result.checked).toBe(120);
    expect(result.changed).toBe(120); // CONFIRMED -> DELIVERED for every order
    expect(result.batchesFailed).toBe(0);
    expect(fetchSpy).toHaveBeenCalledTimes(3); // ceil(120 / 50)
  });

  it('isolates a failing batch so other batches still get synced', async () => {
    const { gateway, orderRepository, syncUseCase } = await setup();
    const trackingNumbers = Array.from({ length: 60 }, (_, i) => `TRACK-${i}`);
    for (const t of trackingNumbers) {
      await seedActiveOrder(orderRepository, t);
      gateway.statusesByTracking.set(t, { trackingNumber: t, rawStatus: 'Livrée', occurredAt: new Date() });
    }

    let callCount = 0;
    jest.spyOn(gateway, 'fetchOrderStatuses').mockImplementation(async (_apiKey, tracking) => {
      callCount += 1;
      if (callCount === 1) throw new Error('simulated provider outage');
      return tracking
        .map((t) => gateway.statusesByTracking.get(t))
        .filter((s): s is NonNullable<typeof s> => Boolean(s));
    });

    const result = await syncUseCase.execute({ tenantId: TENANT });

    expect(result.batchesFailed).toBe(1);
    // First batch (50 orders) failed; second batch (10 orders) still succeeded.
    expect(result.changed).toBe(10);
  });
});
