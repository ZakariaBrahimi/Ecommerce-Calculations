export type LogMeta = Record<string, unknown>;

/**
 * Logging port. Implementations MUST redact secrets (api keys, tokens,
 * full provider request URLs) - callers should never need to remember to
 * scrub anything themselves, but should still avoid passing raw
 * credentials into `meta` as a matter of defense in depth.
 */
export interface Logger {
  debug(message: string, meta?: LogMeta): void;
  info(message: string, meta?: LogMeta): void;
  warn(message: string, meta?: LogMeta): void;
  error(message: string, meta?: LogMeta): void;
  child(bindings: LogMeta): Logger;
}
