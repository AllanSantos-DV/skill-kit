/**
 * Leitura e agregação dos logs JSONL de ativação (PATHS.LOGS) para o comando `activity`.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DEFAULT_LAST = 20;

/**
 * Converte texto JSONL em entradas. Linhas que não são um objeto JSON são contadas, não lançadas.
 * @param {string} text
 * @returns {{entries: object[], malformed: number}}
 */
export function parseJsonl(text) {
  const entries = [];
  let malformed = 0;
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const value = JSON.parse(line);
      if (value && typeof value === 'object' && !Array.isArray(value)) entries.push(value);
      else malformed++;
    } catch {
      malformed++;
    }
  }
  return { entries, malformed };
}

/**
 * Lê todos os `.jsonl` de um diretório. Diretório ausente equivale a vazio.
 * @param {string} dir
 * @returns {{entries: object[], malformed: number, files: number}}
 */
export function readLogs(dir) {
  let names;
  try {
    names = readdirSync(dir).filter((n) => n.endsWith('.jsonl')).sort();
  } catch (err) {
    if (err.code === 'ENOENT') return { entries: [], malformed: 0, files: 0 };
    throw err;
  }
  const entries = [];
  let malformed = 0;
  for (const name of names) {
    const r = parseJsonl(readFileSync(join(dir, name), 'utf8'));
    entries.push(...r.entries);
    malformed += r.malformed;
  }
  return { entries, malformed, files: names.length };
}

/** Conta entradas por valor de `key`; ausência vira "(none)". */
function count(entries, key) {
  const out = {};
  for (const e of entries) {
    const k = e[key] ?? '(none)';
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

/**
 * Filtra e agrega entradas por evento, handler e sessão (`sessionId`) e agrega por decisão; devolve as últimas N em ordem de `ts`.
 * @param {object[]} entries
 * @param {{last?: number, event?: string, handler?: string, session?: string}} [opts]
 */
export function summarize(entries, { last = DEFAULT_LAST, event, handler, session } = {}) {
  const kept = entries.filter((e) => (!event || e.event === event) && (!handler || e.handler === handler) &&
    (!session || e.sessionId === session));
  const ordered = [...kept].sort((a, b) => String(a.ts ?? '').localeCompare(String(b.ts ?? '')));
  return {
    total: kept.length,
    byEvent: count(kept, 'event'),
    byHandler: count(kept, 'handler'),
    byDecision: count(kept, 'decision'),
    lastEntries: last > 0 ? ordered.slice(-last) : [],
  };
}

/**
 * Interpreta as flags de `activity`. Valor inválido lança.
 * @param {string[]} args
 */
export function parseActivityArgs(args) {
  const out = { last: DEFAULT_LAST, event: undefined, handler: undefined, session: undefined, json: false };
  const value = (i, flag) => {
    const v = args[i + 1];
    if (v === undefined || v.startsWith('--')) throw new Error(`${flag} requires a value`);
    return v;
  };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--json': out.json = true; break;
      case '--event': out.event = value(i, '--event'); i++; break;
      case '--handler': out.handler = value(i, '--handler'); i++; break;
      case '--session': out.session = value(i, '--session'); i++; break;
      case '--last': {
        const raw = value(i, '--last');
        if (!/^\d+$/.test(raw) || Number(raw) < 1) throw new Error(`--last must be a positive integer, got "${raw}"`);
        out.last = Number(raw);
        i++;
        break;
      }
      default: throw new Error(`unknown option ${args[i]}`);
    }
  }
  return out;
}

/** Linhas `chave  n` de uma tabela, da maior contagem para a menor. */
function table(title, counts) {
  const rows = Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const width = Math.max(0, ...rows.map(([k]) => k.length));
  return [`${title}:`, ...rows.map(([k, n]) => `  ${k.padEnd(width)}  ${n}`)];
}

/**
 * Formata o resumo como texto legível ou JSON.
 * @param {ReturnType<typeof summarize>} summary
 * @param {{malformed: number, files: number}} meta
 * @param {{json: boolean}} opts
 * @returns {string}
 */
export function renderActivity(summary, meta, { json }) {
  if (json) return JSON.stringify({ ...summary, malformed: meta.malformed, files: meta.files }, null, 2);
  const lines = [`Neural Link activity: ${summary.total} entries in ${meta.files} file(s)`, ''];
  if (summary.total) {
    lines.push(...table('By event', summary.byEvent), '', ...table('By handler', summary.byHandler), '',
      ...table('By decision', summary.byDecision), '', `Last ${summary.lastEntries.length}:`);
    for (const e of summary.lastEntries) {
      const who = e.agent ? ` agent=${e.agent}` : '';
      lines.push(`  ${e.ts ?? '?'}  ${e.event ?? '?'}  ${e.handler ?? '?'}  ${e.decision ?? '?'}${who}`);
    }
  }
  if (meta.malformed) lines.push('', `${meta.malformed} malformed line(s) skipped`);
  return lines.join('\n');
}
