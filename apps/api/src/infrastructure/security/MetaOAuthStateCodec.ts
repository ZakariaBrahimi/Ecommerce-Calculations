import jwt from 'jsonwebtoken';
import { OAuthStateCodec } from '../../domain/ports/OAuthStateCodec';
import { MetaOAuthStateInvalidError } from '../../domain/errors/MetaAdsIntegrationErrors';

const STATE_TTL_SECONDS = 10 * 60; // OAuth flows should complete within minutes, not hours

/**
 * Encodes/decodes the OAuth `state` param as a short-lived signed token
 * carrying the tenant id. Meta's redirect back to our callback is a plain
 * browser GET with no Authorization header, so `state` is the only way to
 * recover which tenant started the flow - signing it (rather than trusting
 * it verbatim) stops a forged state from connecting Meta ads to the wrong
 * tenant.
 */
export class MetaOAuthStateCodec implements OAuthStateCodec {
  constructor(private readonly secret: string) {}

  encode(tenantId: string): string {
    return jwt.sign({ tenantId }, this.secret, { expiresIn: STATE_TTL_SECONDS });
  }

  decode(state: string): string {
    try {
      const payload = jwt.verify(state, this.secret) as { tenantId?: string };
      if (!payload.tenantId) throw new Error('missing tenantId claim');
      return payload.tenantId;
    } catch (err) {
      throw new MetaOAuthStateInvalidError('OAuth state parameter failed verification', err);
    }
  }
}
