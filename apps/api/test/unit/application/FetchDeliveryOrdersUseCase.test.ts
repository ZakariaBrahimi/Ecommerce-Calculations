import { randomBytes } from 'node:crypto';
import { FetchDeliveryOrdersUseCase } from '../../../src/application/use-cases/FetchDeliveryOrdersUseCase';
import { TenantCredentialsService } from '../../../src/application/services/TenantCredentialsService';
import { InMemoryDeliveryOrderRepository } from '../../../src/infrastructure/persistence/in-memory/InMemoryDeliveryOrderRepository';
import { InMemoryDeliveryProviderConnectionRepository } from '../../../src/infrastructure/persistence/in-memory/InMemoryDeliveryProviderConnectionRepository';
import { AesGcmCredentialsCipher } from '../../../src/infrastructure/security/AesGcmCredentialsCipher';
import { DeliveryStatusMapper } from '../../../src/domain/ports/DeliveryStatusMapper';
import { InternalDeliveryStatus } from '../../../src/domain/enums/InternalDeliveryStatus';
import { DeliveryConnectionNotFoundError } from '../../../src/domain/errors/DeliveryIntegrationErrors';
import { FakeDeliveryProviderGateway, NoopLogger } from './testFakes';

const TENANT = 'tenant-1';

class PassthroughStatusMapper implements DeliveryStatusMapper {
  readonly provider = 'fake-provider';
  map(rawStatus: string): InternalDeliveryStatus {
    return rawStatus === 'Livrée' ? InternalDeliveryStatus.DELIVERED : InternalDeliveryStatus.CONFIRMED;
  }
}

async function setup() {
  const gateway = new FakeDeliveryProviderGateway();
  const orderRepository = new InMemoryDeliveryOrderRepository();
  const connectionRepository = new InMemoryDeliveryProviderConnectionRepository();
  const cipher = new AesGcmCredentialsCipher(randomBytes(32).toString('base64'));
  const credentials = new TenantCredentialsService(connectionRepository, cipher);

  const useCase = new FetchDeliveryOrdersUseCase(
    gateway,
    orderRepository,
    new PassthroughStatusMapper(),
    credentials,
    new NoopLogger(),
  );

  return { gateway, orderRepository, connectionRepository, cipher, useCase };
}

describe('FetchDeliveryOrdersUseCase', () => {
  it('throws DeliveryConnectionNotFoundError when the tenant has no active connection', async () => {
    const { useCase } = await setup();
    await expect(useCase.execute({ tenantId: TENANT })).rejects.toThrow(DeliveryConnectionNotFoundError);
  });

  it('creates new DeliveryOrder records for orders not seen before', async () => {
    const { gateway, orderRepository, connectionRepository, cipher, useCase } = await setup();
    await connectionRepository.save({
      tenantId: TENANT,
      provider: gateway.provider,
      encryptedApiKey: cipher.encrypt('valid-key'),
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    gateway.orders = [
      {
        externalOrderId: 'ext-1',
        trackingNumber: 'TRACK-1',
        customerName: 'Jane Doe',
        customerPhone: '0550000000',
        address: 'Some address',
        commune: 'Alger Centre',
        wilaya: 'Alger',
        deliveryFee: 800,
        rawStatus: 'À ramasser',
      },
    ];

    const result = await useCase.execute({ tenantId: TENANT });

    expect(result).toEqual({ fetched: 1, created: 1, updated: 0, unmapped: 0 });
    const stored = await orderRepository.findByTrackingNumber(TENANT, 'TRACK-1');
    expect(stored).not.toBeNull();
    expect(stored!.internalStatus).toBe(InternalDeliveryStatus.CONFIRMED);
  });

  it('updates an existing order only when the mapped status actually changed', async () => {
    const { gateway, orderRepository, connectionRepository, cipher, useCase } = await setup();
    await connectionRepository.save({
      tenantId: TENANT,
      provider: gateway.provider,
      encryptedApiKey: cipher.encrypt('valid-key'),
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    gateway.orders = [
      {
        externalOrderId: 'ext-1',
        trackingNumber: 'TRACK-1',
        customerName: 'Jane Doe',
        customerPhone: null,
        address: null,
        commune: null,
        wilaya: null,
        deliveryFee: null,
        rawStatus: 'À ramasser',
      },
    ];

    await useCase.execute({ tenantId: TENANT });
    gateway.orders[0] = { ...gateway.orders[0], rawStatus: 'Livrée' };
    const second = await useCase.execute({ tenantId: TENANT });

    expect(second).toEqual({ fetched: 1, created: 0, updated: 1, unmapped: 0 });
    const stored = await orderRepository.findByTrackingNumber(TENANT, 'TRACK-1');
    expect(stored!.internalStatus).toBe(InternalDeliveryStatus.DELIVERED);
  });
});
