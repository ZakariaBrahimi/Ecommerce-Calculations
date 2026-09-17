import { ProfitMetricsCalculator } from '../../../src/domain/services/ProfitMetricsCalculator';

describe('ProfitMetricsCalculator', () => {
  it('computes CAC, ROAS, cost per delivered order, profit and margin', () => {
    const metrics = ProfitMetricsCalculator.calculate({
      adSpend: 1000,
      deliveredOrdersCount: 40,
      newCustomersAcquired: 50,
      attributedRevenue: 5000,
      cogs: 1500,
      deliveryCost: 400,
      paymentFees: 100,
    });

    expect(metrics.cac).toBe(20); // 1000 / 50
    expect(metrics.roas).toBe(5); // 5000 / 1000
    expect(metrics.costPerDeliveredOrder).toBe(25); // 1000 / 40
    expect(metrics.profit).toBe(2000); // 5000 - 1500 - 400 - 1000 - 100
    expect(metrics.marginPct).toBe(40); // 2000 / 5000 * 100
  });

  it('returns null for ratios whose denominator is zero, rather than dividing by zero', () => {
    const metrics = ProfitMetricsCalculator.calculate({
      adSpend: 500,
      deliveredOrdersCount: 0,
      newCustomersAcquired: 0,
      attributedRevenue: 0,
      cogs: 0,
      deliveryCost: 0,
      paymentFees: 0,
    });

    // cac/costPerDeliveredOrder divide BY these zero counts -> null.
    expect(metrics.cac).toBeNull();
    expect(metrics.costPerDeliveredOrder).toBeNull();
    // roas divides revenue(0) BY adSpend(500, nonzero) -> a legitimate 0, not null.
    expect(metrics.roas).toBe(0);
    // marginPct divides BY attributedRevenue(0) -> null.
    expect(metrics.marginPct).toBeNull();
    expect(metrics.profit).toBe(-500);
  });

  it('returns null for ROAS when there is no ad spend to divide by', () => {
    const metrics = ProfitMetricsCalculator.calculate({
      adSpend: 0,
      deliveredOrdersCount: 0,
      newCustomersAcquired: 0,
      attributedRevenue: 300,
      cogs: 0,
      deliveryCost: 0,
      paymentFees: 0,
    });

    expect(metrics.roas).toBeNull();
  });

  it('reports a negative profit when costs exceed attributed revenue', () => {
    const metrics = ProfitMetricsCalculator.calculate({
      adSpend: 800,
      deliveredOrdersCount: 10,
      newCustomersAcquired: 10,
      attributedRevenue: 500,
      cogs: 200,
      deliveryCost: 100,
      paymentFees: 20,
    });

    expect(metrics.profit).toBe(-620);
    expect(metrics.marginPct).toBeCloseTo(-124, 5);
  });
});
