/**
 * Deterministic demo dataset for ProfitFlow AI, reconciling exactly to a
 * given example scenario (161 orders received / 140 confirmed / 87
 * delivered, 243,600 DZD revenue, 121,800 DZD product cost, 52,325 DZD
 * Facebook ad spend). Pure data generation - no Prisma, no I/O - so the
 * numbers can be asserted on in a fast unit test before anything ever
 * touches a database (see test/unit/seed/demoScenario.test.ts).
 *
 * Revenue/product cost are only meaningful once an order is DELIVERED
 * (COD: nothing is actually collected before that), so only the 87
 * DELIVERED orders are constrained to reconcile to the target totals;
 * every other order still carries a realistic product/price/cost, it just
 * isn't counted as revenue.
 */

export type DemoDeliveryStatus = 'NEW' | 'CONFIRMED' | 'SHIPPED' | 'DELIVERED' | 'FAILED' | 'RETURNED';

export interface DemoDeliveryOrder {
  externalOrderId: string;
  trackingNumber: string;
  customerName: string;
  customerPhone: string;
  address: string;
  commune: string;
  wilaya: string;
  deliveryFee: number;
  productName: string;
  quantity: number;
  /** Revenue - null unless internalStatus is DELIVERED. */
  orderValue: number | null;
  /** COGS - null unless internalStatus is DELIVERED. */
  productCost: number | null;
  internalStatus: DemoDeliveryStatus;
  rawStatus: string;
  placedAt: Date;
  lastSyncedAt: Date;
}

export interface DemoDailySpend {
  date: Date;
  spend: number;
  impressions: number;
  clicks: number;
  results: number;
  resultType: string;
}

export interface DemoAd {
  externalAdId: string;
  name: string;
  status: 'ACTIVE' | 'PAUSED' | 'STOPPED';
}

export interface DemoAdSet {
  externalAdSetId: string;
  name: string;
  status: 'ACTIVE' | 'PAUSED' | 'STOPPED';
  dailyBudget: number;
  startDate: Date;
  ads: DemoAd[];
}

export interface DemoCampaign {
  externalCampaignId: string;
  name: string;
  objective: string;
  status: 'ACTIVE' | 'PAUSED' | 'STOPPED';
  dailyBudget: number;
  currency: string;
  startDate: Date;
  endDate: Date | null;
  adSets: DemoAdSet[];
  dailySpend: DemoDailySpend[];
}

export interface DemoScenario {
  tenantId: string;
  adAccountId: string;
  currency: string;
  deliveryOrders: DemoDeliveryOrder[];
  campaigns: DemoCampaign[];
  targets: {
    ordersReceived: number;
    confirmed: number;
    delivered: number;
    confirmationRatePct: number;
    deliveryRatePct: number;
    overallSuccessRatePct: number;
    revenue: number;
    productCost: number;
    adsCost: number;
    totalCost: number;
    netProfit: number;
    profitMarginPct: number;
    profitPerDeliveredOrder: number;
  };
}

// --- Deterministic RNG (mulberry32) - same seed always produces the same dataset. ---
function mulberry32(seed: number) {
  let a = seed;
  return function rng(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)];
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

const FIRST_NAMES = [
  'Mohamed', 'Ahmed', 'Yacine', 'Karim', 'Islam', 'Abderrahmane', 'Amine', 'Riadh', 'Bilal', 'Walid',
  'Sofiane', 'Nabil', 'Reda', 'Fouad', 'Samir', 'Yassine', 'Amina', 'Fatima', 'Khadidja', 'Meriem',
  'Nour', 'Sarah', 'Imane', 'Rania', 'Lina', 'Yasmine', 'Hana', 'Ines', 'Sabrina', 'Chaima',
] as const;

const LAST_NAMES = [
  'Benali', 'Boumediene', 'Cherif', 'Djelloul', 'Hamdi', 'Khelifi', 'Larbi', 'Mansouri', 'Meziane',
  'Rahmani', 'Saidi', 'Tayeb', 'Zerrouki', 'Belkacem', 'Bouzid', 'Chaouch', 'Djebbar', 'Ferhat',
  'Guettaf', 'Haddad',
] as const;

/** Wilaya + a couple of its communes + Elogistia's real home-delivery fee for it (see docs/integrations/elogistia-api.md). */
const REGIONS = [
  { wilaya: 'Alger', communes: ['Alger Centre', 'Bab Ezzouar', 'Hydra', 'Kouba'], deliveryFee: 400 },
  { wilaya: 'Blida', communes: ['Blida Centre', 'Boufarik', 'Larbaa'], deliveryFee: 600 },
  { wilaya: 'Boumerdes', communes: ['Boumerdes Centre', 'Boudouaou'], deliveryFee: 600 },
  { wilaya: 'Tipaza', communes: ['Tipaza Centre', 'Koléa'], deliveryFee: 600 },
  { wilaya: 'Bouira', communes: ['Bouira Centre', 'Lakhdaria'], deliveryFee: 630 },
  { wilaya: 'Tizi Ouzou', communes: ['Tizi Ouzou Centre', 'Draa Ben Khedda'], deliveryFee: 630 },
  { wilaya: 'Medea', communes: ['Medea Centre', 'Berrouaghia'], deliveryFee: 630 },
] as const;

/** Every product's cost is exactly 50% of its price, matching the example's 121,800 / 243,600 ratio. */
const PRODUCTS = [
  { name: 'Air Runner Classic', price: 2200 },
  { name: 'Urban Trail Sneaker', price: 2800 },
  { name: 'StreetLine High-Top', price: 3200 },
  { name: 'EcoKnit Runner', price: 2500 },
  { name: 'Pro Court Sneaker', price: 3500 },
  { name: 'Classic Canvas Low', price: 1800 },
] as const;

const RAW_STATUS_BY_INTERNAL: Record<DemoDeliveryStatus, string> = {
  NEW: 'Brouillon',
  CONFIRMED: 'À ramasser',
  SHIPPED: 'En cours livraison',
  DELIVERED: 'Livrée',
  RETURNED: 'Retour reçu',
  FAILED: 'Annulée',
};

function trackingNumberFor(rng: () => number, index: number): string {
  const suffix = Math.floor(rng() * 900 + 100);
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const a = letters[Math.floor(rng() * letters.length)];
  const b = letters[Math.floor(rng() * letters.length)];
  return `ELO-${35 + (index % 5)}${a}${b}-${String(index).padStart(5, '0')}${suffix}`;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setUTCHours(9, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}

export function buildDemoScenario(): DemoScenario {
  const rng = mulberry32(0xa11ce);

  const ordersReceived = 161;
  const confirmed = 140;
  const delivered = 87;

  // Reconciles exactly: 21 NEW + 5 CONFIRMED + 8 SHIPPED + 87 DELIVERED + 35 RETURNED + 5 FAILED = 161,
  // and 5 + 8 + 87 + 35 + 5 = 140 "reached at least confirmed".
  const statusPlan: Array<{ status: DemoDeliveryStatus; count: number }> = [
    { status: 'DELIVERED', count: 87 },
    { status: 'RETURNED', count: 35 },
    { status: 'NEW', count: 21 },
    { status: 'SHIPPED', count: 8 },
    { status: 'CONFIRMED', count: 5 },
    { status: 'FAILED', count: 5 },
  ];

  const targetRevenue = 243_600;
  const targetProductCost = 121_800; // exactly 50% of targetRevenue
  const targetAdsCost = 52_325;

  const deliveryOrders: DemoDeliveryOrder[] = [];
  let orderIndex = 0;
  let deliveredCount = 0;
  let deliveredRevenueSoFar = 0;

  for (const { status, count } of statusPlan) {
    for (let i = 0; i < count; i += 1) {
      orderIndex += 1;
      const region = pick(rng, REGIONS);
      const commune = pick(rng, region.communes);
      const product = pick(rng, PRODUCTS);
      const quantity = rng() < 0.15 ? 2 : 1;
      const placedAt = daysAgo(Math.floor(rng() * 28) + 1);

      let orderValue: number | null = null;
      let productCost: number | null = null;

      if (status === 'DELIVERED') {
        deliveredCount += 1;
        if (deliveredCount < count) {
          // count === 87 here since DELIVERED is processed first in statusPlan
          orderValue = round2(product.price * quantity);
          deliveredRevenueSoFar += orderValue;
        } else {
          // Last delivered order absorbs the remainder so the 87 DELIVERED
          // orders reconcile to targetRevenue exactly, penny for penny.
          orderValue = round2(targetRevenue - deliveredRevenueSoFar);
        }
        productCost = round2(orderValue * 0.5);
      }

      deliveryOrders.push({
        externalOrderId: `ord-${1000 + orderIndex}`,
        trackingNumber: trackingNumberFor(rng, orderIndex),
        customerName: `${pick(rng, FIRST_NAMES)} ${pick(rng, LAST_NAMES)}`,
        customerPhone: `05${Math.floor(rng() * 9) + 1}${String(Math.floor(rng() * 10_000_000)).padStart(7, '0')}`,
        address: `${Math.floor(rng() * 90) + 1} Rue ${pick(rng, LAST_NAMES)}`,
        commune,
        wilaya: region.wilaya,
        deliveryFee: region.deliveryFee,
        productName: quantity > 1 ? `${product.name} (x${quantity})` : product.name,
        quantity,
        orderValue,
        productCost,
        internalStatus: status,
        rawStatus: RAW_STATUS_BY_INTERNAL[status],
        placedAt,
        lastSyncedAt: daysAgo(Math.floor(rng() * 2)),
      });
    }
  }

  // --- Meta Ads: two campaigns whose combined spend reconciles to targetAdsCost. ---
  // The second campaign's budget is the exact remainder (not its own rounded
  // share) so the two campaigns' totals always add up to targetAdsCost to
  // the centime, regardless of rounding.
  const firstCampaignBudget = round2(targetAdsCost * 0.656);
  const campaignPlan = [
    { name: 'Sneaker Restock — Alger & Blida', budget: firstCampaignBudget },
    { name: 'Retargeting — Cart Abandoners', budget: round2(targetAdsCost - firstCampaignBudget) },
  ];

  const campaigns: DemoCampaign[] = campaignPlan.map((plan, campaignIdx) => {
    const campaignBudget = plan.budget;
    const days = 14;
    const dailySpend: DemoDailySpend[] = [];
    let spentSoFar = 0;

    for (let day = days - 1; day >= 0; day -= 1) {
      const isLastDay = day === 0;
      const baseShare = campaignBudget / days;
      const jitter = 0.7 + rng() * 0.6; // daily spend varies +/-30%
      let spend = round2(baseShare * jitter);

      if (isLastDay) {
        // Absorb rounding so this campaign's own days sum exactly to campaignBudget.
        spend = round2(campaignBudget - spentSoFar);
      }
      spentSoFar = round2(spentSoFar + spend);

      const clicks = Math.round(spend / (18 + rng() * 6));
      const results = Math.max(0, Math.round(clicks * (0.08 + rng() * 0.05)));

      dailySpend.push({
        date: daysAgo(day),
        spend,
        impressions: Math.round(clicks * (14 + rng() * 8)),
        clicks,
        results,
        resultType: 'omni_purchase',
      });
    }

    const externalCampaignId = `120000${campaignIdx + 1}`;
    return {
      externalCampaignId,
      name: plan.name,
      objective: 'OUTCOME_SALES',
      status: 'ACTIVE',
      dailyBudget: round2(campaignBudget / days),
      currency: 'DZD',
      startDate: daysAgo(days - 1),
      endDate: null,
      dailySpend,
      adSets: [
        {
          externalAdSetId: `${externalCampaignId}-as1`,
          name: `${plan.name} — Broad`,
          status: 'ACTIVE',
          dailyBudget: round2((campaignBudget / days) * 0.6),
          startDate: daysAgo(days - 1),
          ads: [
            { externalAdId: `${externalCampaignId}-ad1`, name: `${plan.name} — Carousel`, status: 'ACTIVE' },
            { externalAdId: `${externalCampaignId}-ad2`, name: `${plan.name} — Video`, status: 'ACTIVE' },
          ],
        },
      ],
    };
  });

  const totalAdsCost = round2(campaigns.reduce((sum, c) => sum + c.dailySpend.reduce((s, d) => s + d.spend, 0), 0));
  const totalCost = round2(targetProductCost + totalAdsCost);
  const netProfit = round2(targetRevenue - totalCost);

  return {
    tenantId: 'demo-tenant',
    adAccountId: 'act_demo_1',
    currency: 'DZD',
    deliveryOrders,
    campaigns,
    targets: {
      ordersReceived,
      confirmed,
      delivered,
      confirmationRatePct: round2((confirmed / ordersReceived) * 100),
      deliveryRatePct: round2((delivered / confirmed) * 100),
      overallSuccessRatePct: round2((delivered / ordersReceived) * 100),
      revenue: targetRevenue,
      productCost: targetProductCost,
      adsCost: totalAdsCost,
      totalCost,
      netProfit,
      profitMarginPct: round2((netProfit / targetRevenue) * 100),
      profitPerDeliveredOrder: round2(netProfit / delivered),
    },
  };
}
