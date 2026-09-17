export type DeliveryConnectionStatus = 'active' | 'invalid' | 'revoked';

/**
 * Persisted record for a tenant's connection to a delivery provider.
 * `encryptedApiKey` is opaque ciphertext (see CredentialsCipher) - this
 * repository never sees or stores plaintext.
 */
export interface DeliveryProviderConnectionRecord {
  tenantId: string;
  provider: string;
  encryptedApiKey: string;
  status: DeliveryConnectionStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface DeliveryProviderConnectionRepository {
  save(record: DeliveryProviderConnectionRecord): Promise<void>;
  find(tenantId: string, provider: string): Promise<DeliveryProviderConnectionRecord | null>;
  listActiveTenantIds(provider: string): Promise<string[]>;
  markStatus(tenantId: string, provider: string, status: DeliveryConnectionStatus): Promise<void>;
}
