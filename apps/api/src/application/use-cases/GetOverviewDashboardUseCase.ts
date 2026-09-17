import { DeliveryOrderRepository } from '../../domain/ports/DeliveryOrderRepository';
import { DailySpendRepository } from '../../domain/ports/DailySpendRepository';
import { InternalDeliveryStatus } from '../../domain/enums/InternalDeliveryStatus';
import { ProfitMetricsCalculator } from '../../domain/services/ProfitMetricsCalculator';

export interface OverviewDashboard {
  orders: {
    received: number;
    confirmed: number;
    delivered: number;
    returned: number;
    confirmationRatePct: number | null;
    deliveryRatePct: number | null;
    overallSuccessRatePct: number | null;
  };
  finance: {
    revenue: number;
    productCost: number;
    deliveryCost: number;
    adsCost: number;
    totalCost: number;
    netProfit: number;
    profitMarginPct: number | null;
    roas: number | null;
    profitPerDeliveredOrder: number | null;
    /** Null until the orders module tracks distinct customers (see ARCHITECTURE.md) - never guessed. */
    cac: number | null;
    currency: string;
  };
}

/**
 * The "Overview" + "Delivery Funnel" + "Profit Breakdown" sections of the
 * dashboard in one query: joins delivery outcomes (Elogistia) with ad spend
 * (Meta Ads) - the two integrations were built independently, this is where
 * their data finally meets, exactly as ARCHITECTURE.md's Profit Engine
 * described. Revenue/product cost are only counted once DELIVERED (see
 * DeliveryOrder's doc comment - COD means nothing is actually collected
 * before that).
 */
export class GetOverviewDashboardUseCase {
  constructor(
    private readonly deliveryOrders: DeliveryOrderRepository,
    private readonly dailySpend: DailySpendRepository,
  ) {}

  async execute(input: { tenantId: string }): Promise<OverviewDashboard> {
    const [orders, dailySpendRows] = await Promise.all([
      this.deliveryOrders.list(input.tenantId),
      this.dailySpend.listByTenant(input.tenantId),
    ]);

    const counts = {
      received: orders.length,
      confirmed: 0,
      delivered: 0,
      returned: 0,
    };
    let revenue = 0;
    let productCost = 0;
    let deliveryCost = 0;
    let currency = 'USD';

    for (const order of orders) {
      const p = order.toPrimitives();
      if (p.internalStatus !== InternalDeliveryStatus.NEW) counts.confirmed += 1;
      if (p.internalStatus === InternalDeliveryStatus.RETURNED) counts.returned += 1;

      if (p.internalStatus === InternalDeliveryStatus.DELIVERED) {
        counts.delivered += 1;
        revenue += p.orderValue ?? 0;
        productCost += p.productCost ?? 0;
        deliveryCost += p.deliveryFee ?? 0;
      }
    }

    const adsCost = dailySpendRows.reduce((sum, row) => sum + row.toPrimitives().spend, 0);
    if (dailySpendRows[0]) currency = dailySpendRows[0].toPrimitives().currency ?? currency;

    const metrics = ProfitMetricsCalculator.calculate({
      adSpend: adsCost,
      deliveredOrdersCount: counts.delivered,
      // No distinct-customer tracking yet (no dedup on the orders module) -
      // 0 forces CAC to surface as null rather than a guessed number.
      newCustomersAcquired: 0,
      attributedRevenue: revenue,
      cogs: productCost,
      deliveryCost,
      paymentFees: 0,
    });

    return {
      orders: {
        ...counts,
        confirmationRatePct: ratio(counts.confirmed, counts.received),
        deliveryRatePct: ratio(counts.delivered, counts.confirmed),
        overallSuccessRatePct: ratio(counts.delivered, counts.received),
      },
      finance: {
        revenue: round2(revenue),
        productCost: round2(productCost),
        deliveryCost: round2(deliveryCost),
        adsCost: round2(adsCost),
        totalCost: round2(productCost + deliveryCost + adsCost),
        netProfit: metrics.profit,
        profitMarginPct: metrics.marginPct,
        roas: metrics.roas,
        profitPerDeliveredOrder: counts.delivered > 0 ? round2(metrics.profit / counts.delivered) : null,
        cac: metrics.cac,
        currency,
      },
    };
  }
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? Math.round((numerator / denominator) * 10000) / 100 : null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
