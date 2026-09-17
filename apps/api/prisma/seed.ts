/**
 * Seeds the database with a deterministic demo scenario reconciling exactly
 * to a known set of dashboard numbers (see prisma/seed-data/demoScenario.ts
 * and its unit test for the reconciliation itself). Safe to re-run - it
 * wipes only the demo tenant's own rows first.
 *
 * Run with: npx prisma db seed   (or: npx ts-node prisma/seed.ts)
 */
import { PrismaClient } from '@prisma/client';
import { buildDemoScenario } from './seed-data/demoScenario';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const scenario = buildDemoScenario();
  const { tenantId } = scenario;

  console.log(`Seeding demo tenant "${tenantId}"...`);

  // FK-safe teardown of any previous run of this same demo tenant.
  await prisma.deliveryStatusEvent.deleteMany({ where: { tenantId } });
  await prisma.deliveryOrder.deleteMany({ where: { tenantId } });
  await prisma.dailySpend.deleteMany({ where: { tenantId } });
  await prisma.ad.deleteMany({ where: { tenantId } });
  await prisma.adSet.deleteMany({ where: { tenantId } });
  await prisma.campaign.deleteMany({ where: { tenantId } });

  // --- Delivery orders (Elogistia) ---
  for (const order of scenario.deliveryOrders) {
    const created = await prisma.deliveryOrder.create({
      data: {
        tenantId,
        provider: 'elogistia',
        externalOrderId: order.externalOrderId,
        trackingNumber: order.trackingNumber,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        address: order.address,
        commune: order.commune,
        wilaya: order.wilaya,
        deliveryFee: order.deliveryFee,
        orderValue: order.orderValue,
        productCost: order.productCost,
        internalStatus: order.internalStatus,
        rawStatus: order.rawStatus,
        lastSyncedAt: order.lastSyncedAt,
        createdAt: order.placedAt,
      },
    });

    await prisma.deliveryStatusEvent.create({
      data: {
        deliveryOrderId: created.id,
        tenantId,
        internalStatus: order.internalStatus,
        rawStatus: order.rawStatus,
        occurredAt: order.lastSyncedAt,
      },
    });
  }
  console.log(`  ${scenario.deliveryOrders.length} delivery orders (+ 1 status event each)`);

  // --- Meta Ads campaigns / ad sets / ads / daily spend ---
  for (const campaign of scenario.campaigns) {
    const createdCampaign = await prisma.campaign.create({
      data: {
        tenantId,
        provider: 'meta',
        adAccountId: scenario.adAccountId,
        externalCampaignId: campaign.externalCampaignId,
        name: campaign.name,
        objective: campaign.objective,
        status: campaign.status,
        rawStatus: 'ACTIVE',
        dailyBudget: campaign.dailyBudget,
        currency: campaign.currency,
        startDate: campaign.startDate,
        endDate: campaign.endDate,
        lastSyncedAt: new Date(),
      },
    });

    for (const adSet of campaign.adSets) {
      const createdAdSet = await prisma.adSet.create({
        data: {
          tenantId,
          campaignId: createdCampaign.id,
          externalAdSetId: adSet.externalAdSetId,
          name: adSet.name,
          status: adSet.status,
          rawStatus: 'ACTIVE',
          dailyBudget: adSet.dailyBudget,
          startDate: adSet.startDate,
          lastSyncedAt: new Date(),
        },
      });

      for (const ad of adSet.ads) {
        await prisma.ad.create({
          data: {
            tenantId,
            campaignId: createdCampaign.id,
            adSetId: createdAdSet.id,
            externalAdId: ad.externalAdId,
            name: ad.name,
            status: ad.status,
            rawStatus: 'ACTIVE',
            lastSyncedAt: new Date(),
          },
        });
      }
    }

    for (const daily of campaign.dailySpend) {
      await prisma.dailySpend.create({
        data: {
          tenantId,
          campaignId: createdCampaign.id,
          date: daily.date,
          spend: daily.spend,
          impressions: daily.impressions,
          clicks: daily.clicks,
          results: daily.results,
          resultType: daily.resultType,
          costPerResult: daily.results > 0 ? Math.round((daily.spend / daily.results) * 100) / 100 : null,
          currency: campaign.currency,
        },
      });
    }
  }
  console.log(`  ${scenario.campaigns.length} campaigns with ad sets, ads and daily spend`);

  console.log('Targets this dataset reconciles to:');
  console.table(scenario.targets);
}

main()
  .catch((err) => {
    console.error('Seed failed', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
