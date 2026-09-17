/**
 * Financial metrics for one campaign over some window (typically its
 * lifetime or a reporting period). This "prepares the system" for the
 * profitability metrics ProfitFlow AI ultimately reports - today only
 * `adSpend` is populated from the Meta Ads integration (via DailySpend);
 * `deliveredOrdersCount`, `newCustomersAcquired`, `attributedRevenue`,
 * `cogs`, `deliveryCost` and `paymentFees` are filled in once the
 * orders/delivery/cost data is joined in (see ARCHITECTURE.md's Profit
 * Engine, §2.4) - the formulas below are final regardless of when each
 * input becomes available, so callers can wire them in incrementally
 * without this module changing.
 */
export interface CampaignFinancialInputs {
  /** Total Meta ad spend for the campaign over the window (sum of DailySpend.spend). */
  adSpend: number;
  /** Orders confirmed DELIVERED (not just "results" reported by Meta) - from the delivery integration. */
  deliveredOrdersCount: number;
  /** Distinct new customers attributed to this campaign - from the orders module. */
  newCustomersAcquired: number;
  /** Revenue attributed to this campaign's delivered orders. */
  attributedRevenue: number;
  /** Cost of goods sold for the attributed delivered orders. */
  cogs: number;
  /** Delivery-provider fees (base + return fees) for the attributed orders. */
  deliveryCost: number;
  /** Payment/COD-collection gateway fees for the attributed orders. */
  paymentFees: number;
}

export interface CampaignFinancialMetrics {
  /** Customer Acquisition Cost: adSpend / newCustomersAcquired. Null if no customers acquired. */
  cac: number | null;
  /** Return on Ad Spend: attributedRevenue / adSpend. Null if no spend. */
  roas: number | null;
  /** adSpend / deliveredOrdersCount - the COD-aware cost metric (vs. Meta's own "cost per result"). */
  costPerDeliveredOrder: number | null;
  /** attributedRevenue - cogs - deliveryCost - adSpend - paymentFees. */
  profit: number;
  /** profit / attributedRevenue * 100. Null if no attributed revenue. */
  marginPct: number | null;
}

export const ProfitMetricsCalculator = {
  calculate(inputs: CampaignFinancialInputs): CampaignFinancialMetrics {
    const profit = round2(
      inputs.attributedRevenue - inputs.cogs - inputs.deliveryCost - inputs.adSpend - inputs.paymentFees,
    );

    return {
      cac: divideOrNull(inputs.adSpend, inputs.newCustomersAcquired),
      roas: divideOrNull(inputs.attributedRevenue, inputs.adSpend),
      costPerDeliveredOrder: divideOrNull(inputs.adSpend, inputs.deliveredOrdersCount),
      profit,
      marginPct: inputs.attributedRevenue > 0 ? round2((profit / inputs.attributedRevenue) * 100) : null,
    };
  },
};

function divideOrNull(numerator: number, denominator: number): number | null {
  return denominator > 0 ? round2(numerator / denominator) : null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
