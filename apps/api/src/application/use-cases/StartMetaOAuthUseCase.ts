import { MetaAdsGateway } from '../../domain/ports/MetaAdsGateway';
import { OAuthStateCodec } from '../../domain/ports/OAuthStateCodec';

export interface StartMetaOAuthResult {
  authorizationUrl: string;
}

/**
 * "OAuth authentication" step 1: builds the URL the frontend redirects the
 * seller's browser to. Nothing secret is embedded beyond the app id (which
 * is not secret - it's meant to appear in this URL); the app secret is only
 * ever used server-side during the callback's code->token exchange.
 */
export class StartMetaOAuthUseCase {
  constructor(
    private readonly gateway: MetaAdsGateway,
    private readonly stateCodec: OAuthStateCodec,
  ) {}

  execute(input: { tenantId: string }): StartMetaOAuthResult {
    const state = this.stateCodec.encode(input.tenantId);
    return { authorizationUrl: this.gateway.buildAuthorizationUrl(state) };
  }
}
