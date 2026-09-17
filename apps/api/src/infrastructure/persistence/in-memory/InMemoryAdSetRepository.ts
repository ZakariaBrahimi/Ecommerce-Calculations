import { AdSetRepository } from '../../../domain/ports/AdSetRepository';
import { AdSet } from '../../../domain/entities/AdSet';

export class InMemoryAdSetRepository implements AdSetRepository {
  private readonly byId = new Map<string, AdSet>();

  async findByExternalId(tenantId: string, externalAdSetId: string): Promise<AdSet | null> {
    return (
      [...this.byId.values()].find(
        (a) => a.toPrimitives().tenantId === tenantId && a.externalAdSetId === externalAdSetId,
      ) ?? null
    );
  }

  async upsert(adSet: AdSet): Promise<void> {
    this.byId.set(adSet.id, adSet);
  }

  async listByCampaign(tenantId: string, campaignId: string): Promise<AdSet[]> {
    return [...this.byId.values()].filter(
      (a) => a.toPrimitives().tenantId === tenantId && a.toPrimitives().campaignId === campaignId,
    );
  }
}
