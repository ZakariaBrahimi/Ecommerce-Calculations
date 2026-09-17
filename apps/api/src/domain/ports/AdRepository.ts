import { Ad } from '../entities/Ad';

export interface AdRepository {
  findByExternalId(tenantId: string, externalAdId: string): Promise<Ad | null>;
  upsert(ad: Ad): Promise<void>;
  listByAdSet(tenantId: string, adSetId: string): Promise<Ad[]>;
}
