import { PrismaClient } from '@prisma/client';
import { AdSetRepository } from '../../../domain/ports/AdSetRepository';
import { AdSet } from '../../../domain/entities/AdSet';
import { toDomainAdSet, toPrismaAdSetData } from './metaAdsMappers';

export class PrismaAdSetRepository implements AdSetRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByExternalId(tenantId: string, externalAdSetId: string): Promise<AdSet | null> {
    const row = await this.prisma.adSet.findUnique({
      where: { tenantId_externalAdSetId: { tenantId, externalAdSetId } },
    });
    return row ? toDomainAdSet(row) : null;
  }

  async upsert(adSet: AdSet): Promise<void> {
    const data = toPrismaAdSetData(adSet);
    await this.prisma.adSet.upsert({
      where: { tenantId_externalAdSetId: { tenantId: data.tenantId, externalAdSetId: data.externalAdSetId } },
      create: data,
      update: data,
    });
  }

  async listByCampaign(tenantId: string, campaignId: string): Promise<AdSet[]> {
    const rows = await this.prisma.adSet.findMany({ where: { tenantId, campaignId } });
    return rows.map(toDomainAdSet);
  }
}
