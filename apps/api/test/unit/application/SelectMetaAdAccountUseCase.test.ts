import { randomBytes } from 'node:crypto';
import { SelectMetaAdAccountUseCase } from '../../../src/application/use-cases/SelectMetaAdAccountUseCase';
import { InMemoryMetaAdAccountConnectionRepository } from '../../../src/infrastructure/persistence/in-memory/InMemoryMetaAdAccountConnectionRepository';
import { AesGcmCredentialsCipher } from '../../../src/infrastructure/security/AesGcmCredentialsCipher';
import { MetaAuthenticationError, MetaConnectionNotFoundError } from '../../../src/domain/errors/MetaAdsIntegrationErrors';
import { FakeMetaAdsGateway, NoopLogger } from './testFakes';

async function setup() {
  const gateway = new FakeMetaAdsGateway();
  const connections = new InMemoryMetaAdAccountConnectionRepository();
  const cipher = new AesGcmCredentialsCipher(randomBytes(32).toString('base64'));
  const useCase = new SelectMetaAdAccountUseCase(gateway, connections, cipher, new NoopLogger());

  await connections.save({
    tenantId: 'tenant-1',
    provider: 'meta',
    encryptedAccessToken: cipher.encrypt('long-lived-token'),
    tokenExpiresAt: new Date(Date.now() + 1000 * 60 * 60),
    adAccountId: null,
    currency: null,
    status: 'pending_ad_account',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return { gateway, connections, useCase };
}

describe('SelectMetaAdAccountUseCase', () => {
  it('activates the connection with the chosen ad account and its currency', async () => {
    const { connections, useCase } = await setup();

    const result = await useCase.execute({ tenantId: 'tenant-1', adAccountId: 'act_1' });

    expect(result).toEqual({ adAccountId: 'act_1', currency: 'USD' });
    const stored = await connections.find('tenant-1');
    expect(stored!.status).toBe('active');
    expect(stored!.adAccountId).toBe('act_1');
    expect(stored!.currency).toBe('USD');
  });

  it('rejects an ad account id not accessible with the connected token', async () => {
    const { useCase } = await setup();
    await expect(useCase.execute({ tenantId: 'tenant-1', adAccountId: 'act_unknown' })).rejects.toThrow(
      MetaAuthenticationError,
    );
  });

  it('throws MetaConnectionNotFoundError when there is no OAuth connection yet', async () => {
    const gateway = new FakeMetaAdsGateway();
    const connections = new InMemoryMetaAdAccountConnectionRepository();
    const cipher = new AesGcmCredentialsCipher(randomBytes(32).toString('base64'));
    const useCase = new SelectMetaAdAccountUseCase(gateway, connections, cipher, new NoopLogger());

    await expect(useCase.execute({ tenantId: 'no-connection', adAccountId: 'act_1' })).rejects.toThrow(
      MetaConnectionNotFoundError,
    );
  });
});
