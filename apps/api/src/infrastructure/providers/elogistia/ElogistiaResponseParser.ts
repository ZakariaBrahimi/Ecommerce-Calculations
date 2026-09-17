import { DeliveryResponseValidationError } from '../../../domain/errors/DeliveryIntegrationErrors';
import { RawDeliveryOrderRecord, RawDeliveryStatusRecord } from '../../../domain/ports/DeliveryProviderGateway';

/**
 * Elogistia's `getOrders` returns a DIFFERENT shape depending on whether a
 * `tracking` filter was supplied - not just a filtered subset of the same
 * shape. This module parses both, defensively, since field names are also
 * inconsistent (typos, trailing spaces, French/English mixes) across the
 * documented sample payloads. See docs/integrations/elogistia-api.md §1.5.
 */

// Shape returned by getOrders WITH a `tracking` param ("détails de la commande").
interface ElogistiaOrderDetailRecord {
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

// Shape returned by getOrders WITHOUT a `tracking` param ("Liste des commandes").
// No text status field is documented here, only a numeric "Validation
// Elogistia" code with no published code table - treated as unmapped.
interface ElogistiaOrderListRecord {
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

interface ElogistiaTrackingHistoryEntry {
  logtext?: string;
  Statut?: string;
  Date?: string;
  Tentative?: string;
}

interface ElogistiaManyTrackingRecord {
  tracking?: string;
  historique?: ElogistiaTrackingHistoryEntry[];
}

interface ElogistiaSingleTrackingEntry {
  Statut?: string;
  Date?: string;
  Tracking?: string;
}

export function parseOrdersResponse(body: unknown, requestedTracking: string | undefined): RawDeliveryOrderRecord[] {
  const rows = extractBodyArray(body);

  if (requestedTracking) {
    return rows.map((row) => parseOrderDetailRecord(row as ElogistiaOrderDetailRecord));
  }
  return rows.map((row) => parseOrderListRecord(row as ElogistiaOrderListRecord));
}

function parseOrderDetailRecord(row: ElogistiaOrderDetailRecord): RawDeliveryOrderRecord {
  const trackingNumber = row.Tracking;
  if (!trackingNumber) {
    throw new DeliveryResponseValidationError('Elogistia order-detail record is missing Tracking');
  }
  return {
    externalOrderId: row.CommandeID ?? null,
    trackingNumber,
    customerName: joinName(row.Nom, row['Prénom']),
    customerPhone: row['Téléphone'] ?? null,
    address: row.Addresse ?? null,
    commune: trimOrNull(row['Commune ']),
    wilaya: trimOrNull(row['Wilaya ']),
    deliveryFee: toNumberOrNull(row['Frais de livraison']),
    rawStatus: row.Status ?? '',
  };
}

function parseOrderListRecord(row: ElogistiaOrderListRecord): RawDeliveryOrderRecord {
  const trackingNumber = row.suivi;
  if (!trackingNumber) {
    throw new DeliveryResponseValidationError('Elogistia order-list record is missing suivi (tracking)');
  }
  // No external order id is exposed on this endpoint shape - only a
  // customer id ("id de client"), which is not the same thing.
  return {
    externalOrderId: null,
    trackingNumber,
    customerName: joinName(row.name, row.firstname),
    customerPhone: row['Téléphone'] ?? null,
    address: row.address ?? null,
    commune: trimOrNull(row['Commuhne '] ?? row['Commune ']),
    wilaya: null,
    deliveryFee: toNumberOrNull(row['Frais de livraison']),
    // No text status is available on this shape - only a numeric code with
    // no published mapping table. Surfaced as an unmapped raw status so the
    // use case flags it for review rather than guessing.
    rawStatus:
      row['Validation Elogistia'] !== undefined ? `elogistia-code:${row['Validation Elogistia']}` : '',
  };
}

export function parseManyTrackingResponse(body: unknown): RawDeliveryStatusRecord[] {
  if (!Array.isArray(body)) {
    throw new DeliveryResponseValidationError('Elogistia getManyTracking response was not an array');
  }

  const records: RawDeliveryStatusRecord[] = [];
  for (const entry of body as ElogistiaManyTrackingRecord[]) {
    if (!entry.tracking) continue;
    const latest = latestStatusEntry(entry.historique ?? []);
    if (!latest) continue;
    records.push({
      trackingNumber: entry.tracking,
      rawStatus: latest.Statut ?? latest.logtext ?? '',
      occurredAt: parseElogistiaDate(latest.Date),
    });
  }
  return records;
}

export function parseSingleTrackingResponse(body: unknown, trackingNumber: string): RawDeliveryStatusRecord[] {
  const rows = extractBodyArray(body) as ElogistiaSingleTrackingEntry[];
  if (rows.length === 0) return [];

  const latest = rows.reduce((mostRecent, row) => {
    const rowDate = parseElogistiaDate(row.Date);
    return rowDate > mostRecent.date ? { row, date: rowDate } : mostRecent;
  }, { row: rows[0], date: parseElogistiaDate(rows[0]?.Date) }).row;

  return [
    {
      trackingNumber: latest.Tracking ?? trackingNumber,
      rawStatus: latest.Statut ?? '',
      occurredAt: parseElogistiaDate(latest.Date),
    },
  ];
}

/** Picks the most recent history entry that has a non-empty Statut label. */
function latestStatusEntry(
  history: ElogistiaTrackingHistoryEntry[],
): ElogistiaTrackingHistoryEntry | undefined {
  const withStatus = history.filter((h) => h.Statut && h.Statut.trim() !== '');
  const pool = withStatus.length > 0 ? withStatus : history;
  if (pool.length === 0) return undefined;

  return pool.reduce((latest, current) =>
    parseElogistiaDate(current.Date) > parseElogistiaDate(latest.Date) ? current : latest,
  );
}

function extractBodyArray(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  if (body && typeof body === 'object' && Array.isArray((body as { body?: unknown }).body)) {
    return (body as { body: unknown[] }).body;
  }
  throw new DeliveryResponseValidationError('Expected Elogistia response to contain a "body" array');
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

/** Elogistia dates are "YYYY-MM-DD HH:mm:ss" with no timezone documented - treated as UTC. */
function parseElogistiaDate(date: string | undefined): Date {
  if (!date) return new Date(0);
  const iso = date.includes('T') ? date : `${date.replace(' ', 'T')}Z`;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
}
