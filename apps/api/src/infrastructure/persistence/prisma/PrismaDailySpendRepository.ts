import { PrismaClient } from '@prisma/client';
import { DailySpendRepository } from '../../../domain/ports/DailySpendRepository';
import { DailySpend } from '../../../domain/entities/DailySpend';
import { toDomainDailySpend, toPrismaDailySpendData } from './metaAdsMappers';

export class PrismaDailySpendRepository implements DailySpendRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async upsert(dailySpend: DailySpend): Promise<void> {
    const data = toPrismaDailySpendData(dailySpend);
    await this.prisma.dailySpend.upsert({
      where: { tenantId_campaignId_date: { tenantId: data.tenantId, campaignId: data.campaignId, date: data.date } },
      create: data,
      update: data,
    });
  }

  async listByCampaign(tenantId: string, campaignId: string): Promise<DailySpend[]> {
    const rows = await this.prisma.dailySpend.findMany({ where: { tenantId, campaignId } });
    return rows.map(toDomainDailySpend);
  }

  async listByTenant(tenantId: string): Promise<DailySpend[]> {
    const rows = await this.prisma.dailySpend.findMany({ where: { tenantId } });
    return rows.map(toDomainDailySpend);
  }
}
