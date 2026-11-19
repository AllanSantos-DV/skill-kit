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

import { readdirSync, existsSync, writeFileSync, unlinkSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COPILOT, PATHS } from './infra/paths.js';
import { GLOBAL_HOOK_EVENTS, COMPANION_SUFFIX } from './infra/constants.js';
import { loadConfig } from './infra/config.js';
import { autoRegister } from './discovery.js';
import { selarCompanions } from './companions.js';
import { guardedCommand } from './infra/hook-launcher.js';
import { resolveHandlerTimeout } from './infra/handler-timeout.js';

export { guardedCommand, guardedScript } from './infra/hook-launcher.js';

const PREFIX = '_dispatcher-';
const DISABLED_SUFFIXES = ['.disable', '.disabled'];

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
  const instalado = join(PATHS.BASE, 'runtimes', 'neural-link', 'src', 'index.js');
  if (existsSync(instalado)) return instalado.replace(/\\/g, '/');
  return join(dirname(fileURLToPath(import.meta.url)), 'index.js').replace(/\\/g, '/');
}

/**
 * Eventos que têm ao menos um handler habilitado, com o timeout necessário para o mais lento.
 *
 * Evento fora de :const:`GLOBAL_HOOK_EVENTS` é DESCARTADO com aviso: o host nunca entrega esse
 * evento a uma declaração global, então escrever o arquivo criaria um handler que jamais roda —
 * e daria a impressão de que o hook está coberto. Quem precisa de evento próprio de extensão
 * declara no `hooks.json` da extensão.
 *
 * @param {object} config
 * @returns {{events: Map<string, number>, ignorados: string[]}}
 */
export function eventsInUse(config) {
  const events = new Map();
  const ignorados = new Set();
  for (const handler of Object.values(config.handlers ?? {})) {
    if (handler?.enabled === false) continue;
    for (const ev of handler?.events ?? []) {
      if (!GLOBAL_HOOK_EVENTS.includes(ev)) { ignorados.add(ev); continue; }
      const needed = Math.ceil(resolveHandlerTimeout(handler, config, ev) / 1000) + 5;
      events.set(ev, Math.max(events.get(ev) ?? 10, needed));
    }
  }
  return { events, ignorados: [...ignorados] };
}

function declaration(event, timeout, entry, count) {
  return JSON.stringify({
    version: 1,
    _comment:
      `Gerado por 'neural-link install'. Supervisor isolado para ${count} handler(s) de ${event}. ` +
      `Registro, pesos e escopo ficam no neural-link.config.json — nao edite este arquivo a mao.`,
    hooks: {
      [event]: [{ type: 'command', command: guardedCommand(entry, event, timeout), timeout }],
    },
  }, null, 2) + '\n';
}

/**
 * Escreve/atualiza as declarações e remove as de eventos que não têm mais handler.
 *
 * @param {object} [options]
 * @param {boolean} [options.dryRun] - só relata, não escreve
 * @returns {{written: string[], removed: string[], unchanged: string[], disabled: string[], skipped: object[], entry: string}}
 */
export function install(options = {}) {
  const { dryRun = false } = options;
  // Discovery mutates config; a preview must not poison the cached config or persist changes.
  const config = dryRun ? JSON.parse(JSON.stringify(loadConfig())) : loadConfig();
  const discovery = autoRegister(config, { dryRun });

  const entry = dispatcherEntry();
  // `entry` já usa `/`, que o Windows também aceita; trocar por `\` quebrava no Linux/macOS.
  if (!existsSync(entry)) {
    throw new Error(`dispatcher nao encontrado em ${entry}`);
  }

  const { events: wanted, ignorados } = eventsInUse(config);
  const counts = new Map();
  for (const handler of Object.values(config.handlers ?? {})) {
    if (handler?.enabled === false) continue;
    for (const ev of handler?.events ?? []) counts.set(ev, (counts.get(ev) ?? 0) + 1);
  }

  if (!dryRun && !existsSync(COPILOT.HOOKS)) mkdirSync(COPILOT.HOOKS, { recursive: true });

  const result = { written: [], removed: [], unchanged: [], disabled: [], skipped: [], ignorados, entry, discovery };
  const protectedEvents = new Set();
  if (existsSync(COPILOT.HOOKS)) {
    const files = readdirSync(COPILOT.HOOKS);
    // An OFF marker wins even when an old installer accidentally recreated the active file.
    // Never overwrite/rename/delete the marker: it is the user's persistent selection.
    for (const name of files) {
      if (!name.startsWith(PREFIX)) continue;
      const suffix = DISABLED_SUFFIXES.find(s => name.endsWith('.json' + s));
      if (!suffix) continue;
      const event = name.slice(PREFIX.length, -('.json' + suffix).length);
      if (protectedEvents.has(event)) continue;
      protectedEvents.add(event);
      result.disabled.push(event);
      result.skipped.push({ event, reason: 'marker' });
      const active = join(COPILOT.HOOKS, `${PREFIX}${event}.json`);
      if (existsSync(active)) {
        if (!dryRun) unlinkSync(active);
        result.removed.push(event);
      }
    }
    for (const name of files) {
      if (!name.startsWith(PREFIX) || !name.endsWith('.json')) continue;
      const event = name.slice(PREFIX.length, -'.json'.length);
      if (protectedEvents.has(event)) continue;
      try {
        const current = JSON.parse(readFileSync(join(COPILOT.HOOKS, name), 'utf-8'));
        if (current?.enabled !== false && !current?.hooks?.[event]?.some(h => h.enabled === false)) continue;
        result.disabled.push(event);
        result.skipped.push({ event, reason: 'enabled:false' });
      } catch {
        // A declaration we cannot interpret is not permission to erase user selection.
        result.skipped.push({ event, reason: 'invalid declaration' });
      }
      protectedEvents.add(event);
    }
  }

  for (const [event, timeout] of wanted) {
    if (protectedEvents.has(event)) continue;
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
      if (wanted.has(event) || protectedEvents.has(event)) continue;
      if (!dryRun) unlinkSync(join(COPILOT.HOOKS, f));
      result.removed.push(event);
    }
  }

  // O host varre esta pasta inteira e rejeita todo .json que não seja declaração — inclusive os
  // companions que ele mesmo nunca deveria ler. Selar aqui é o que mantém o log limpo sem
  // exigir passo manual: quem instala o dispatcher já sai com a máquina em ordem. E como um
  // `pull` do repositório de skills pode trazer companions crus de novo, o conserto precisa
  // viver no comando que se roda de novo, não numa correção de uma vez só.
  result.companions = selarCompanions({ dryRun });

  // Um .json avulso direto em hooks/ (fora do PREFIX) é uma declaração de hook que o host
  // roda POR CONTA PRÓPRIA, em paralelo ao dispatcher — se o handler correspondente também
  // está registrado no config, ele executa DUAS VEZES por evento (uma vez pelo avulso, outra
  // dentro do dispatcher). Foi assim que 24 arquivos ficaram órfãos nesta máquina: cada um
  // migrou para virar handler do neural-link, mas a declaração antiga nunca foi apagada.
  // Só avisa — apagar sem confirmação humana é decisão de quem instala, não deste script.
  result.orfaos = [];
  if (existsSync(COPILOT.HOOKS)) {
    for (const f of readdirSync(COPILOT.HOOKS)) {
      // Companion não é declaração avulsa: é calibragem selada que TEM de morar aqui. Listá-lo
      // mandava o usuário movê-lo para fora — e tirava a calibragem de todos os handlers.
      if (!f.endsWith('.json') || f.startsWith(PREFIX) || f.endsWith(COMPANION_SUFFIX)) continue;
      if (!statSync(join(COPILOT.HOOKS, f)).isFile()) continue;
      result.orfaos.push(f);
    }
    if (result.orfaos.length > 0) {
      console.warn(
        `[neural-link] ${result.orfaos.length} declaração(ões) avulsa(s) em ${COPILOT.HOOKS} ` +
        `fora do dispatcher (${result.orfaos.join(', ')}) — se o handler correspondente já está ` +
        `no neural-link.config.json, ele roda em DOBRO a cada evento. Mova pra fora de hooks/ ` +
        `se já estiver coberto pelo dispatcher.`
      );
    }
  }

  return result;
}
