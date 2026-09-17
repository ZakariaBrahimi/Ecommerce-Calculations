/**
 * Internal delivery-order lifecycle used across ProfitFlow AI, independent of
 * any specific delivery provider's own status vocabulary.
 */
export enum InternalDeliveryStatus {
  NEW = 'NEW',
  CONFIRMED = 'CONFIRMED',
  SHIPPED = 'SHIPPED',
  DELIVERED = 'DELIVERED',
  FAILED = 'FAILED',
  RETURNED = 'RETURNED',
}

export const TERMINAL_STATUSES: ReadonlySet<InternalDeliveryStatus> = new Set([
  InternalDeliveryStatus.DELIVERED,
  InternalDeliveryStatus.FAILED,
  InternalDeliveryStatus.RETURNED,
]);

export function isTerminalStatus(status: InternalDeliveryStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}
