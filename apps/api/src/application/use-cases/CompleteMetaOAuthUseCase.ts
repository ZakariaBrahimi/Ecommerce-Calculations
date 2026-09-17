import { MetaAdAccountSummary, MetaAdsGateway } from '../../domain/ports/MetaAdsGateway';
import { MetaAdAccountConnectionRepository } from '../../domain/ports/MetaAdAccountConnectionRepository';
import { OAuthStateCodec } from '../../domain/ports/OAuthStateCodec';
import { CredentialsCipher } from '../../domain/ports/CredentialsCipher';
import { Logger } from '../../domain/ports/Logger';

export interface CompleteMetaOAuthInput {
  state: string;
  code: string;
}

export interface CompleteMetaOAuthResult {
  tenantId: string;
  adAccounts: MetaAdAccountSummary[];
}

/**
 * "OAuth authentication" step 2: the callback handler. Exchanges the
 * one-time `code` for a long-lived access token (server-to-server only -
 * the token never touches the frontend), stores it encrypted, and returns
 * the seller's ad accounts so they can pick which one to track. The
 * connection is left in 'pending_ad_account' status until that pick is
 * made (SelectMetaAdAccountUseCase).
 */
export class CompleteMetaOAuthUseCase {
  constructor(
    private readonly gateway: MetaAdsGateway,
    private readonly stateCodec: OAuthStateCodec,
    private readonly connections: MetaAdAccountConnectionRepository,
    private readonly cipher: CredentialsCipher,
    private readonly logger: Logger,
  ) {}

  async execute(input: CompleteMetaOAuthInput): Promise<CompleteMetaOAuthResult> {
    const tenantId = this.stateCodec.decode(input.state);
    const log = this.logger.child({ tenantId, provider: this.gateway.provider });

    const token = await this.gateway.exchangeCodeForLongLivedToken(input.code);
    const adAccounts = await this.gateway.listAdAccounts(token.accessToken);

    const now = new Date();
    await this.connections.save({
      tenantId,
      provider: 'meta',
      encryptedAccessToken: this.cipher.encrypt(token.accessToken),
      tokenExpiresAt: token.expiresAt,
      adAccountId: null,
      currency: null,
      status: 'pending_ad_account',
      createdAt: now,
      updatedAt: now,
    });

    log.info('Meta OAuth completed, awaiting ad account selection', { adAccountCount: adAccounts.length });
    return { tenantId, adAccounts };
  }
}
