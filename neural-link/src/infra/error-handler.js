/**
 * Centralized error handling module.
 * 
 * Provides structured error logging with severity levels while maintaining
 * fail-open behavior (all errors result in silent exit).
 * 
 * Addresses DEV-01: Scattered Silent Error Handling
 */

const SEVERITY = {
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
  CRITICAL: 'critical',
};

/**
 * Log an error with severity and context, then exit gracefully.
 * All errors result in process.exit(0) to maintain fail-open behavior.
 * 
 * @param {Error|string} error - The error object or message
 * @param {string} severity - One of SEVERITY levels
 * @param {Object} context - Additional context (component, operation, etc.)
 */
export function handleError(error, severity = SEVERITY.ERROR, context = {}) {
  // In production, fail-open means we suppress visible errors
  // But we still log internally for debugging
  try {
    const timestamp = new Date().toISOString();
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    
    // Log to stderr (captured by debug mode, but doesn't break hook)
    const logEntry = {
      timestamp,
      severity,
      message,
      context,
      ...(stack && { stack }),
    };
    
    // Only log to stderr in production (avoid polluting output)
    if (process.env.NEURAL_LINK_DEBUG === 'true') {
      console.error('[error-handler]', JSON.stringify(logEntry, null, 2));
    }
  } catch {
    // Error handler itself must never throw
  }
}

/**
 * Wrap a non-critical operation with error handling.
 * Executes fn and catches any errors, logging them without throwing.
 * 
 * @param {Function} fn - Function to execute
 * @param {string} operation - Name of the operation for context
 * @returns {*} Result of fn, or undefined if error
 */
export function tryNonCritical(fn, operation) {
  try {
    return fn();
  } catch (error) {
    handleError(error, SEVERITY.WARNING, { operation, critical: false });
    return undefined;
  }
}

/**
 * Wrap an async non-critical operation with error handling.
 * 
 * @param {Function} fn - Async function to execute
 * @param {string} operation - Name of the operation for context
 * @returns {Promise<*>} Result of fn, or undefined if error
 */
export async function tryNonCriticalAsync(fn, operation) {
  try {
    return await fn();
  } catch (error) {
    handleError(error, SEVERITY.WARNING, { operation, critical: false });
    return undefined;
  }
}

/**
 * Exit codes for different failure modes.
 * While we maintain fail-open (exit 0) in production, these codes
 * can be used in debug mode or future error reporting.
 */
export const EXIT_CODES = {
  CLEAN: 0,
  PARSE_ERROR: 1,
  DISPATCH_ERROR: 2,
  CONFIG_ERROR: 3,
};

export { SEVERITY };
