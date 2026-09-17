import { DeliveryProviderConnectionRepository } from '../../domain/ports/DeliveryProviderConnectionRepository';
import { CredentialsCipher } from '../../domain/ports/CredentialsCipher';
import { DeliveryConnectionNotFoundError } from '../../domain/errors/DeliveryIntegrationErrors';

/**
 * Resolves a tenant's plaintext API key for a provider, on demand, in
 * memory only. Nothing downstream of this service should hold onto the
 * decrypted value longer than a single use-case execution.
 */
export class TenantCredentialsService {
  constructor(
    private readonly connections: DeliveryProviderConnectionRepository,
    private readonly cipher: CredentialsCipher,
  ) {}

  async getApiKey(tenantId: string, provider: string): Promise<string> {
    const record = await this.connections.find(tenantId, provider);
    if (!record || record.status !== 'active') {
      throw new DeliveryConnectionNotFoundError(
        `No active ${provider} connection for tenant ${tenantId}`,
      );
    }
    return this.cipher.decrypt(record.encryptedApiKey);
  }
}
