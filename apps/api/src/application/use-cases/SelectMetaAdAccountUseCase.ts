import { MetaAdsGateway } from '../../domain/ports/MetaAdsGateway';
import { MetaAdAccountConnectionRepository } from '../../domain/ports/MetaAdAccountConnectionRepository';
import { CredentialsCipher } from '../../domain/ports/CredentialsCipher';
import { Logger } from '../../domain/ports/Logger';
import {
  MetaAuthenticationError,
  MetaConnectionNotFoundError,
} from '../../domain/errors/MetaAdsIntegrationErrors';

export interface SelectMetaAdAccountInput {
  tenantId: string;
  adAccountId: string;
}

export interface SelectMetaAdAccountResult {
  adAccountId: string;
  currency: string;
}

/**
 * Completes onboarding: the seller has authenticated and now picks which of
 * their Meta ad accounts ProfitFlow AI should track. Re-fetches the ad
 * account list (rather than trusting a client-supplied name/currency) so
 * the choice is validated against what Meta itself reports for this token.
 */
export class SelectMetaAdAccountUseCase {
  constructor(
    private readonly gateway: MetaAdsGateway,
    private readonly connections: MetaAdAccountConnectionRepository,
    private readonly cipher: CredentialsCipher,
    private readonly logger: Logger,
  ) {}

  async execute(input: SelectMetaAdAccountInput): Promise<SelectMetaAdAccountResult> {
    const log = this.logger.child({ tenantId: input.tenantId, provider: 'meta' });
    const connection = await this.connections.find(input.tenantId);
    if (!connection) {
      throw new MetaConnectionNotFoundError(`No Meta connection for tenant ${input.tenantId}`);
    }

    const accessToken = this.cipher.decrypt(connection.encryptedAccessToken);
    const adAccounts = await this.gateway.listAdAccounts(accessToken);
    const selected = adAccounts.find((a) => a.externalAdAccountId === input.adAccountId);

    if (!selected) {
      throw new MetaAuthenticationError(
        `Ad account ${input.adAccountId} is not accessible with the connected Meta account`,
      );
    }

    await this.connections.save({
      ...connection,
      adAccountId: selected.externalAdAccountId,
      currency: selected.currency,
      status: 'active',
      updatedAt: new Date(),
    });

    log.info('Meta ad account selected', { adAccountId: selected.externalAdAccountId });
    return { adAccountId: selected.externalAdAccountId, currency: selected.currency };
  }
}
