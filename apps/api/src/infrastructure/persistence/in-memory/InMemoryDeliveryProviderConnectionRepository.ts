import {
  DeliveryConnectionStatus,
  DeliveryProviderConnectionRecord,
  DeliveryProviderConnectionRepository,
} from '../../../domain/ports/DeliveryProviderConnectionRepository';

export class InMemoryDeliveryProviderConnectionRepository implements DeliveryProviderConnectionRepository {
  private readonly records = new Map<string, DeliveryProviderConnectionRecord>();

  async save(record: DeliveryProviderConnectionRecord): Promise<void> {
    this.records.set(key(record.tenantId, record.provider), record);
  }

  async find(tenantId: string, provider: string): Promise<DeliveryProviderConnectionRecord | null> {
    return this.records.get(key(tenantId, provider)) ?? null;
  }

  async listActiveTenantIds(provider: string): Promise<string[]> {
    return [...this.records.values()]
      .filter((r) => r.provider === provider && r.status === 'active')
      .map((r) => r.tenantId);
  }

  async markStatus(tenantId: string, provider: string, status: DeliveryConnectionStatus): Promise<void> {
    const existing = this.records.get(key(tenantId, provider));
    if (!existing) return;
    this.records.set(key(tenantId, provider), { ...existing, status, updatedAt: new Date() });
  }
}

function key(tenantId: string, provider: string): string {
  return `${tenantId}::${provider}`;
}
