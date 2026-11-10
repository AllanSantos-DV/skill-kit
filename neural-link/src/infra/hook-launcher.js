/**
 * Self-contained supervisor embedded in each declaration: no runtime import in the parent.
 * Keep the child alive until tree cleanup (including on JS crash/process.exit), so Windows
 * taskkill /T still has a live root. POSIX uses a private process group. Only the parent emits
 * protocol output, after bounded capture and healthy completion; never stream partial JSON.
 * The function is serialized, not imported at hook time. It must use only Node built-ins.
 */
function supervise(entry, event, budget) {
  const cp = require('node:child_process');
  const win = process.platform === 'win32';
  let child, timer, done = false, killed = false, code, ended = 0, inputBytes = 0;
  const output = [[], []], sizes = [0, 0], header = [];
  function notice(reason) {
    if (!event && inputBytes <= 65536) {
      try {
        const input = JSON.parse(Buffer.concat(header).toString('utf8'));
        const name = input.hook_event_name || input.event || input.hookEventName || input.event_type;
        if (typeof name === 'string' && /^[A-Za-z]{1,64}$/.test(name)) event = name;
      } catch { /* Generic warning when stdin is unavailable. */ }
    }
    const message = '[neural-link] ' + (event || 'Hook') + ': hook ignorado (' + reason + ') em ' + entry + '. Nenhuma decisao emitida; outras politicas permanecem. Reinstale via engine-registry ensureNeuralLink e execute neural-link install.';
    process.stderr.write(message + '\n');
    return { additionalContext: message, hookSpecificOutput: { ...(event ? { hookEventName: event } : {}), additionalContext: message } };
  }
  function terminate() {
    if (killed) return;
    killed = true;
    let cleanupFailed = false;
    if (child?.pid) {
      if (win) {
        const result = cp.spawnSync(require('node:path').join(process.env.SystemRoot || 'C:/Windows', 'System32', 'taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, timeout: 2000, stdio: 'ignore' });
        if (result.status !== 0) {
          try { process.kill(child.pid, 0); cleanupFailed = true; } catch (e) { cleanupFailed = e.code !== 'ESRCH'; }
        }
      } else {
        try { process.kill(-child.pid, 'SIGKILL'); } catch (e) { cleanupFailed = e.code !== 'ESRCH'; }
      }
      if (cleanupFailed) { try { child.kill('SIGKILL'); } catch { /* Already gone. */ } }
    }
    if (cleanupFailed) process.stderr.write('[neural-link] limpeza da arvore falhou; verifique processos do hook.\n');
  }
  function finish(reason) {
    if (done) return;
    done = true;
    clearTimeout(timer);
    process.stdin.unpipe();
    process.stdin.pause();
    terminate();
    if (child) {
      child.stdin.destroy();
      child.stdout.destroy();
      child.stderr.destroy();
      if (child.connected) child.disconnect();
      child.unref();
    }
    if (reason) {
      process.stdout.write(JSON.stringify(notice(reason)));
    } else {
      process.stderr.write(Buffer.concat(output[1]));
      process.stdout.write(Buffer.concat(output[0]));
    }
    process.exitCode = 0;
  }
  function validate() {
    if (code === undefined || ended !== 2 || done) return;
    if (code !== 0) return finish('runtime exit ' + code);
    const raw = Buffer.concat(output[0]).toString('utf8').trim();
    try {
      if (raw) {
        const value = JSON.parse(raw);
        const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
        if (!object(value)) throw 0;
        if ('hookSpecificOutput' in value && !object(value.hookSpecificOutput)) throw 0;
        for (const part of [value, value.hookSpecificOutput || {}]) {
          if ('decision' in part && !['allow', 'deny', 'block', 'ask', 'add'].includes(part.decision)) throw 0;
          if ('permissionDecision' in part && !['allow', 'deny', 'ask'].includes(part.permissionDecision)) throw 0;
          for (const field of ['reason', 'permissionDecisionReason', 'additionalContext', 'content', 'hookEventName', 'stopReason']) {
            if (field in part && typeof part[field] !== 'string') throw 0;
          }
          for (const field of ['continue', 'suppressOutput']) {
            if (field in part && typeof part[field] !== 'boolean') throw 0;
          }
        }
      }
    } catch { return finish('output invalido'); }
    finish();
  }
  function worker() {
    let finished = false;
    const exitSignal = {};
    function complete(code) {
      if (finished) return;
      finished = true;
      setInterval(() => {}, 1000);
      process.stdout.write('', () => {
        process.stderr.write('', () => process.send({ code: Number(code) || 0 }));
      });
    }
    process.exit = code => { complete(code ?? process.exitCode); throw exitSignal; };
    process.on('uncaughtException', error => { if (error !== exitSignal) complete(1); });
    process.on('unhandledRejection', error => { if (error !== exitSignal) complete(1); });
    process.on('beforeExit', complete);
    process.argv = [process.execPath, ...process.argv.slice(1)];
    import(require('node:url').pathToFileURL(process.argv[1]).href).catch(() => complete(1));
  }
  try {
    if (!require('node:fs').existsSync(entry)) return finish('dispatcher ausente');
    timer = setTimeout(() => finish('timeout ' + budget + 'ms'), budget);
    child = cp.spawn(process.execPath, ['-e', '(' + worker.toString() + ')()', '--', entry, ...process.argv.slice(1)], { stdio: ['pipe', 'pipe', 'pipe', 'ipc'], windowsHide: true, detached: !win });
    child.on('error', () => finish('falha ao iniciar runtime'));
    child.on('exit', (status, signal) => { if (code === undefined) finish('runtime interrompido ' + (signal || status)); });
    child.on('message', message => {
      if (done || code !== undefined) return;
      code = message.code;
      clearTimeout(timer);
      terminate();
      timer = setTimeout(() => finish('falha ao finalizar runtime'), 500);
      validate();
    });
    [child.stdout, child.stderr].forEach((stream, index) => {
      stream.on('data', chunk => {
        if (done) return;
        sizes[index] += chunk.length;
        if (sizes[index] > 1024 * 1024) return finish('limite de output 1MiB');
        output[index].push(chunk);
      });
      stream.on('end', () => { ended++; validate(); });
      stream.on('error', () => finish('falha de output'));
    });
    child.stdin.on('error', () => { if (!killed) finish('falha de stdin'); });
    process.stdin.on('error', () => finish('falha de stdin'));
    process.stdin.on('data', chunk => {
      inputBytes += chunk.length;
      if (!event && inputBytes <= 65536) header.push(chunk);
      if (inputBytes > 50 * 1024 * 1024) finish('limite de stdin 50MiB');
    });
    process.stdin.pipe(child.stdin);
  } catch { finish('falha do supervisor'); }
}

/**
 * Reusable generator for consumers with their own Node/shell wrapper. Node >=18, CJS -e.
 * Receives stdin unchanged and forwards process.argv.slice(1); entry sees normal script argv.
 * Host timeout is in seconds; reserve 3s for tree cleanup (at most 2s), drain and output.
 * Omit event to infer it from small stdin on failure (otherwise a generic context warning).
 * The returned source needs no files from this package at execution time.
 */
export function guardedScript(entry, event, timeout = 10) {
  if (typeof entry !== 'string' || !entry) throw new TypeError('hook entry must be a non-empty string');
  if (event !== undefined && (typeof event !== 'string' || !event)) throw new TypeError('hook event must be a non-empty string or undefined');
  if (!Number.isFinite(timeout) || timeout < 4) throw new RangeError('hook timeout must be >= 4 seconds');
  const budget = Math.floor(timeout * 1000) - 3000;
  return `(${supervise.toString()})(${JSON.stringify(entry)},${JSON.stringify(event)},${budget})`;
}

/** Shell-safe convenience wrapper for cmd.exe, PowerShell and POSIX sh. */
export function guardedCommand(entry, event, timeout = 10) {
  const source = guardedScript(entry, event, timeout);
  // Base64 contains no shell expansion characters. Paths never enter shell syntax, including
  // apostrophes, quotes, %, !, $, backticks and Unicode. Compact only line-leading whitespace.
  const encoded = Buffer.from(source.replace(/\r?\n\s*/g, ' ')).toString('base64');
  const command = `node -e "eval(Buffer.from('${encoded}','base64').toString())"`;
  if (command.length > 8191) throw new RangeError('hook command exceeds cmd.exe limit (8191 characters)');
  return command;
}
