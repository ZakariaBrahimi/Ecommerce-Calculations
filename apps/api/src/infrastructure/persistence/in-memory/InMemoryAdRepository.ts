import { AdRepository } from '../../../domain/ports/AdRepository';
import { Ad } from '../../../domain/entities/Ad';

export class InMemoryAdRepository implements AdRepository {
  private readonly byId = new Map<string, Ad>();

  async findByExternalId(tenantId: string, externalAdId: string): Promise<Ad | null> {
    return (
      [...this.byId.values()].find(
        (a) => a.toPrimitives().tenantId === tenantId && a.externalAdId === externalAdId,
      ) ?? null
    );
  }

  async upsert(ad: Ad): Promise<void> {
    this.byId.set(ad.id, ad);
  }

  async listByAdSet(tenantId: string, adSetId: string): Promise<Ad[]> {
    return [...this.byId.values()].filter(
      (a) => a.toPrimitives().tenantId === tenantId && a.toPrimitives().adSetId === adSetId,
    );
  }
}
