import { MetaAdAccountConnectionRepository } from '../../domain/ports/MetaAdAccountConnectionRepository';
import { CredentialsCipher } from '../../domain/ports/CredentialsCipher';
import {
  MetaAuthenticationError,
  MetaConnectionNotFoundError,
} from '../../domain/errors/MetaAdsIntegrationErrors';

export interface ResolvedMetaConnection {
  accessToken: string;
  adAccountId: string;
  currency: string;
}

/**
 * Resolves an active, non-expired Meta connection down to what a sync use
 * case needs to call the gateway. Centralizes the "is this tenant actually
 * ready to sync" check so both SyncCampaignStructureUseCase and
 * SyncDailyInsightsUseCase enforce it identically.
 */
export class MetaConnectionResolver {
  constructor(
    private readonly connections: MetaAdAccountConnectionRepository,
    private readonly cipher: CredentialsCipher,
  ) {}

  async resolve(tenantId: string): Promise<ResolvedMetaConnection> {
    const connection = await this.connections.find(tenantId);
    if (!connection || connection.status !== 'active' || !connection.adAccountId) {
      throw new MetaConnectionNotFoundError(
        `Tenant ${tenantId} has no active Meta connection with a selected ad account`,
      );
    }

    if (connection.tokenExpiresAt.getTime() < Date.now()) {
      await this.connections.markStatus(tenantId, 'invalid');
      throw new MetaAuthenticationError(
        'Meta access token has expired - the seller must reconnect their Meta Ads account',
      );
    }

    return {
      accessToken: this.cipher.decrypt(connection.encryptedAccessToken),
      adAccountId: connection.adAccountId,
      currency: connection.currency ?? 'USD',
    };
  }
}
