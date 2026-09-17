import {
  Prisma,
  Campaign as PrismaCampaignRow,
  AdSet as PrismaAdSetRow,
  Ad as PrismaAdRow,
  DailySpend as PrismaDailySpendRow,
} from '@prisma/client';
import { Campaign } from '../../../domain/entities/Campaign';
import { AdSet } from '../../../domain/entities/AdSet';
import { Ad } from '../../../domain/entities/Ad';
import { DailySpend } from '../../../domain/entities/DailySpend';
import { CampaignStatus } from '../../../domain/enums/CampaignStatus';

export function toDomainCampaign(row: PrismaCampaignRow): Campaign {
  return Campaign.fromPersistence({
    id: row.id,
    tenantId: row.tenantId,
    provider: row.provider,
    adAccountId: row.adAccountId,
    externalCampaignId: row.externalCampaignId,
    name: row.name,
    objective: row.objective,
    status: row.status as CampaignStatus,
    rawStatus: row.rawStatus,
    dailyBudget: row.dailyBudget ? Number(row.dailyBudget) : null,
    currency: row.currency,
    startDate: row.startDate,
    endDate: row.endDate,
    lastSyncedAt: row.lastSyncedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export function toPrismaCampaignData(campaign: Campaign): Prisma.CampaignUncheckedCreateInput {
  const p = campaign.toPrimitives();
  return {
    id: p.id,
    tenantId: p.tenantId,
    provider: p.provider,
    adAccountId: p.adAccountId,
    externalCampaignId: p.externalCampaignId,
    name: p.name,
    objective: p.objective,
    status: p.status,
    rawStatus: p.rawStatus,
    dailyBudget: p.dailyBudget,
    currency: p.currency,
    startDate: p.startDate,
    endDate: p.endDate,
    lastSyncedAt: p.lastSyncedAt,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

export function toDomainAdSet(row: PrismaAdSetRow): AdSet {
  return AdSet.fromPersistence({
    id: row.id,
    tenantId: row.tenantId,
    campaignId: row.campaignId,
    externalAdSetId: row.externalAdSetId,
    name: row.name,
    status: row.status as CampaignStatus,
    rawStatus: row.rawStatus,
    dailyBudget: row.dailyBudget ? Number(row.dailyBudget) : null,
    startDate: row.startDate,
    endDate: row.endDate,
    lastSyncedAt: row.lastSyncedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export function toPrismaAdSetData(adSet: AdSet): Prisma.AdSetUncheckedCreateInput {
  const p = adSet.toPrimitives();
  return {
    id: p.id,
    tenantId: p.tenantId,
    campaignId: p.campaignId,
    externalAdSetId: p.externalAdSetId,
    name: p.name,
    status: p.status,
    rawStatus: p.rawStatus,
    dailyBudget: p.dailyBudget,
    startDate: p.startDate,
    endDate: p.endDate,
    lastSyncedAt: p.lastSyncedAt,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

export function toDomainAd(row: PrismaAdRow): Ad {
  return Ad.fromPersistence({
    id: row.id,
    tenantId: row.tenantId,
    campaignId: row.campaignId,
    adSetId: row.adSetId,
    externalAdId: row.externalAdId,
    name: row.name,
    status: row.status as CampaignStatus,
    rawStatus: row.rawStatus,
    lastSyncedAt: row.lastSyncedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export function toPrismaAdData(ad: Ad): Prisma.AdUncheckedCreateInput {
  const p = ad.toPrimitives();
  return {
    id: p.id,
    tenantId: p.tenantId,
    campaignId: p.campaignId,
    adSetId: p.adSetId,
    externalAdId: p.externalAdId,
    name: p.name,
    status: p.status,
    rawStatus: p.rawStatus,
    lastSyncedAt: p.lastSyncedAt,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

export function toDomainDailySpend(row: PrismaDailySpendRow): DailySpend {
  return DailySpend.fromPersistence({
    id: row.id,
    tenantId: row.tenantId,
    campaignId: row.campaignId,
    date: row.date,
    spend: Number(row.spend),
    impressions: row.impressions,
    clicks: row.clicks,
    results: row.results,
    resultType: row.resultType,
    costPerResult: row.costPerResult ? Number(row.costPerResult) : null,
    purchases: row.purchases,
    purchaseValue: Number(row.purchaseValue),
    currency: row.currency,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export function toPrismaDailySpendData(dailySpend: DailySpend): Prisma.DailySpendUncheckedCreateInput {
  const p = dailySpend.toPrimitives();
  return {
    id: p.id,
    tenantId: p.tenantId,
    campaignId: p.campaignId,
    date: p.date,
    spend: p.spend,
    impressions: p.impressions,
    clicks: p.clicks,
    results: p.results,
    resultType: p.resultType,
    costPerResult: p.costPerResult,
    purchases: p.purchases,
    purchaseValue: p.purchaseValue,
    currency: p.currency,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}
