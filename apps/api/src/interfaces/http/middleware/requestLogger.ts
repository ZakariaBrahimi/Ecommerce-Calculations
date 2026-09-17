import { NextFunction, Request, Response } from 'express';
import { Logger } from '../../../domain/ports/Logger';

/**
 * Logs method/path/status/duration for every request. Deliberately logs
 * `req.path` (no query string) - query params are where the delivery
 * provider's own API key would travel if it were ever (wrongly) proxied
 * through this layer, so they are never included here.
 */
export function requestLogger(logger: Logger) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const start = Date.now();
    res.on('finish', () => {
      logger.info('HTTP request', {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: Date.now() - start,
      });
    });
    next();
  };
}
