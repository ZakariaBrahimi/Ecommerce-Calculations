import { GetOverviewDashboardUseCase } from '../../../src/application/use-cases/GetOverviewDashboardUseCase';
import { InMemoryDeliveryOrderRepository } from '../../../src/infrastructure/persistence/in-memory/InMemoryDeliveryOrderRepository';
import { InMemoryDailySpendRepository } from '../../../src/infrastructure/persistence/in-memory/InMemoryDailySpendRepository';
import { DeliveryOrder } from '../../../src/domain/entities/DeliveryOrder';
import { DailySpend } from '../../../src/domain/entities/DailySpend';
import { InternalDeliveryStatus } from '../../../src/domain/enums/InternalDeliveryStatus';

const TENANT = 'tenant-1';

function makeOrder(
  trackingNumber: string,
  status: InternalDeliveryStatus,
  orderValue: number | null,
  productCost: number | null,
  deliveryFee: number | null = 50,
) {
  return DeliveryOrder.create({
    tenantId: TENANT,
    provider: 'elogistia',
    externalOrderId: null,
    trackingNumber,
    customerName: null,
    customerPhone: null,
    address: null,
    commune: null,
    wilaya: null,
    deliveryFee,
    orderValue,
    productCost,
    internalStatus: status,
    rawStatus: status,
    lastSyncedAt: null,
  });
}

function makeSpend(campaignId: string, spend: number, date: string) {
  return DailySpend.create({
    tenantId: TENANT,
    campaignId,
    date: new Date(date),
    spend,
    impressions: 100,
    clicks: 10,
    results: 1,
    resultType: 'omni_purchase',
    purchases: 1,
    purchaseValue: 0,
    currency: 'DZD',
  });
}

describe('GetOverviewDashboardUseCase', () => {
  it('reconciles the delivery funnel, revenue/cost totals and profit metrics', async () => {
    const orders = new InMemoryDeliveryOrderRepository();
    const dailySpend = new InMemoryDailySpendRepository();

    // 5 received: 1 NEW, 1 CONFIRMED, 3 DELIVERED (revenue/cost only counted for these).
    await orders.upsert(makeOrder('t-new', InternalDeliveryStatus.NEW, null, null, null));
    await orders.upsert(makeOrder('t-confirmed', InternalDeliveryStatus.CONFIRMED, null, null, null));
    await orders.upsert(makeOrder('t-returned', InternalDeliveryStatus.RETURNED, null, null, null));
    await orders.upsert(makeOrder('t-d1', InternalDeliveryStatus.DELIVERED, 1000, 500, 50));
    await orders.upsert(makeOrder('t-d2', InternalDeliveryStatus.DELIVERED, 2000, 1000, 50));

    await dailySpend.upsert(makeSpend('camp-1', 300, '2024-06-01'));
    await dailySpend.upsert(makeSpend('camp-1', 200, '2024-06-02'));

    const useCase = new GetOverviewDashboardUseCase(orders, dailySpend);
    const overview = await useCase.execute({ tenantId: TENANT });

    expect(overview.orders).toEqual({
      received: 5,
      confirmed: 4, // everything except the single NEW order
      delivered: 2,
      returned: 1,
      confirmationRatePct: 80,
      deliveryRatePct: 50,
      overallSuccessRatePct: 40,
    });

    // revenue = 1000 + 2000, productCost = 500 + 1000, deliveryCost = 50 + 50, adsCost = 300 + 200
    expect(overview.finance.revenue).toBe(3000);
    expect(overview.finance.productCost).toBe(1500);
    expect(overview.finance.deliveryCost).toBe(100);
    expect(overview.finance.adsCost).toBe(500);
    expect(overview.finance.totalCost).toBe(2100); // 1500 + 100 + 500
    expect(overview.finance.netProfit).toBe(900); // 3000 - 2100
    expect(overview.finance.roas).toBe(6); // 3000 / 500
    expect(overview.finance.profitPerDeliveredOrder).toBe(450); // 900 / 2
    // No distinct-customer tracking yet - CAC must be null, never guessed.
    expect(overview.finance.cac).toBeNull();
  });

  it('returns nulls for every ratio/metric when there is no data yet', async () => {
    const useCase = new GetOverviewDashboardUseCase(
      new InMemoryDeliveryOrderRepository(),
      new InMemoryDailySpendRepository(),
    );

    const overview = await useCase.execute({ tenantId: 'empty-tenant' });

    expect(overview.orders).toEqual({
      received: 0,
      confirmed: 0,
      delivered: 0,
      returned: 0,
      confirmationRatePct: null,
      deliveryRatePct: null,
      overallSuccessRatePct: null,
    });
    expect(overview.finance.netProfit).toBe(0);
    expect(overview.finance.roas).toBeNull();
    expect(overview.finance.profitPerDeliveredOrder).toBeNull();
  });
});
