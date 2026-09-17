import { PrismaClient } from '@prisma/client';
import { AdRepository } from '../../../domain/ports/AdRepository';
import { Ad } from '../../../domain/entities/Ad';
import { toDomainAd, toPrismaAdData } from './metaAdsMappers';

export class PrismaAdRepository implements AdRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByExternalId(tenantId: string, externalAdId: string): Promise<Ad | null> {
    const row = await this.prisma.ad.findUnique({
      where: { tenantId_externalAdId: { tenantId, externalAdId } },
    });
    return row ? toDomainAd(row) : null;
  }

  async upsert(ad: Ad): Promise<void> {
    const data = toPrismaAdData(ad);
    await this.prisma.ad.upsert({
      where: { tenantId_externalAdId: { tenantId: data.tenantId, externalAdId: data.externalAdId } },
      create: data,
      update: data,
    });
  }

  async listByAdSet(tenantId: string, adSetId: string): Promise<Ad[]> {
    const rows = await this.prisma.ad.findMany({ where: { tenantId, adSetId } });
    return rows.map(toDomainAd);
  }
}
