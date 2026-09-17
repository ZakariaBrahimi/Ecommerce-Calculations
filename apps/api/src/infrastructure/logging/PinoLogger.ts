import pino, { Logger as PinoInstance } from 'pino';
import { Logger, LogMeta } from '../../domain/ports/Logger';

/**
 * Fields that must never reach a log line, whatever the caller passes in
 * `meta` - defense in depth on top of callers already avoiding this. Pino's
 * redact option walks nested paths too (e.g. "error.apiKey").
 */
const REDACTED_PATHS = [
  'apiKey',
  'api_key',
  'key',
  'password',
  'token',
  'accessToken',
  'encryptedApiKey',
  'authorization',
  '*.apiKey',
  '*.key',
  '*.token',
];

export class PinoLogger implements Logger {
  private constructor(private readonly instance: PinoInstance) {}

  static create(level: string = process.env.LOG_LEVEL ?? 'info'): PinoLogger {
    const instance = pino({
      level,
      redact: { paths: REDACTED_PATHS, censor: '[REDACTED]' },
      formatters: {
        level(label) {
          return { level: label };
        },
      },
    });
    return new PinoLogger(instance);
  }

  debug(message: string, meta?: LogMeta): void {
    this.instance.debug(meta ?? {}, message);
  }

  info(message: string, meta?: LogMeta): void {
    this.instance.info(meta ?? {}, message);
  }

  warn(message: string, meta?: LogMeta): void {
    this.instance.warn(meta ?? {}, message);
  }

  error(message: string, meta?: LogMeta): void {
    this.instance.error(meta ?? {}, message);
  }

  child(bindings: LogMeta): Logger {
    return new PinoLogger(this.instance.child(bindings));
  }
}
