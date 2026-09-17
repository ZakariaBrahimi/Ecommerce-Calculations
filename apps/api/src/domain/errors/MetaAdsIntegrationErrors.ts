/**
 * Error hierarchy for the Meta Ads integration domain - mirrors the shape of
 * DeliveryIntegrationErrors so the HTTP error handler can treat both
 * families the same way, while keeping the two integrations independently
 * evolvable (a Meta-specific error never needs to make sense for Elogistia).
 */
export abstract class MetaAdsIntegrationError extends Error {
  abstract readonly code: string;

  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = new.target.name;
  }
}

/** Meta rejected the OAuth code, the stored token, or the token has expired. */
export class MetaAuthenticationError extends MetaAdsIntegrationError {
  readonly code = 'META_AUTH_FAILED';
}

/** The OAuth `state` param failed signature/expiry verification. */
export class MetaOAuthStateInvalidError extends MetaAdsIntegrationError {
  readonly code = 'META_OAUTH_STATE_INVALID';
}

/** The tenant has no active Meta Ads connection (or none with an ad account selected). */
export class MetaConnectionNotFoundError extends MetaAdsIntegrationError {
  readonly code = 'META_CONNECTION_NOT_FOUND';
}

export class MetaRateLimitError extends MetaAdsIntegrationError {
  readonly code = 'META_RATE_LIMITED';
  constructor(message: string, readonly retryAfterMs: number, cause?: unknown) {
    super(message, cause);
  }
}

/** Network failure, timeout, or 5xx from the Graph API. Safe to retry. */
export class MetaApiUnavailableError extends MetaAdsIntegrationError {
  readonly code = 'META_API_UNAVAILABLE';
}

/** Graph API returned a 2xx with a shape we don't recognize/trust. */
export class MetaResponseValidationError extends MetaAdsIntegrationError {
  readonly code = 'META_RESPONSE_INVALID';
}

/** Caller passed an effective_status this provider adapter cannot map. */
export class UnknownCampaignStatusError extends MetaAdsIntegrationError {
  readonly code = 'META_STATUS_UNMAPPED';
  constructor(readonly rawStatus: string) {
    super(`No CampaignStatus mapping exists for raw status "${rawStatus}"`);
  }
}
