/**
 * Sensitive data sanitizer. Recursively redacts values whose keys match
 * known credential patterns. Zero deps, ESM-only.
 */

const SENSITIVE_PATTERNS = [
  /api[_-]?key/i,
  /secret/i,
  /password/i,
  /token/i,
  /credential/i,
  /auth/i,
  /bearer/i
];

/**
 * Recursively sanitize an object, replacing string values of sensitive keys
 * with '***REDACTED***'.
 * @param {unknown} obj
 * @returns {unknown}
 */
export function sanitize(obj) {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }

  const sanitized = Array.isArray(obj) ? [] : {};
  
  for (const [key, value] of Object.entries(obj)) {
    const isSensitive = SENSITIVE_PATTERNS.some(pattern => pattern.test(key));
    
    if (isSensitive && typeof value === 'string') {
      sanitized[key] = '***REDACTED***';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitize(value);
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
}

export { SENSITIVE_PATTERNS };
