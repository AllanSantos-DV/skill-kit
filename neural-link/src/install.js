/**
 * Instala as declarações de hook do dispatcher em ~/.copilot/hooks/.
 *
 * O host lê uma declaração por evento e a executa embrulhada em shell — cada declaração custa
 * três processos (shell + console + node). Por isso existe UMA declaração por evento, e não uma
 * por hook: dentro dela o dispatcher roda todos os handlers daquele evento no mesmo processo.
 *
 * Estas declarações eram escritas à mão, e era esse o último ponto que uma reinstalação desfazia.
 * Agora o próprio dispatcher as instala, a partir de quem está registrado.
 */

import { readdirSync, existsSync, writeFileSync, unlinkSync, mkdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { COPILOT } from './infra/paths.js';
import { loadConfig } from './infra/config.js';
import { autoRegister } from './discovery.js';

const PREFIX = '_dispatcher-';

/**
 * Caminho do dispatcher que as declarações devem invocar.
 *
 * Preferir o runtime INSTALADO pelo engine-registry, não o módulo em execução. Derivar de
 * `import.meta.url` parece natural e é uma armadilha: rodar `neural-link install` de dentro de
 * um checkout gravaria nas declarações GLOBAIS o caminho da cópia de trabalho de quem rodou —
 * e mover ou apagar aquela pasta derrubaria TODOS os hooks da máquina, sem pista da causa.
 *
 * Só cai para o módulo atual quando não há runtime instalado (desenvolvimento puro).
 */
export function dispatcherEntry() {
  const instalado = join(homedir(), '.copilot', 'neural-link', 'runtimes', 'neural-link', 'src', 'index.js');
  if (existsSync(instalado)) return instalado.replace(/\\/g, '/');
  return join(dirname(fileURLToPath(import.meta.url)), 'index.js').replace(/\\/g, '/');
}

/**
 * Eventos que têm ao menos um handler habilitado, com o timeout necessário para o mais lento.
 *
 * @param {object} config
 * @returns {Map<string, number>} evento -> timeout em segundos
 */
export function eventsInUse(config) {
  const events = new Map();
  for (const handler of Object.values(config.handlers ?? {})) {
    if (handler?.enabled === false) continue;
    for (const ev of handler?.events ?? []) {
      const needed = Math.ceil((handler.timeout ?? 5000) / 1000) + 5;
      events.set(ev, Math.max(events.get(ev) ?? 10, needed));
    }
  }
  return events;
}

function declaration(event, timeout, entry, count) {
  return JSON.stringify({
    version: 1,
    _comment:
      `Gerado por 'neural-link install'. ${count} handler(s) de ${event} rodam num processo so. ` +
      `Registro, pesos e escopo ficam no neural-link.config.json — nao edite este arquivo a mao.`,
    hooks: {
      [event]: [{ type: 'command', command: `node ${entry}`, timeout }],
    },
  }, null, 2) + '\n';
}

/**
 * Escreve/atualiza as declarações e remove as de eventos que não têm mais handler.
 *
 * @param {object} [options]
 * @param {boolean} [options.dryRun] - só relata, não escreve
 * @returns {{written: string[], removed: string[], unchanged: string[], entry: string}}
 */
export function install(options = {}) {
  const { dryRun = false } = options;
  const config = loadConfig();
  autoRegister(config);

  const entry = dispatcherEntry();
  if (!existsSync(entry.replace(/\//g, '\\'))) {
    throw new Error(`dispatcher nao encontrado em ${entry}`);
  }

  const wanted = eventsInUse(config);
  const counts = new Map();
  for (const handler of Object.values(config.handlers ?? {})) {
    if (handler?.enabled === false) continue;
    for (const ev of handler?.events ?? []) counts.set(ev, (counts.get(ev) ?? 0) + 1);
  }

  if (!dryRun && !existsSync(COPILOT.HOOKS)) mkdirSync(COPILOT.HOOKS, { recursive: true });

  const result = { written: [], removed: [], unchanged: [], entry };

  for (const [event, timeout] of wanted) {
    const file = join(COPILOT.HOOKS, `${PREFIX}${event}.json`);
    const content = declaration(event, timeout, entry, counts.get(event) ?? 0);
    const current = existsSync(file) ? readFileSync(file, 'utf-8') : null;
    if (current === content) { result.unchanged.push(event); continue; }
    if (!dryRun) writeFileSync(file, content, 'utf-8');
    result.written.push(event);
  }

  // Evento que perdeu o último handler não pode continuar acordando o dispatcher à toa.
  if (existsSync(COPILOT.HOOKS)) {
    for (const f of readdirSync(COPILOT.HOOKS)) {
      if (!f.startsWith(PREFIX) || !f.endsWith('.json')) continue;
      const event = f.slice(PREFIX.length, -'.json'.length);
      if (wanted.has(event)) continue;
      if (!dryRun) unlinkSync(join(COPILOT.HOOKS, f));
      result.removed.push(event);
    }
  }

  return result;
}
