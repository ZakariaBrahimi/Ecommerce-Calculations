import { AdSet } from '../entities/AdSet';

export interface AdSetRepository {
  findByExternalId(tenantId: string, externalAdSetId: string): Promise<AdSet | null>;
  upsert(adSet: AdSet): Promise<void>;
  listByCampaign(tenantId: string, campaignId: string): Promise<AdSet[]>;
}
