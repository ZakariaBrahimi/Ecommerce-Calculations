import { buildDemoScenario } from '../../../prisma/seed-data/demoScenario';

describe('buildDemoScenario', () => {
  const scenario = buildDemoScenario();

  it('produces exactly 161 orders received', () => {
    expect(scenario.deliveryOrders).toHaveLength(161);
  });

  it('reconciles the delivery funnel to the example scenario', () => {
    const counts = countByStatus(scenario);

    const confirmedOrBetter =
      counts.CONFIRMED + counts.SHIPPED + counts.DELIVERED + counts.RETURNED + counts.FAILED;

    expect(scenario.deliveryOrders.length).toBe(161);
    expect(confirmedOrBetter).toBe(140);
    expect(counts.DELIVERED).toBe(87);

    expect(scenario.targets.confirmationRatePct).toBeCloseTo(86.96, 2);
    expect(scenario.targets.deliveryRatePct).toBeCloseTo(62.14, 2);
    expect(scenario.targets.overallSuccessRatePct).toBeCloseTo(54.04, 2);
  });

  it('reconciles revenue and product cost to the exact target totals', () => {
    const delivered = scenario.deliveryOrders.filter((o) => o.internalStatus === 'DELIVERED');
    expect(delivered).toHaveLength(87);

    const revenue = round2(sum(delivered.map((o) => o.orderValue ?? 0)));
    const productCost = round2(sum(delivered.map((o) => o.productCost ?? 0)));

    expect(revenue).toBe(243_600);
    expect(productCost).toBe(121_800);
  });

  it('only DELIVERED orders carry a recognized orderValue/productCost', () => {
    for (const order of scenario.deliveryOrders) {
      if (order.internalStatus === 'DELIVERED') {
        expect(order.orderValue).not.toBeNull();
        expect(order.productCost).not.toBeNull();
        expect(order.productCost).toBeCloseTo((order.orderValue ?? 0) * 0.5, 2);
      } else {
        expect(order.orderValue).toBeNull();
        expect(order.productCost).toBeNull();
      }
    }
  });

  it('reconciles total Meta Ads spend to the exact target', () => {
    const totalAdsSpend = round2(
      sum(scenario.campaigns.flatMap((c) => c.dailySpend.map((d) => d.spend))),
    );
    expect(totalAdsSpend).toBe(52_325);
    expect(scenario.targets.adsCost).toBe(52_325);
  });

  it('reconciles total cost, net profit, margin and profit-per-delivered-order', () => {
    expect(scenario.targets.totalCost).toBe(174_125);
    expect(scenario.targets.netProfit).toBe(69_475);
    expect(scenario.targets.profitMarginPct).toBeCloseTo(28.52, 1);
    expect(scenario.targets.profitPerDeliveredOrder).toBeCloseTo(799, 0);
  });

  it('gives every delivery order a tracking number unique within the dataset', () => {
    const trackingNumbers = new Set(scenario.deliveryOrders.map((o) => o.trackingNumber));
    expect(trackingNumbers.size).toBe(scenario.deliveryOrders.length);
  });

  it('is fully deterministic across calls (same seed, same output)', () => {
    const again = buildDemoScenario();
    expect(again.deliveryOrders.map((o) => o.trackingNumber)).toEqual(
      scenario.deliveryOrders.map((o) => o.trackingNumber),
    );
    expect(again.targets).toEqual(scenario.targets);
  });
});

function countByStatus(scenario: ReturnType<typeof buildDemoScenario>): Record<string, number> {
  const counts: Record<string, number> = { NEW: 0, CONFIRMED: 0, SHIPPED: 0, DELIVERED: 0, RETURNED: 0, FAILED: 0 };
  for (const order of scenario.deliveryOrders) counts[order.internalStatus] += 1;
  return counts;
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
