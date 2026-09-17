export type MetaConnectionStatus = 'pending_ad_account' | 'active' | 'invalid' | 'revoked';

/**
 * Persisted record for a tenant's connection to Meta Ads. `encryptedAccessToken`
 * is opaque ciphertext (see CredentialsCipher, reused from the delivery
 * integration) - this repository never sees or stores a plaintext token.
 *
 * `status` starts at 'pending_ad_account' right after OAuth completes (we
 * have a token but the seller hasn't picked which ad account to track yet),
 * moves to 'active' once one is selected.
 */
export interface MetaAdAccountConnectionRecord {
  tenantId: string;
  provider: 'meta';
  encryptedAccessToken: string;
  tokenExpiresAt: Date;
  adAccountId: string | null;
  /** The selected ad account's currency - captured at selection time to avoid an extra API call on every sync. */
  currency: string | null;
  status: MetaConnectionStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface MetaAdAccountConnectionRepository {
  save(record: MetaAdAccountConnectionRecord): Promise<void>;
  find(tenantId: string): Promise<MetaAdAccountConnectionRecord | null>;
  listActiveTenantIds(): Promise<string[]>;
  markStatus(tenantId: string, status: MetaConnectionStatus): Promise<void>;
}
