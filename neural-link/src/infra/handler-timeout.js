import { HANDLER_TIMEOUT_MS } from './constants.js';

/**
 * Single timeout policy for declaration sizing and handler execution.
 * eventType is the canonical event name (the pipeline's sensed context.event_type), not raw
 * host input. Preserve explicit zero and use exactly the same fallback order at both edges.
 */
export function resolveHandlerTimeout(handler, config, eventType) {
  return handler.timeout
    ?? config.eventTimeouts?.[eventType]
    ?? config.defaultTimeout
    ?? HANDLER_TIMEOUT_MS;
}
