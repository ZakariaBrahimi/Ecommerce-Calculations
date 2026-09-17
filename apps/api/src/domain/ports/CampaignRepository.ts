import { Campaign } from '../entities/Campaign';
import { CampaignStatus } from '../enums/CampaignStatus';

export interface CampaignRepository {
  findByExternalId(tenantId: string, externalCampaignId: string): Promise<Campaign | null>;
  upsert(campaign: Campaign): Promise<void>;
  listByTenant(tenantId: string): Promise<Campaign[]>;
  listByStatus(tenantId: string, status: CampaignStatus): Promise<Campaign[]>;
}
