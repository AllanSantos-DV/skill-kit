/**
 * Auto-registration discovery for Neural Link.
 *
 * When registration mode is "auto", scans ~/.copilot/hooks/
 * (global) and optionally workspace hook directories for .js scripts,
 * infers event bindings from names, and writes new handler entries
 * into neural-link.config.json.
 *
 * Also provides a file-watcher that marks removed scripts as disabled.
 */

import { readdirSync, existsSync, writeFileSync, readFileSync, statSync, watch } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { COPILOT } from './infra/paths.js';
import { getConfigPath } from './infra/config.js';
import {
  NAME_EVENT_PATTERNS,
  DEFAULT_INFERRED_EVENTS,
  PLATFORM_EXTENSIONS,
  DEFAULT_REGISTRATION,
  WORKSPACE_HOOKS_DIRS,
} from './infra/constants.js';

// ─── Helpers ────────────────────────────────────────────────

/**
 * Return the script file extension for Node.js hooks.
 */
export function platformExtension() {
  return PLATFORM_EXTENSIONS.node;
}

/**
 * Infer hook events from the script name using prefix-matching.
 *
 * @param {string} name - Hook name without extension (e.g. "pre-commit-guard")
 * @returns {string[]} - Matching event names
 */
export function inferEvents(name) {
  for (const { prefix, events } of NAME_EVENT_PATTERNS) {
    if (name.startsWith(prefix)) return [...events];
  }
  return [...DEFAULT_INFERRED_EVENTS];
}

/**
 * Scan a directory and return names of scripts
 * that match the current platform extension.
 *
 * @param {string} dir - Absolute path to the directory to scan
 * @returns {string[]} - Unique hook names (without extension)
 */
export function scanDirectory(dir) {
  if (!existsSync(dir)) return [];

  const ext = platformExtension();
  const files = readdirSync(dir);
  const names = [];

  for (const f of files) {
    if (extname(f) === ext) {
      names.push(basename(f, ext));
    }
  }

  return names;
}

/**
 * Lê os companions `<hook>.neural-link.json` da pasta de hooks.
 *
 * Por que isto existe: um repositório de skills (skill-kit, e qualquer outro) instala seus
 * hooks por `pull`. Sem um jeito de ELE declarar como o hook deve ser pontuado, o dono tinha
 * duas opções ruins: registrar tudo à mão no config global — e perder na próxima atualização —
 * ou deixar cada hook se declarar solto em `hooks.json`, que é o que multiplica processo.
 *
 * O companion resolve: o hook viaja com a própria calibragem, o `pull` traz os dois, e o
 * dispatcher registra sozinho. A mensagem de calibragem já prometia este arquivo; agora ele
 * é lido de verdade.
 *
 * Precedência deliberada: o config global VENCE o companion. Quem ajustou peso/limiar à mão
 * não pode ter isso desfeito por uma atualização de repositório.
 *
 * @param {string} dir - pasta com os hooks
 * @returns {Record<string, object>} - entradas de handler por nome
 */
export function readCompanions(dir, options = {}) {
  if (!existsSync(dir)) return {};

  const { prefix = null, baseDir = dir } = options;
  const out = {};
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.neural-link.json')) continue;
    const base = f.slice(0, -'.neural-link.json'.length);
    // Namespace por dono: seis extensões trazem um `boot` — sem prefixo, uma sobrescreveria
    // as outras e cinco hooks sumiriam em silêncio.
    const name = prefix ? `${prefix}.${base}` : base;
    try {
      const raw = JSON.parse(readFileSync(join(dir, f), 'utf-8'));
      // Um companion inválido NÃO pode derrubar o dispatcher: ele é ignorado, e o hook
      // simplesmente não fica registrado (visível na calibragem) em vez de matar o processo.
      if (!raw || typeof raw !== 'object') continue;
      out[name] = {
        enabled: raw.enabled !== false,
        events: Array.isArray(raw.events) ? raw.events : inferEvents(base),
        script: resolveCompanionScript(raw.script, base, baseDir),
        timeout: raw.timeout ?? 5000,
        threshold: raw.threshold ?? null,
        weight: typeof raw.weight === 'number' ? raw.weight : 0.55,
        // Campos que o pipeline itera direto — ausência aqui derruba o dispatcher inteiro.
        modifiers: Array.isArray(raw.modifiers) ? raw.modifiers : [],
        routing: raw.routing ?? undefined,
        ...(Array.isArray(raw.args) ? { args: raw.args.filter(a => typeof a === 'string') } : {}),
        // Quem registrou: é o que permite responder "de qual projeto veio este hook".
        project: raw.project ?? prefix ?? null,
        // Extensão era invocada pelo host de dentro da própria pasta; preservar isso.
        ...(raw.cwd ? { cwd: raw.cwd } : prefix ? { cwd: baseDir } : {}),
        source: 'companion',
      };
    } catch {
      // json ilegível: ignora este companion, segue com os outros.
    }
  }
  return out;
}

/**
 * Resolve o caminho do script de um companion.
 *
 * Um companion declara o script RELATIVO à própria pasta — o repositório não sabe onde vai ser
 * instalado (o Skill Manager, por exemplo, instala em `hooks/scripts/`, não na raiz). Ancorar no
 * companion é o que faz a mesma calibragem valer nos dois lugares. Caminho absoluto ou ancorado
 * em `~` é respeitado como veio, para quem precisa apontar para fora.
 */
function resolveCompanionScript(script, base, baseDir) {
  const anchor = (p) =>
    typeof p === 'string' && !p.startsWith('~') && !p.startsWith('/') && !/^[A-Za-z]:/.test(p)
      ? join(baseDir, p)
      : p;

  if (script && typeof script === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(script)) out[k] = anchor(v);
    return out;
  }
  if (typeof script === 'string') return { node: anchor(script) };

  // Sem `script`: o arquivo irmão com o mesmo nome.
  for (const ext of ['.js', '.mjs', '.cjs']) {
    const guess = join(baseDir, `${base}${ext}`);
    if (existsSync(guess)) return { node: guess };
  }
  return { node: join(baseDir, `${base}.js`) };
}

/**
 * Todas as pastas que podem trazer calibragem: os hooks globais e CADA extensão instalada.
 *
 * É isto que permite uma extensão parar de declarar hook próprio. Se cada uma declarasse a
 * chamada ao dispatcher, o host o invocaria uma vez POR extensão — nove processos por evento
 * em vez de um, o oposto do objetivo. A extensão declara zero e só entrega a calibragem.
 */
export function companionRoots() {
  const roots = [{ dir: COPILOT.HOOKS, prefix: null }];
  // O Skill Manager instala em `hooks/scripts/`, não na raiz — sem esta pasta, um repositório
  // de skills entregaria calibragem que ninguém lê e os hooks ficariam sem registro.
  if (COPILOT.HOOKS_SCRIPTS !== COPILOT.HOOKS) {
    roots.push({ dir: COPILOT.HOOKS_SCRIPTS, prefix: null });
  }
  if (existsSync(COPILOT.EXTENSIONS)) {
    for (const name of readdirSync(COPILOT.EXTENSIONS)) {
      const dir = join(COPILOT.EXTENSIONS, name);
      try {
        if (!statSync(dir).isDirectory()) continue;
      } catch { continue; }
      roots.push({ dir, prefix: name });
    }
  }
  return roots;
}

/**
 * Scan the global hooks directory and return names of .js scripts.
 *
 * @returns {string[]} - Unique hook names (without extension)
 */
export function scanScripts() {
  return scanDirectory(COPILOT.HOOKS);
}

/**
 * Build a default handler entry for an auto-discovered script.
 *
 * @param {string} name    - Hook name (e.g. "my-hook")
 * @param {object} config  - Full neural-link config (for defaults)
 * @param {object} [options] - Additional options
 * @param {string} [options.source="global"] - Source: "global" or "workspace"
 * @param {string} [options.workingDirectory] - CWD for workspace hooks
 * @returns {object}       - Handler entry ready for config.handlers
 */
export function buildHandlerEntry(name, config, options = {}) {
  const { source = 'global', workingDirectory } = options;
  const defaultWeight = config.learning?.defaultWeight ?? 0.55;
  const timeout = config.defaultTimeout ?? 5000;

  let script;
  if (source === 'workspace' && workingDirectory) {
    // For workspace hooks, use paths relative to project root
    const relDirs = WORKSPACE_HOOKS_DIRS.filter(d =>
      existsSync(join(workingDirectory, d)),
    );
    const relDir = relDirs[0] ?? WORKSPACE_HOOKS_DIRS[0];
    script = {
      node: `./${relDir}/${name}.js`,
    };
  } else {
    script = {
      node: `~/.copilot/hooks/${name}.js`,
    };
  }

  return {
    enabled: true,
    events: inferEvents(name),
    script,
    timeout,
    threshold: null,
    weight: defaultWeight,
    modifiers: [],
    source,
  };
}

// ─── Core: auto-register ────────────────────────────────────

/**
 * Normalize a registration value (string or object) into canonical object form.
 *
 * @param {string|object|undefined} registration
 * @returns {{ mode: string, sources: string[] }}
 */
export function normalizeRegistration(registration) {
  if (registration === undefined || registration === null) {
    return { mode: DEFAULT_REGISTRATION, sources: ['global'] };
  }
  if (typeof registration === 'string') {
    return { mode: registration, sources: ['global'] };
  }
  return {
    mode: registration.mode ?? DEFAULT_REGISTRATION,
    sources: registration.sources ?? ['global'],
  };
}

/**
 * Discover new scripts and write them into the config file.
 *
 * @param {object} config - The loaded neural-link config object
 * @param {object} [options] - Discovery options
 * @param {string} [options.workingDirectory] - CWD for resolving workspace hooks
 * @returns {{ registered: string[], disabled: string[] }}
 *   registered — names that were added to config
 *   disabled   — names whose scripts are gone (marked enabled:false)
 */
export function autoRegister(config, options = {}) {
  const result = { registered: [], disabled: [] };

  const reg = normalizeRegistration(config.registration);
  const { workingDirectory } = options;
  const handlers = config.handlers ?? {};
  let dirty = false;

  // COMPANIONS primeiro, e independentes do modo: um hook que viaja com a própria calibragem
  // (`<hook>.neural-link.json`) é uma DECLARAÇÃO explícita de quem o instalou — não é
  // adivinhação como o auto-scan, que registraria até biblioteca compartilhada como se fosse
  // handler. Por isso vale mesmo em `registration: "manual"`: manual é sobre não adivinhar,
  // não sobre ignorar o que foi declarado.
  const companions = {};
  for (const root of companionRoots()) {
    Object.assign(companions, readCompanions(root.dir, { prefix: root.prefix, baseDir: root.dir }));
  }
  for (const [name, entry] of Object.entries(companions)) {
    if (handlers[name]) continue;   // config global vence: ajuste à mão não é desfeito por update
    handlers[name] = entry;
    result.registered.push(name);
    dirty = true;
  }
  if (dirty) { config.handlers = handlers; }

  if (reg.mode !== 'auto') {
    if (dirty) { writeConfigFile(config); }
    return result;
  }

  // Collect scripts from each enabled source
  const globalNames = reg.sources.includes('global') ? scanScripts() : [];
  const workspaceNames = [];

  if (reg.sources.includes('workspace') && workingDirectory) {
    for (const relDir of WORKSPACE_HOOKS_DIRS) {
      const absDir = join(workingDirectory, relDir);
      const found = scanDirectory(absDir);
      for (const name of found) {
        if (!workspaceNames.includes(name)) {
          workspaceNames.push(name);
        }
      }
    }
  }

  // 1. Register new global scripts not yet in config
  for (const name of globalNames) {
    if (!handlers[name]) {
      handlers[name] = buildHandlerEntry(name, config, { source: 'global' });
      result.registered.push(name);
      dirty = true;
    }
  }

  // 2. Register new workspace scripts not yet in config
  for (const name of workspaceNames) {
    if (!handlers[name]) {
      handlers[name] = buildHandlerEntry(name, config, {
        source: 'workspace',
        workingDirectory,
      });
      result.registered.push(name);
      dirty = true;
    }
  }

  // 3. Disable handlers whose scripts are no longer on disk
  const allInstalledNames = new Set([...globalNames, ...workspaceNames]);
  for (const [name, handler] of Object.entries(handlers)) {
    if (handler.enabled && !allInstalledNames.has(name)) {
      handler.enabled = false;
      result.disabled.push(name);
      dirty = true;
    }
  }

  // 4. Persist to config file if anything changed
  if (dirty) {
    config.handlers = handlers;
    writeConfigFile(config);
  }

  return result;
}

/**
 * Serialize config back to the config file on disk.
 * Uses the resolved path from the last loadConfig() call.
 */
function writeConfigFile(config) {
  const configPath = getConfigPath();
  if (!configPath) return;

  const json = JSON.stringify(config, null, 2) + '\n';
  writeFileSync(configPath, json, 'utf-8');
}

// ─── File watcher ───────────────────────────────────────────

let activeWatcher = null;

/**
 * Start watching the hooks/scripts directory.
 * On changes, re-runs autoRegister so new scripts are picked up
 * and removed scripts are disabled.
 *
 * @param {object} config - The loaded neural-link config
 * @returns {import('node:fs').FSWatcher | null}
 */
export function startWatcher(config) {
  if (activeWatcher) return activeWatcher;

  const reg = normalizeRegistration(config.registration);
  if (reg.mode !== 'auto') return null;
  if (!existsSync(COPILOT.HOOKS)) return null;

  activeWatcher = watch(COPILOT.HOOKS, { persistent: false }, () => {
    try {
      autoRegister(config);
    } catch {
      // Watcher errors must never crash the process
    }
  });

  return activeWatcher;
}

/**
 * Stop the active watcher (if any).
 */
export function stopWatcher() {
  if (activeWatcher) {
    activeWatcher.close();
    activeWatcher = null;
  }
}
