import {
  DeliveryProviderGateway,
  RawDeliveryOrderRecord,
  RawDeliveryStatusRecord,
} from '../../../domain/ports/DeliveryProviderGateway';
import { ElogistiaHttpClient } from './ElogistiaHttpClient';
import { parseManyTrackingResponse, parseOrdersResponse } from './ElogistiaResponseParser';
import { DeliveryAuthenticationError } from '../../../domain/errors/DeliveryIntegrationErrors';

/**
 * Concrete DeliveryProviderGateway for Elogistia. This is the only place in
 * the codebase that knows Elogistia's endpoint paths - everything else
 * (use cases, HTTP controllers) depends only on the DeliveryProviderGateway
 * port, so a second provider is added by writing a sibling class, not by
 * touching this one or anything above it.
 */
export class ElogistiaDeliveryProvider implements DeliveryProviderGateway {
  readonly provider = 'elogistia';

  constructor(private readonly client: ElogistiaHttpClient) {}

  async validateApiKey(apiKey: string): Promise<boolean> {
    try {
      await this.client.get('/getWilayas/', {}, apiKey);
      return true;
    } catch (err) {
      if (err instanceof DeliveryAuthenticationError) return false;
      throw err;
    }
  }

  async fetchOrders(
    apiKey: string,
    params?: { trackingNumber?: string },
  ): Promise<RawDeliveryOrderRecord[]> {
    const body = await this.client.get('/getOrders/', { tracking: params?.trackingNumber }, apiKey);
    return parseOrdersResponse(body, params?.trackingNumber);
  }

  async fetchOrderStatuses(apiKey: string, trackingNumbers: string[]): Promise<RawDeliveryStatusRecord[]> {
    if (trackingNumbers.length === 0) return [];
    const body = await this.client.get(
      '/getManyTracking/',
      { tracking: trackingNumbers.join(',') },
      apiKey,
    );
    return parseManyTrackingResponse(body);
  }
}
