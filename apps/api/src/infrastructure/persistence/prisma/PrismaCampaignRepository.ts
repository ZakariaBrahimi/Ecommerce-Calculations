import { PrismaClient } from '@prisma/client';
import { CampaignRepository } from '../../../domain/ports/CampaignRepository';
import { Campaign } from '../../../domain/entities/Campaign';
import { CampaignStatus } from '../../../domain/enums/CampaignStatus';
import { toDomainCampaign, toPrismaCampaignData } from './metaAdsMappers';

export class PrismaCampaignRepository implements CampaignRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByExternalId(tenantId: string, externalCampaignId: string): Promise<Campaign | null> {
    const row = await this.prisma.campaign.findUnique({
      where: { tenantId_externalCampaignId: { tenantId, externalCampaignId } },
    });
    return row ? toDomainCampaign(row) : null;
  }

  async upsert(campaign: Campaign): Promise<void> {
    const data = toPrismaCampaignData(campaign);
    await this.prisma.campaign.upsert({
      where: {
        tenantId_externalCampaignId: { tenantId: data.tenantId, externalCampaignId: data.externalCampaignId },
      },
      create: data,
      update: data,
    });
  }

  async listByTenant(tenantId: string): Promise<Campaign[]> {
    const rows = await this.prisma.campaign.findMany({ where: { tenantId } });
    return rows.map(toDomainCampaign);
  }

  async listByStatus(tenantId: string, status: CampaignStatus): Promise<Campaign[]> {
    const rows = await this.prisma.campaign.findMany({ where: { tenantId, status } });
    return rows.map(toDomainCampaign);
  }
}
