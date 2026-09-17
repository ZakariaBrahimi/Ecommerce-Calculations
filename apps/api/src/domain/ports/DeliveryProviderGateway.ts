/**
 * Provider-agnostic shape of an order/shipment as read from a delivery
 * provider. `rawStatus` is intentionally left un-mapped here - normalizing
 * it into InternalDeliveryStatus is a separate step (DeliveryStatusMapper),
 * kept out of the gateway so transport concerns and status-mapping business
 * rules can be tested independently.
 */
export interface RawDeliveryOrderRecord {
  externalOrderId: string | null;
  trackingNumber: string;
  customerName: string | null;
  customerPhone: string | null;
  address: string | null;
  commune: string | null;
  wilaya: string | null;
  deliveryFee: number | null;
  rawStatus: string;
}

export interface RawDeliveryStatusRecord {
  trackingNumber: string;
  rawStatus: string;
  occurredAt: Date;
}

/**
 * Port for talking to a delivery provider's API. Implementations own
 * authentication, HTTP transport, rate limiting and retries for that
 * specific provider - the application layer only ever calls this interface.
 */
export interface DeliveryProviderGateway {
  readonly provider: string;

  /** Cheap call used to verify a newly-entered API key is valid. */
  validateApiKey(apiKey: string): Promise<boolean>;

  /**
   * Fetches orders known to the provider. Pass `trackingNumber` to fetch a
   * single order; omit it only for full-backfill/reconciliation use (this
   * provider's list endpoint is not paginated - see docs/integrations).
   */
  fetchOrders(apiKey: string, params?: { trackingNumber?: string }): Promise<RawDeliveryOrderRecord[]>;

  /** Batched status/history lookup for routine polling. */
  fetchOrderStatuses(apiKey: string, trackingNumbers: string[]): Promise<RawDeliveryStatusRecord[]>;
}
