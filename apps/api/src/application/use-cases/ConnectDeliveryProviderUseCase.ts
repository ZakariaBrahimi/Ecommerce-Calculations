import { DeliveryProviderGateway } from '../../domain/ports/DeliveryProviderGateway';
import { DeliveryProviderConnectionRepository } from '../../domain/ports/DeliveryProviderConnectionRepository';
import { CredentialsCipher } from '../../domain/ports/CredentialsCipher';
import { Logger } from '../../domain/ports/Logger';
import { DeliveryAuthenticationError } from '../../domain/errors/DeliveryIntegrationErrors';

export interface ConnectDeliveryProviderInput {
  tenantId: string;
  apiKey: string;
}

export interface ConnectDeliveryProviderResult {
  provider: string;
  status: 'active';
}

/**
 * "Authentication" use case: validates a seller-supplied API key against the
 * provider, then stores it encrypted. The plaintext key never leaves this
 * use case's stack frame - it is not returned, not logged, not persisted.
 */
export class ConnectDeliveryProviderUseCase {
  constructor(
    private readonly gateway: DeliveryProviderGateway,
    private readonly connections: DeliveryProviderConnectionRepository,
    private readonly cipher: CredentialsCipher,
    private readonly logger: Logger,
  ) {}

  async execute(input: ConnectDeliveryProviderInput): Promise<ConnectDeliveryProviderResult> {
    const log = this.logger.child({ tenantId: input.tenantId, provider: this.gateway.provider });

    const isValid = await this.gateway.validateApiKey(input.apiKey);
    if (!isValid) {
      log.warn('Rejected delivery provider connection attempt: invalid API key');
      throw new DeliveryAuthenticationError(
        `The provided ${this.gateway.provider} API key was rejected`,
      );
    }

    const now = new Date();
    await this.connections.save({
      tenantId: input.tenantId,
      provider: this.gateway.provider,
      encryptedApiKey: this.cipher.encrypt(input.apiKey),
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });

    log.info('Delivery provider connection established');
    return { provider: this.gateway.provider, status: 'active' };
  }
}
