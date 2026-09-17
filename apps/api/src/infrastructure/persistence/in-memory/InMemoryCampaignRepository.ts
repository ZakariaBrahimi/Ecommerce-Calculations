import { CampaignRepository } from '../../../domain/ports/CampaignRepository';
import { Campaign } from '../../../domain/entities/Campaign';
import { CampaignStatus } from '../../../domain/enums/CampaignStatus';

export class InMemoryCampaignRepository implements CampaignRepository {
  private readonly byId = new Map<string, Campaign>();

  async findByExternalId(tenantId: string, externalCampaignId: string): Promise<Campaign | null> {
    return (
      [...this.byId.values()].find(
        (c) => c.tenantId === tenantId && c.externalCampaignId === externalCampaignId,
      ) ?? null
    );
  }

  async upsert(campaign: Campaign): Promise<void> {
    this.byId.set(campaign.id, campaign);
  }

  async listByTenant(tenantId: string): Promise<Campaign[]> {
    return [...this.byId.values()].filter((c) => c.tenantId === tenantId);
  }

  async listByStatus(tenantId: string, status: CampaignStatus): Promise<Campaign[]> {
    return (await this.listByTenant(tenantId)).filter((c) => c.status === status);
  }
}
