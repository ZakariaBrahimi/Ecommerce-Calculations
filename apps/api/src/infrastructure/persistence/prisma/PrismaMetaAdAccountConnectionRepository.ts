import { PrismaClient } from '@prisma/client';
import {
  MetaAdAccountConnectionRecord,
  MetaAdAccountConnectionRepository,
  MetaConnectionStatus,
} from '../../../domain/ports/MetaAdAccountConnectionRepository';

export class PrismaMetaAdAccountConnectionRepository implements MetaAdAccountConnectionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(record: MetaAdAccountConnectionRecord): Promise<void> {
    await this.prisma.metaAdAccountConnection.upsert({
      where: { tenantId: record.tenantId },
      create: {
        tenantId: record.tenantId,
        provider: record.provider,
        encryptedAccessToken: record.encryptedAccessToken,
        tokenExpiresAt: record.tokenExpiresAt,
        adAccountId: record.adAccountId,
        currency: record.currency,
        status: record.status,
      },
      update: {
        encryptedAccessToken: record.encryptedAccessToken,
        tokenExpiresAt: record.tokenExpiresAt,
        adAccountId: record.adAccountId,
        currency: record.currency,
        status: record.status,
      },
    });
  }

  async find(tenantId: string): Promise<MetaAdAccountConnectionRecord | null> {
    const row = await this.prisma.metaAdAccountConnection.findUnique({ where: { tenantId } });
    if (!row) return null;
    return {
      tenantId: row.tenantId,
      provider: 'meta',
      encryptedAccessToken: row.encryptedAccessToken,
      tokenExpiresAt: row.tokenExpiresAt,
      adAccountId: row.adAccountId,
      currency: row.currency,
      status: row.status as MetaConnectionStatus,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async listActiveTenantIds(): Promise<string[]> {
    const rows = await this.prisma.metaAdAccountConnection.findMany({
      where: { status: 'active' },
      select: { tenantId: true },
    });
    return rows.map((r) => r.tenantId);
  }

  async markStatus(tenantId: string, status: MetaConnectionStatus): Promise<void> {
    await this.prisma.metaAdAccountConnection.update({ where: { tenantId }, data: { status } });
  }
}
