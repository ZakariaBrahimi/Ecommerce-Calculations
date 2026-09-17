import { NextResponse } from 'next/server';

export type ProviderErrorKind = 'timeout' | 'auth' | 'rate_limit' | 'bad_request' | 'upstream' | 'config';

/** Uniform error shape for every route in src/app/api/elogistia and src/app/api/meta. */
export class ProviderApiError extends Error {
  constructor(
    readonly kind: ProviderErrorKind,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ProviderApiError';
  }
}

const STATUS_BY_KIND: Record<ProviderErrorKind, number> = {
  timeout: 504,
  auth: 401,
  rate_limit: 429,
  bad_request: 400,
  upstream: 502,
  config: 500,
};

/** Turns any thrown error into a normalized {error, kind} JSON response with the right HTTP status. */
export function toErrorResponse(err: unknown): NextResponse {
  if (err instanceof ProviderApiError) {
    return NextResponse.json({ error: err.message, kind: err.kind }, { status: STATUS_BY_KIND[err.kind] });
  }
  if (err instanceof Error && err.message.startsWith('Missing required environment variable')) {
    return NextResponse.json({ error: err.message, kind: 'config' satisfies ProviderErrorKind }, { status: 500 });
  }
  const message = err instanceof Error ? err.message : 'Unexpected error';
  return NextResponse.json({ error: message, kind: 'upstream' satisfies ProviderErrorKind }, { status: 502 });
}

/** Classifies a fetch()-level failure (network error or AbortSignal.timeout firing) as a timeout vs. a hard failure. */
export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'TimeoutError' || err instanceof Error && err.name === 'AbortError';
}
