import { randomBytes } from 'node:crypto';
import { CompleteMetaOAuthUseCase } from '../../../src/application/use-cases/CompleteMetaOAuthUseCase';
import { StartMetaOAuthUseCase } from '../../../src/application/use-cases/StartMetaOAuthUseCase';
import { InMemoryMetaAdAccountConnectionRepository } from '../../../src/infrastructure/persistence/in-memory/InMemoryMetaAdAccountConnectionRepository';
import { AesGcmCredentialsCipher } from '../../../src/infrastructure/security/AesGcmCredentialsCipher';
import { MetaOAuthStateCodec } from '../../../src/infrastructure/security/MetaOAuthStateCodec';
import { MetaOAuthStateInvalidError } from '../../../src/domain/errors/MetaAdsIntegrationErrors';
import { FakeMetaAdsGateway, NoopLogger } from './testFakes';

function setup() {
  const gateway = new FakeMetaAdsGateway();
  const connections = new InMemoryMetaAdAccountConnectionRepository();
  const cipher = new AesGcmCredentialsCipher(randomBytes(32).toString('base64'));
  const stateCodec = new MetaOAuthStateCodec('state-secret');

  const startUseCase = new StartMetaOAuthUseCase(gateway, stateCodec);
  const completeUseCase = new CompleteMetaOAuthUseCase(gateway, stateCodec, connections, cipher, new NoopLogger());

  return { gateway, connections, cipher, stateCodec, startUseCase, completeUseCase };
}

describe('StartMetaOAuthUseCase + CompleteMetaOAuthUseCase', () => {
  it('builds an authorization URL carrying a state the callback can decode back to the tenant', () => {
    const { startUseCase, stateCodec } = setup();
    const { authorizationUrl } = startUseCase.execute({ tenantId: 'tenant-1' });

    const state = new URL(authorizationUrl).searchParams.get('state')!;
    expect(stateCodec.decode(state)).toBe('tenant-1');
  });

  it('exchanges the code, stores the token encrypted, and returns the ad account list', async () => {
    const { gateway, connections, cipher, startUseCase, completeUseCase } = setup();
    const { authorizationUrl } = startUseCase.execute({ tenantId: 'tenant-1' });
    const state = new URL(authorizationUrl).searchParams.get('state')!;

    const result = await completeUseCase.execute({ state, code: 'auth-code' });

    expect(result.tenantId).toBe('tenant-1');
    expect(result.adAccounts).toEqual(gateway.adAccounts);

    const stored = await connections.find('tenant-1');
    expect(stored).not.toBeNull();
    expect(stored!.status).toBe('pending_ad_account');
    expect(stored!.adAccountId).toBeNull();
    expect(stored!.encryptedAccessToken).not.toContain('long-lived-token');
    expect(cipher.decrypt(stored!.encryptedAccessToken)).toBe('long-lived-token');
  });

  it('rejects a forged or expired state parameter', async () => {
    const { completeUseCase } = setup();
    await expect(completeUseCase.execute({ state: 'not-a-real-token', code: 'auth-code' })).rejects.toThrow(
      MetaOAuthStateInvalidError,
    );
  });
});
