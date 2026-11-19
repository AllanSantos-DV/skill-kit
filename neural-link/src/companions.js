/**
 * Torna os companions INERTES aos olhos do host.
 *
 * O host varre `~/.copilot/hooks/` RECURSIVAMENTE e valida todo `.json` como declaração de
 * hook. O companion (`<hook>.neural-link.json`) não é declaração — é calibragem: ele diz ao
 * dispatcher com que peso e em que eventos rodar um script que já vive ali. Como o Skill
 * Manager instala hook e companion lado a lado em `hooks/scripts/`, o host tropeça em cada
 * companion e registra:
 *
 *     [ERROR] Invalid hook configuration in ...\<hook>.neural-link.json: hooks must be an object
 *
 * São 8 erros a cada arranque de sessão nesta máquina — em toda sessão, o dia inteiro. Nada
 * quebra, e é justamente esse o problema: vira ruído de fundo que ensina a ignorar o log onde
 * um dia vai aparecer um erro que importa.
 *
 * A correção é declarar o que o arquivo já é: uma declaração VÁLIDA e VAZIA. Com
 * `"hooks": {}` o host lê, aceita, não registra nada e cala. O dispatcher segue lendo os
 * campos de calibragem, que ele já lê ignorando o resto.
 *
 * Medido em sandbox isolado (`COPILOT_HOME`), com controle: companion sem `hooks` produz o
 * erro; o mesmo companion com `hooks: {}` não produz. Sem o controle disparando, o teste não
 * teria provado nada — a ausência de erro poderia ser o host nem ter varrido a pasta.
 *
 * Escopo deliberado: só os companions DENTRO da pasta de hooks do host. Companion que vive na
 * pasta de uma extensão nunca é varrido pelo host, então não tem o que consertar lá.
 */

import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { COPILOT } from './infra/paths.js';
import { COMPANION_SUFFIX } from './infra/constants.js';

/** Profundidade máxima da varredura — a pasta do host é rasa; evita passeio em link cíclico. */
const MAX_DEPTH = 4;

function* companionsIn(dir, depth = 0) {
  if (depth > MAX_DEPTH || !existsSync(dir)) return;
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return; // pasta ilegível não pode derrubar o install
  }
  for (const name of entries) {
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      yield* companionsIn(full, depth + 1);
    } else if (name.endsWith(COMPANION_SUFFIX)) {
      yield full;
    }
  }
}

/**
 * Um companion só precisa de conserto quando o host o rejeitaria.
 *
 * O host exige que `hooks` seja um objeto. Array também é objeto para `typeof`, e o host o
 * recusa — por isso a checagem é explícita.
 */
export function precisaSelo(raw) {
  return !raw || typeof raw !== 'object' || Array.isArray(raw)
    ? false
    : typeof raw.hooks !== 'object' || raw.hooks === null || Array.isArray(raw.hooks);
}

/**
 * Carimba `version`/`hooks` preservando tudo o que já estava no companion.
 *
 * A calibragem é do dono do hook; este selo não pode reescrevê-la nem reordená-la.
 */
export function selar(raw) {
  const out = { ...raw };
  if (out.version === undefined) out.version = 1;
  out.hooks = {};
  return out;
}

/**
 * Percorre a pasta de hooks do host e sela os companions que o host rejeitaria.
 *
 * Idempotente: rodar de novo não reescreve nada. Um arquivo ilegível é pulado — ele já não
 * era lido pelo dispatcher, e derrubar o `install` por causa dele seria pior.
 *
 * @param {object} [options]
 * @param {boolean} [options.dryRun] - só relata
 * @param {string} [options.dir] - raiz da varredura (padrão: pasta de hooks do host)
 * @returns {{selados: string[], jaOk: number, ilegiveis: string[]}}
 */
export function selarCompanions(options = {}) {
  const { dryRun = false, dir = COPILOT.HOOKS } = options;
  const result = { selados: [], jaOk: 0, ilegiveis: [] };

  for (const file of companionsIn(dir)) {
    let raw;
    try {
      raw = JSON.parse(readFileSync(file, 'utf-8'));
    } catch {
      result.ilegiveis.push(file);
      continue;
    }
    if (!precisaSelo(raw)) {
      result.jaOk += 1;
      continue;
    }
    if (!dryRun) writeFileSync(file, JSON.stringify(selar(raw), null, 2) + '\n', 'utf-8');
    result.selados.push(file);
  }

  return result;
}
