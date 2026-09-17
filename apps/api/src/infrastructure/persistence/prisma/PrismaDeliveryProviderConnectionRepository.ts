import { PrismaClient } from '@prisma/client';
import {
  DeliveryConnectionStatus,
  DeliveryProviderConnectionRecord,
  DeliveryProviderConnectionRepository,
} from '../../../domain/ports/DeliveryProviderConnectionRepository';

export class PrismaDeliveryProviderConnectionRepository implements DeliveryProviderConnectionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(record: DeliveryProviderConnectionRecord): Promise<void> {
    await this.prisma.deliveryProviderConnection.upsert({
      where: { tenantId_provider: { tenantId: record.tenantId, provider: record.provider } },
      create: {
        tenantId: record.tenantId,
        provider: record.provider,
        encryptedApiKey: record.encryptedApiKey,
        status: record.status,
      },
      update: {
        encryptedApiKey: record.encryptedApiKey,
        status: record.status,
      },
    });
  }

  async find(tenantId: string, provider: string): Promise<DeliveryProviderConnectionRecord | null> {
    const row = await this.prisma.deliveryProviderConnection.findUnique({
      where: { tenantId_provider: { tenantId, provider } },
    });
    if (!row) return null;
    return {
      tenantId: row.tenantId,
      provider: row.provider,
      encryptedApiKey: row.encryptedApiKey,
      status: row.status as DeliveryConnectionStatus,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async listActiveTenantIds(provider: string): Promise<string[]> {
    const rows = await this.prisma.deliveryProviderConnection.findMany({
      where: { provider, status: 'active' },
      select: { tenantId: true },
    });
    return rows.map((r) => r.tenantId);
  }

  async markStatus(tenantId: string, provider: string, status: DeliveryConnectionStatus): Promise<void> {
    await this.prisma.deliveryProviderConnection.update({
      where: { tenantId_provider: { tenantId, provider } },
      data: { status },
    });
  }
}
