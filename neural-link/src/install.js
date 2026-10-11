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
      const needed = Math.ceil((handler.timeout ?? 5000) / 1000) + 5;
      events.set(ev, Math.max(events.get(ev) ?? 10, needed));
    }
  }
  return { events, ignorados: [...ignorados] };
}

/**
 * Comando que a declaração executa: confere o entry ANTES de carregá-lo.
 *
 * `node <entry>` direto morre com MODULE_NOT_FOUND quando a pasta do runtime some, e o host trata
 * PreToolUse que falha como negação — UMA pasta apagada negou todas as ferramentas do Copilot
 * (2026-10-11). Nada do dispatcher roda nesse caso, então a proteção tem de viver aqui: entry
 * ausente libera o evento (exit 0, sem handlers) e grita no stderr; entry presente é importado
 * e qualquer outra falha continua derrubando o processo, como antes.
 *
 * O host NÃO grava o stderr de hook que sai com 0 (medido em 2026-10-11), então no SessionStart
 * o aviso também vai como `additionalContext`: é o único canal que chega a alguém — o agente
 * lê e repassa. Nos outros eventos, contexto extra a cada ferramenta seria ruído.
 *
 * O texto passa por shell (cmd, PowerShell ou bash, conforme o host): nada de aspas duplas
 * internas, `$`, crase, `!`, `%` ou redirecionamento.
 */
export function guardedCommand(entry, event) {
  const f = entry.replace(/\\/g, '/').replace(/'/g, '\\x27');
  const aviso = 'var m=\'[neural-link] dispatcher ausente em \'+f+' +
    '\' - evento liberado SEM rodar handlers. Reinstale o runtime (engine-registry ensureNeuralLink) e rode neural-link install.\';' +
    'process.stderr.write(m+\'\\n\');';
  const contexto = event === 'SessionStart'
    // As duas formas: o Copilot CLI só consome `additionalContext` no TOPO do objeto (doc de
    // hooks-reference); `hookSpecificOutput` é o formato do Claude Code.
    ? 'process.stdout.write(JSON.stringify({additionalContext:m,hookSpecificOutput:{hookEventName:\'SessionStart\',additionalContext:m}}));'
    : '';
  return 'node -e "var f=\'' + f + '\';' +
    'if(require(\'fs\').existsSync(f)){import(require(\'url\').pathToFileURL(f).href)}' +
    'else{' + aviso + contexto + '}"';
}

function declaration(event, timeout, entry, count) {
  return JSON.stringify({
    version: 1,
    _comment:
      `Gerado por 'neural-link install'. ${count} handler(s) de ${event} rodam num processo so. ` +
      `Registro, pesos e escopo ficam no neural-link.config.json — nao edite este arquivo a mao.`,
    hooks: {
      [event]: [{ type: 'command', command: guardedCommand(entry, event), timeout }],
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

  const { events: wanted, ignorados } = eventsInUse(config);
  const counts = new Map();
  for (const handler of Object.values(config.handlers ?? {})) {
    if (handler?.enabled === false) continue;
    for (const ev of handler?.events ?? []) counts.set(ev, (counts.get(ev) ?? 0) + 1);
  }

  if (!dryRun && !existsSync(COPILOT.HOOKS)) mkdirSync(COPILOT.HOOKS, { recursive: true });

  const result = { written: [], removed: [], unchanged: [], ignorados, entry };

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
