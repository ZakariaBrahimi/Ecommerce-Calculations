import { DailySpendRepository } from '../../../domain/ports/DailySpendRepository';
import { DailySpend } from '../../../domain/entities/DailySpend';

export class InMemoryDailySpendRepository implements DailySpendRepository {
  private readonly byKey = new Map<string, DailySpend>();
  private readonly tenantByKey = new Map<string, string>();

  async upsert(dailySpend: DailySpend): Promise<void> {
    const p = dailySpend.toPrimitives();
    const key = `${p.campaignId}::${p.date.toISOString().slice(0, 10)}`;
    this.byKey.set(key, dailySpend);
    this.tenantByKey.set(key, p.tenantId);
  }

  async listByCampaign(tenantId: string, campaignId: string): Promise<DailySpend[]> {
    return [...this.byKey.entries()]
      .filter(([key, spend]) => spend.campaignId === campaignId && this.tenantByKey.get(key) === tenantId)
      .map(([, spend]) => spend);
  }

  async listByTenant(tenantId: string): Promise<DailySpend[]> {
    return [...this.byKey.entries()]
      .filter(([key]) => this.tenantByKey.get(key) === tenantId)
      .map(([, spend]) => spend);
  }
}
