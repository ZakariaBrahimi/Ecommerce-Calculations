/**
 * Per-product settings for the /live "Product performance" view - which
 * campaign(s) fund a product, its display name, and its buy/sell price.
 * There's no database (see docs/deployment-vercel-serverless.md), so this
 * lives in the browser's localStorage instead: it persists across reloads
 * on this device, but never leaves it and never touches the server, and
 * doesn't sync across devices/browsers. Keyed by the product's normalized
 * key (see elogistiaNormalize.ts's normalizeProductKey) so it survives a
 * changing display name.
 */

export interface ProductConfig {
  displayName: string;
  campaignIds: string[];
  buyPrice: number | null;
  sellPrice: number | null;
}

export type ProductConfigMap = Record<string, ProductConfig>;

const STORAGE_KEY = 'profitflow:productConfig:v1';

export function loadProductConfig(): ProductConfigMap {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ProductConfigMap) : {};
  } catch {
    return {};
  }
}

export function saveProductConfig(config: ProductConfigMap): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // Private browsing / storage disabled / quota exceeded - not critical,
    // the page still works, settings just won't be remembered next visit.
  }
}
