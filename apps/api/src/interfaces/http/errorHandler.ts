import { NextFunction, Request, Response } from 'express';
import { Logger } from '../../domain/ports/Logger';
import {
  DeliveryAuthenticationError,
  DeliveryConnectionNotFoundError,
  DeliveryIntegrationError,
  DeliveryProviderUnavailableError,
  DeliveryRateLimitError,
  DeliveryResponseValidationError,
} from '../../domain/errors/DeliveryIntegrationErrors';

const STATUS_BY_ERROR = new Map<Function, number>([
  [DeliveryAuthenticationError, 401],
  [DeliveryConnectionNotFoundError, 404],
  [DeliveryRateLimitError, 429],
  [DeliveryResponseValidationError, 502],
  [DeliveryProviderUnavailableError, 503],
]);

/**
 * Central error boundary: translates the domain error hierarchy into HTTP
 * responses, and only that hierarchy - anything else is logged with full
 * detail server-side but returned to the client as a generic 500 with no
 * internal detail (no stack trace, no provider payload, no credential
 * material) ever leaked in a response body.
 */
export function errorHandler(logger: Logger) {
  return (err: unknown, req: Request, res: Response, _next: NextFunction): void => {
    const log = logger.child({ path: req.path, method: req.method });

    if (err instanceof DeliveryIntegrationError) {
      const status = STATUS_BY_ERROR.get(err.constructor) ?? 500;
      log.warn('Request failed with a known delivery-integration error', {
        code: err.code,
        status,
        message: err.message,
      });
      res.status(status).json({ error: { code: err.code, message: err.message } });
      return;
    }

    log.error('Unhandled error', {
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } });
  };
}
