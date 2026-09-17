import { randomBytes } from 'node:crypto';
import { ConnectDeliveryProviderUseCase } from '../../../src/application/use-cases/ConnectDeliveryProviderUseCase';
import { InMemoryDeliveryProviderConnectionRepository } from '../../../src/infrastructure/persistence/in-memory/InMemoryDeliveryProviderConnectionRepository';
import { AesGcmCredentialsCipher } from '../../../src/infrastructure/security/AesGcmCredentialsCipher';
import { DeliveryAuthenticationError } from '../../../src/domain/errors/DeliveryIntegrationErrors';
import { FakeDeliveryProviderGateway, NoopLogger } from './testFakes';

describe('ConnectDeliveryProviderUseCase', () => {
  function setup() {
    const gateway = new FakeDeliveryProviderGateway();
    const connections = new InMemoryDeliveryProviderConnectionRepository();
    const cipher = new AesGcmCredentialsCipher(randomBytes(32).toString('base64'));
    const useCase = new ConnectDeliveryProviderUseCase(gateway, connections, cipher, new NoopLogger());
    return { gateway, connections, cipher, useCase };
  }

  it('stores the API key encrypted, never in plaintext, after successful validation', async () => {
    const { connections, cipher, useCase } = setup();

    const result = await useCase.execute({ tenantId: 'tenant-1', apiKey: 'valid-key' });

    expect(result).toEqual({ provider: 'fake-provider', status: 'active' });

    const stored = await connections.find('tenant-1', 'fake-provider');
    expect(stored).not.toBeNull();
    expect(stored!.encryptedApiKey).not.toContain('valid-key');
    expect(cipher.decrypt(stored!.encryptedApiKey)).toBe('valid-key');
  });

  it('rejects and does not persist an invalid API key', async () => {
    const { connections, useCase } = setup();

    await expect(useCase.execute({ tenantId: 'tenant-1', apiKey: 'wrong-key' })).rejects.toThrow(
      DeliveryAuthenticationError,
    );

    expect(await connections.find('tenant-1', 'fake-provider')).toBeNull();
  });
});
