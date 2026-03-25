import { dispatch } from './pipeline/dispatcher.js';
import { loadConfig } from './infra/config.js';
import { checkCalibration, buildCalibrationResponse } from './calibration.js';
import { handleError, SEVERITY, EXIT_CODES } from './infra/error-handler.js';
import { PATHS } from './infra/paths.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const SENSITIVE_PATTERNS = [
  /api[_-]?key/i,
  /secret/i,
  /password/i,
  /token/i,
  /credential/i,
  /auth/i,
  /bearer/i
];

function sanitizeForDebug(obj) {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }

  const sanitized = Array.isArray(obj) ? [] : {};
  
  for (const [key, value] of Object.entries(obj)) {
    const isSensitive = SENSITIVE_PATTERNS.some(pattern => pattern.test(key));
    
    if (isSensitive && typeof value === 'string') {
      sanitized[key] = '***REDACTED***';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeForDebug(value);
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
}

function debugDump(raw, suffix) {
  try {
    let parsedData;
    try {
      parsedData = JSON.parse(raw);
      parsedData = sanitizeForDebug(parsedData);
      raw = JSON.stringify(parsedData, null, 2);
    } catch {
      // If parsing fails, write raw (but this shouldn't happen in normal flow)
    }

    const now = new Date();
    const ts = now.toISOString().replace(/:/g, '-').replace('Z', '').replace('.', '-');
    const eventMatch = raw.match(/"hook_event_name"\s*:\s*"([^"]+)"/);
    const event = eventMatch ? eventMatch[1] : 'unknown';
    const filePath = join(PATHS.DEBUG, `${ts}_${event}_${suffix}.json`);
    mkdir(PATHS.DEBUG, { recursive: true })
      .then(() => writeFile(filePath, raw))
      .catch(() => {});
  } catch {
    // Debug must never interfere with the main flow
  }
}

async function main() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf-8').trim();

  if (!raw) {
    process.exit(0);
  }

  if (raw.length > 50 * 1024 * 1024) {
    console.error('[Security] Input too large (>50MB), rejecting');
    process.exit(0);
  }

  const debug = loadConfig().debug === true;
  if (debug) debugDump(raw, 'in');

  let stdinJson;
  try {
    stdinJson = JSON.parse(raw);
  } catch (error) {
    handleError(error, SEVERITY.ERROR, { component: 'index', operation: 'JSON.parse' });
    process.exit(EXIT_CODES.PARSE_ERROR);
  }

  if (stdinJson.stop_hook_active === true) {
    process.exit(0);
  }

  // SessionStart auto-calibration check
  const eventName = stdinJson.event ?? stdinJson.hook_event_name ?? stdinJson.hookEventName;
  if (eventName === 'SessionStart') {
    const config = loadConfig();
    const calibrationResult = checkCalibration(config);
    if (calibrationResult) {
      const response = buildCalibrationResponse(calibrationResult.uncalibrated);
      const calibrationOutput = JSON.stringify(response);
      if (debug) debugDump(calibrationOutput, 'out');
      process.stdout.write(calibrationOutput);
      return;
    }
  }

  const result = await dispatch(stdinJson);
  const output = JSON.stringify(result);

  if (debug) debugDump(output, 'out');

  process.stdout.write(output);
}

main().catch((error) => {
  // Fail-open: any unhandled error → silent exit
  handleError(error, SEVERITY.CRITICAL, { component: 'index', operation: 'main' });
  process.exit(EXIT_CODES.DISPATCH_ERROR);
});
