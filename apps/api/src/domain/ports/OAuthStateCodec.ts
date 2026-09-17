/**
 * Signs/verifies the OAuth `state` param so a provider's redirect-back can
 * recover which tenant started the flow without a session header (the
 * browser redirect carries no Authorization header of its own).
 */
export interface OAuthStateCodec {
  encode(tenantId: string): string;
  /** @throws an integration-specific "state invalid" error on bad signature/expiry. */
  decode(state: string): string;
}
