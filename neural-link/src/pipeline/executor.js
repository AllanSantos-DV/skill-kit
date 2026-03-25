import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { resolve, normalize, isAbsolute } from 'node:path';
import { existsSync, statSync } from 'node:fs';

const isWindows = process.platform === 'win32';

/**
 * Execute active handlers in parallel.
 * Each handler receives the original stdin JSON via pipe.
 * Returns array of { name, score, result }.
 */
export async function executeHandlers(active, stdinJson, config) {
  const sanitizedStdin = sanitizeStdinForHandlers(stdinJson);
  const stdinStr = JSON.stringify(sanitizedStdin);
  const eventType = stdinJson.event ?? '';

  const promises = active.map(({ name, handler, score }) => {
    const timeout = handler.timeout
      ?? config.eventTimeouts?.[eventType]
      ?? config.defaultTimeout;

    return runHandler(name, handler, stdinStr, timeout)
      .then(result => ({ name, score, result }));
  });

  return Promise.all(promises);
}

const SENSITIVE_PATTERNS = [
  /api[_-]?key/i,
  /secret/i,
  /password/i,
  /token/i,
  /credential/i,
  /auth/i,
  /bearer/i
];

function sanitizeStdinForHandlers(obj) {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }

  const sanitized = Array.isArray(obj) ? [] : {};
  
  for (const [key, value] of Object.entries(obj)) {
    const isSensitive = SENSITIVE_PATTERNS.some(pattern => pattern.test(key));
    
    if (isSensitive && typeof value === 'string') {
      sanitized[key] = '***REDACTED***';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeStdinForHandlers(value);
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
}

export function resolvePath(scriptPath) {
  if (typeof scriptPath !== 'string' || !scriptPath.trim()) {
    throw new Error('Script path must be a non-empty string');
  }

  const home = homedir();
  let expandedPath = scriptPath
    .replace(/^\$HOME/, home)
    .replace(/^~/, home);

  const normalizedPath = normalize(expandedPath);
  const absolutePath = isAbsolute(normalizedPath) 
    ? normalizedPath 
    : resolve(process.cwd(), normalizedPath);

  if (absolutePath.includes('..')) {
    const finalPath = resolve(absolutePath);
    if (!finalPath.startsWith(home) && !finalPath.startsWith(process.cwd())) {
      throw new Error(`Path traversal detected: ${scriptPath}`);
    }
  }

  if (normalizedPath.includes('\0')) {
    throw new Error('Null byte in path');
  }

  return absolutePath;
}

function validateScriptPath(scriptPath) {
  try {
    if (!existsSync(scriptPath)) {
      return false;
    }
    
    const stats = statSync(scriptPath);
    if (!stats.isFile()) {
      console.error(`[Security] Script path is not a file: ${scriptPath}`);
      return false;
    }

    return true;
  } catch (error) {
    console.error(`[Security] Cannot validate script path: ${error.message}`);
    return false;
  }
}

function runHandler(name, handler, stdinStr, timeout) {
  return new Promise(resolve => {
    const allowResult = { decision: 'allow', reason: '', hookSpecificOutput: {} };

    let scriptPath;
    try {
      scriptPath = isWindows
        ? resolvePath(handler.script.windows)
        : resolvePath(handler.script.bash);
      
      if (!validateScriptPath(scriptPath)) {
        console.error(`[Security] Invalid or non-existent script path for handler ${name}: ${scriptPath}`);
        resolve(allowResult);
        return;
      }
    } catch (error) {
      console.error(`[Security] Script path resolution failed for handler ${name}: ${error.message}`);
      resolve(allowResult);
      return;
    }

    let child;
    try {
      if (isWindows) {
        child = spawn('powershell', [
          '-NoProfile', 
          '-ExecutionPolicy', 'Bypass', 
          '-File', scriptPath
        ], { 
          stdio: ['pipe', 'pipe', 'pipe'], 
          windowsHide: true,
          shell: false
        });
      } else {
        child = spawn('bash', [scriptPath], {
          stdio: ['pipe', 'pipe', 'pipe'],
          shell: false
        });
      }
    } catch {
      resolve(allowResult);
      return;
    }

    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const timer = setTimeout(() => {
      if (!settled) {
        try { child.kill(); } catch { /* ignore */ }
        finish(allowResult);
      }
    }, timeout);

    child.stdout.on('data', chunk => { 
      stdout += chunk; 
      if (stdout.length > 1024 * 1024) {
        console.error(`[Security] Handler ${name} output exceeded 1MB, truncating`);
        try { child.kill(); } catch { /* ignore */ }
        finish(allowResult);
      }
    });
    child.stderr.on('data', chunk => { 
      stderr += chunk; 
      if (stderr.length > 1024 * 1024) {
        console.error(`[Security] Handler ${name} stderr exceeded 1MB, truncating`);
        stderr = stderr.slice(0, 1024 * 1024);
      }
    });

    child.on('error', () => finish(allowResult));

    child.on('close', () => {
      try {
        const parsed = JSON.parse(stdout.trim());
        finish(normalizeResult(parsed));
      } catch {
        // Non-JSON output or empty → allow
        finish(allowResult);
      }
    });

    // Pipe stdin to child
    try {
      child.stdin.write(stdinStr);
      child.stdin.end();
    } catch {
      // stdin write failure → allow
      finish(allowResult);
    }
  });
}

/**
 * Normalize handler output to a consistent shape.
 */
function normalizeResult(parsed) {
  const result = {
    decision: parsed.decision ?? 'allow',
    reason: parsed.reason ?? '',
    hookSpecificOutput: parsed.hookSpecificOutput ?? {},
  };
  if (parsed.content !== undefined) {
    result.content = parsed.content;
  }
  return result;
}
