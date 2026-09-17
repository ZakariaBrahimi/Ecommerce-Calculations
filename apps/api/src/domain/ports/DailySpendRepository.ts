import { DailySpend } from '../entities/DailySpend';

export interface DailySpendRepository {
  /** Full overwrite keyed on (tenantId, campaignId, date) - see DailySpend's class doc. */
  upsert(dailySpend: DailySpend): Promise<void>;

  /** All rows for one campaign across its whole lifetime, for dashboard aggregation. */
  listByCampaign(tenantId: string, campaignId: string): Promise<DailySpend[]>;

  /** All rows for every campaign belonging to the tenant, for a single dashboard query. */
  listByTenant(tenantId: string): Promise<DailySpend[]>;
}
