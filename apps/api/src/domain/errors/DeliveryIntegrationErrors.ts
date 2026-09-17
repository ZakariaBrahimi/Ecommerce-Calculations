/**
 * Error hierarchy for the delivery-integration domain. Interface-layer code
 * (HTTP controllers) maps these to transport-appropriate responses; nothing
 * below the interface layer should ever construct a raw Error() for a
 * provider failure, so callers can pattern-match on error type.
 */
export abstract class DeliveryIntegrationError extends Error {
  abstract readonly code: string;

  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = new.target.name;
  }
}

/** The stored/provided credential was rejected by the provider (401/403). */
export class DeliveryAuthenticationError extends DeliveryIntegrationError {
  readonly code = 'DELIVERY_AUTH_FAILED';
}

/** The tenant has no active connection for the requested provider. */
export class DeliveryConnectionNotFoundError extends DeliveryIntegrationError {
  readonly code = 'DELIVERY_CONNECTION_NOT_FOUND';
}

/** Provider's own rate limit was hit (or our local limiter denied the call). */
export class DeliveryRateLimitError extends DeliveryIntegrationError {
  readonly code = 'DELIVERY_RATE_LIMITED';
  constructor(message: string, readonly retryAfterMs: number, cause?: unknown) {
    super(message, cause);
  }
}

/** Network failure, timeout, or 5xx from the provider. Safe to retry. */
export class DeliveryProviderUnavailableError extends DeliveryIntegrationError {
  readonly code = 'DELIVERY_PROVIDER_UNAVAILABLE';
}

/** Provider returned a 2xx with a shape we don't recognize/trust. */
export class DeliveryResponseValidationError extends DeliveryIntegrationError {
  readonly code = 'DELIVERY_RESPONSE_INVALID';
}

/** Caller passed a status/value this provider adapter cannot map. */
export class UnknownDeliveryStatusError extends DeliveryIntegrationError {
  readonly code = 'DELIVERY_STATUS_UNMAPPED';
  constructor(readonly rawStatus: string) {
    super(`No internal-status mapping exists for raw status "${rawStatus}"`);
  }
}
