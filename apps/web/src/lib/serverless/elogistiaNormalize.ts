/**
 * Raw-shape parsing and status normalization for Elogistia, reimplemented
 * standalone for the stateless serverless integration (mirrors
 * apps/api/src/infrastructure/providers/elogistia/{ElogistiaResponseParser,
 * ElogistiaStatusMapper,ElogistiaStatusLabels}.ts - see
 * docs/integrations/elogistia-api.md for the field-shape rationale).
 */

export type NormalizedDeliveryStatus =
  | 'pending'
  | 'in_transit'
  | 'delivered'
  | 'returned'
  | 'cancelled'
  | 'lost'
  | 'exception'
  | 'unknown';

const STATUS_MAP: ReadonlyMap<string, NormalizedDeliveryStatus> = new Map([
  ['brouillon', 'pending'],

  ['à ramasser', 'pending'],
  ['a ramasser', 'pending'],
  ['ramassage à relancer', 'pending'],
  ['ramassage a relancer', 'pending'],
  ['à remettre', 'pending'],
  ['a remettre', 'pending'],

  ['en cours de ramassage', 'in_transit'],
  ['ramassée', 'in_transit'],
  ['ramassee', 'in_transit'],
  ['à expédiée', 'in_transit'],
  ['a expediee', 'in_transit'],
  ['en transit', 'in_transit'],
  ['en hub', 'in_transit'],
  ['en cours livraison', 'in_transit'],
  ['en cours de livraison', 'in_transit'],
  ['réceptionnée', 'in_transit'],
  ['receptionnee', 'in_transit'],

  ['livrée', 'delivered'],
  ['livree', 'delivered'],
  ['livrée & réglée', 'delivered'],
  ['livree & reglee', 'delivered'],

  ['retour reçu', 'returned'],
  ['retour recu', 'returned'],
  ['retour en transit', 'returned'],
  ['retour remis', 'returned'],
  ['partiel remis', 'returned'],

  ['annulée', 'cancelled'],
  ['annulee', 'cancelled'],

  ['perdue', 'lost'],
  ['cassée', 'lost'],
  ['cassee', 'lost'],

  ['suspendue', 'exception'],
  ['partiel', 'exception'],
]);

export function mapElogistiaStatus(rawStatus: string): NormalizedDeliveryStatus {
  return STATUS_MAP.get(rawStatus.trim().toLowerCase()) ?? 'unknown';
}

export interface NormalizedOrder {
  externalOrderId: string | null;
  trackingNumber: string;
  customerName: string | null;
  customerPhone: string | null;
  address: string | null;
  commune: string | null;
  wilaya: string | null;
  deliveryFee: number | null;
  rawStatus: string;
  status: NormalizedDeliveryStatus;
}

interface OrderDetailRow {
  CommandeID?: string;
  Nom?: string;
  ['Prénom']?: string;
  Tracking?: string;
  Addresse?: string;
  ['Téléphone']?: string;
  ['Commune ']?: string;
  ['Wilaya ']?: string;
  ['Frais de livraison']?: string | number;
  Status?: string;
}

interface OrderListRow {
  name?: string;
  firstname?: string;
  suivi?: string;
  address?: string;
  ['Commuhne ']?: string | number;
  ['Commune ']?: string | number;
  ['Téléphone']?: string;
  ['Frais de livraison']?: string | number;
  ['Validation Elogistia']?: string | number;
}

/** getOrders returns a different shape depending on whether `tracking` was passed - see docs §1.5. */
export function normalizeOrders(body: unknown, hadTrackingFilter: boolean): NormalizedOrder[] {
  const rows = extractBodyArray(body);
  return hadTrackingFilter
    ? rows.map((row) => normalizeOrderDetail(row as OrderDetailRow))
    : rows.map((row) => normalizeOrderListRow(row as OrderListRow));
}

function normalizeOrderDetail(row: OrderDetailRow): NormalizedOrder {
  const rawStatus = row.Status ?? '';
  return {
    externalOrderId: row.CommandeID ?? null,
    trackingNumber: row.Tracking ?? '',
    customerName: joinName(row.Nom, row['Prénom']),
    customerPhone: row['Téléphone'] ?? null,
    address: row.Addresse ?? null,
    commune: trimOrNull(row['Commune ']),
    wilaya: trimOrNull(row['Wilaya ']),
    deliveryFee: toNumberOrNull(row['Frais de livraison']),
    rawStatus,
    status: mapElogistiaStatus(rawStatus),
  };
}

function normalizeOrderListRow(row: OrderListRow): NormalizedOrder {
  // No text status is exposed on this shape - only a numeric "Validation
  // Elogistia" code with no published mapping table (see docs §1.5) -
  // callers should follow up with /api/elogistia/statuses for a usable status.
  const rawStatus = row['Validation Elogistia'] !== undefined ? `elogistia-code:${row['Validation Elogistia']}` : '';
  return {
    externalOrderId: null,
    trackingNumber: row.suivi ?? '',
    customerName: joinName(row.name, row.firstname),
    customerPhone: row['Téléphone'] ?? null,
    address: row.address ?? null,
    commune: trimOrNull(row['Commuhne '] ?? row['Commune ']),
    wilaya: null,
    deliveryFee: toNumberOrNull(row['Frais de livraison']),
    rawStatus,
    status: 'unknown',
  };
}

export interface NormalizedStatus {
  trackingNumber: string;
  rawStatus: string;
  status: NormalizedDeliveryStatus;
  occurredAt: string | null;
}

interface TrackingHistoryEntry {
  logtext?: string;
  Statut?: string;
  Date?: string;
}

interface ManyTrackingRow {
  tracking?: string;
  historique?: TrackingHistoryEntry[];
}

/** getManyTracking - latest status per tracking number, for routine bulk polling. */
export function normalizeManyTracking(body: unknown): NormalizedStatus[] {
  if (!Array.isArray(body)) {
    throw new Error('Expected Elogistia getManyTracking response to be an array');
  }

  const results: NormalizedStatus[] = [];
  for (const entry of body as ManyTrackingRow[]) {
    if (!entry.tracking) continue;
    const latest = latestEntry(entry.historique ?? []);
    const rawStatus = latest?.Statut ?? latest?.logtext ?? '';
    results.push({
      trackingNumber: entry.tracking,
      rawStatus,
      status: mapElogistiaStatus(rawStatus),
      occurredAt: latest ? parseElogistiaDate(latest.Date) : null,
    });
  }
  return results;
}

export interface NormalizedTrackingHistory {
  trackingNumber: string;
  currentStatus: NormalizedDeliveryStatus;
  currentRawStatus: string;
  history: Array<{ rawStatus: string; status: NormalizedDeliveryStatus; occurredAt: string | null }>;
}

/** getTracking - full status history/log for one tracking number, oldest first. */
export function normalizeSingleTracking(body: unknown, trackingNumber: string): NormalizedTrackingHistory {
  const rows = extractBodyArray(body) as TrackingHistoryEntry[];
  const history = rows
    .map((row) => ({
      rawStatus: row.Statut ?? row.logtext ?? '',
      status: mapElogistiaStatus(row.Statut ?? row.logtext ?? ''),
      occurredAt: parseElogistiaDate(row.Date),
    }))
    .sort((a, b) => (a.occurredAt ?? '').localeCompare(b.occurredAt ?? ''));

  const latest = history[history.length - 1];
  return {
    trackingNumber,
    currentStatus: latest?.status ?? 'unknown',
    currentRawStatus: latest?.rawStatus ?? '',
    history,
  };
}

function latestEntry(history: TrackingHistoryEntry[]): TrackingHistoryEntry | undefined {
  const withStatus = history.filter((h) => h.Statut && h.Statut.trim() !== '');
  const pool = withStatus.length > 0 ? withStatus : history;
  if (pool.length === 0) return undefined;
  return pool.reduce((latest, current) =>
    (parseElogistiaDate(current.Date) ?? '') > (parseElogistiaDate(latest.Date) ?? '') ? current : latest,
  );
}

function extractBodyArray(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  if (body && typeof body === 'object' && Array.isArray((body as { body?: unknown }).body)) {
    return (body as { body: unknown[] }).body;
  }
  throw new Error('Expected Elogistia response to contain a "body" array');
}

function joinName(first?: string, last?: string): string | null {
  const joined = [first, last].filter((part) => part && part.trim() !== '').join(' ').trim();
  return joined === '' ? null : joined;
}

function trimOrNull(value: string | number | undefined): string | null {
  if (value === undefined || value === null) return null;
  const str = String(value).trim();
  return str === '' ? null : str;
}

function toNumberOrNull(value: string | number | undefined): number | null {
  if (value === undefined || value === null || value === '') return null;
  const num = Number(value);
  return Number.isNaN(num) ? null : num;
}

/** Elogistia dates are "YYYY-MM-DD HH:mm:ss" with no timezone documented - treated as UTC, returned as ISO 8601. */
function parseElogistiaDate(date: string | undefined): string | null {
  if (!date) return null;
  const iso = date.includes('T') ? date : `${date.replace(' ', 'T')}Z`;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}
