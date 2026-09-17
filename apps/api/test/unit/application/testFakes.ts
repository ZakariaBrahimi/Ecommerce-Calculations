import { Logger, LogMeta } from '../../../src/domain/ports/Logger';
import {
  DeliveryProviderGateway,
  RawDeliveryOrderRecord,
  RawDeliveryStatusRecord,
} from '../../../src/domain/ports/DeliveryProviderGateway';

export class NoopLogger implements Logger {
  debug(_message: string, _meta?: LogMeta): void {}
  info(_message: string, _meta?: LogMeta): void {}
  warn(_message: string, _meta?: LogMeta): void {}
  error(_message: string, _meta?: LogMeta): void {}
  child(): Logger {
    return this;
  }
}

/** In-memory stand-in for a delivery provider - lets tests script exact API responses. */
export class FakeDeliveryProviderGateway implements DeliveryProviderGateway {
  readonly provider = 'fake-provider';
  validKeys = new Set<string>(['valid-key']);
  orders: RawDeliveryOrderRecord[] = [];
  statusesByTracking = new Map<string, RawDeliveryStatusRecord>();
  fetchOrderStatusesError: Error | undefined;

  async validateApiKey(apiKey: string): Promise<boolean> {
    return this.validKeys.has(apiKey);
  }

  async fetchOrders(_apiKey: string, params?: { trackingNumber?: string }): Promise<RawDeliveryOrderRecord[]> {
    if (params?.trackingNumber) {
      return this.orders.filter((o) => o.trackingNumber === params.trackingNumber);
    }
    return this.orders;
  }

  async fetchOrderStatuses(_apiKey: string, trackingNumbers: string[]): Promise<RawDeliveryStatusRecord[]> {
    if (this.fetchOrderStatusesError) throw this.fetchOrderStatusesError;
    return trackingNumbers
      .map((t) => this.statusesByTracking.get(t))
      .filter((s): s is RawDeliveryStatusRecord => Boolean(s));
  }
}
