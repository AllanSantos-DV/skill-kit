import { dispatch } from './pipeline/dispatcher.js';
import { loadConfig, getConfigRaw } from './infra/config.js';
import { checkCalibration, buildCalibrationResponse } from './calibration.js';
import { handleError, SEVERITY, EXIT_CODES } from './infra/error-handler.js';
import { PATHS } from './infra/paths.js';
import { tryLoadSnapshot, writeSnapshot } from './infra/snapshot.js';
import { _primeLearner } from './learning/learner.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sanitize as sanitizeForDebug } from './infra/sanitize.js';

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
  // E-09: Try compiled snapshot for single-read bootstrap
  let snapshotUsed = false;
  try {
    const snap = tryLoadSnapshot();
    if (snap) {
      if (snap.weights || snap.activations) {
        _primeLearner(
          snap.config?.learning || {},
          snap.weights,
          snap.activations,
        );
      }
      snapshotUsed = true;
    }
  } catch {
    // Snapshot failure is non-critical — fall through to normal loading
  }

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
      const { uncalibrated = [], autoRegistered = [] } = calibrationResult;
      if (uncalibrated.length > 0 || autoRegistered.length > 0) {
        const response = buildCalibrationResponse(uncalibrated, autoRegistered);
        const calibrationOutput = JSON.stringify(response);
        if (debug) debugDump(calibrationOutput, 'out');
        process.stdout.write(calibrationOutput);
        return;
      }
    }
  }

  const { output, runPostResponse } = await dispatch(stdinJson, { earlyReturn: true });
  const json = JSON.stringify(output);

  if (debug) debugDump(json, 'out');

  // Emit response to VS Code ASAP, then run deferred stages (logging,
  // session tracking, weight saving) without blocking process exit.
  process.stdout.write(json, () => {
    setImmediate(async () => {
      await runPostResponse().catch(() => {});
      // E-09: Write snapshot for next invocation (fire-and-forget)
      if (!snapshotUsed) {
        try {
          const configRaw = getConfigRaw();
          if (configRaw) {
            writeSnapshot(loadConfig(), configRaw, null, null);
          }
        } catch {
          // Non-critical
        }
      }
    }).unref();
  });
}

main().catch((error) => {
  // Fail-open: any unhandled error → silent exit
  handleError(error, SEVERITY.CRITICAL, { component: 'index', operation: 'main' });
  process.exit(EXIT_CODES.DISPATCH_ERROR);
});
