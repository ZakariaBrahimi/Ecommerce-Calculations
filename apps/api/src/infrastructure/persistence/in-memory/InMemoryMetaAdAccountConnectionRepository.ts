import {
  MetaAdAccountConnectionRecord,
  MetaAdAccountConnectionRepository,
  MetaConnectionStatus,
} from '../../../domain/ports/MetaAdAccountConnectionRepository';

export class InMemoryMetaAdAccountConnectionRepository implements MetaAdAccountConnectionRepository {
  private readonly records = new Map<string, MetaAdAccountConnectionRecord>();

  async save(record: MetaAdAccountConnectionRecord): Promise<void> {
    this.records.set(record.tenantId, record);
  }

  async find(tenantId: string): Promise<MetaAdAccountConnectionRecord | null> {
    return this.records.get(tenantId) ?? null;
  }

  async listActiveTenantIds(): Promise<string[]> {
    return [...this.records.values()].filter((r) => r.status === 'active').map((r) => r.tenantId);
  }

  async markStatus(tenantId: string, status: MetaConnectionStatus): Promise<void> {
    const existing = this.records.get(tenantId);
    if (!existing) return;
    this.records.set(tenantId, { ...existing, status, updatedAt: new Date() });
  }
}
