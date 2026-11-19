/**
 * Poda de arquivos antigos de logs e debug para o comando `prune`.
 */

import { readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const DAY_MS = 24 * 3600 * 1000;
const DEFAULT_DAYS = 14;

/**
 * Lê `--days N` (padrão 14). Valor ausente ou não inteiro positivo lança.
 * @param {string[]} args
 * @returns {number}
 */
export function parseDays(args) {
  const i = args.indexOf('--days');
  if (i === -1) return DEFAULT_DAYS;
  const raw = args[i + 1];
  if (raw === undefined || !/^\d+$/.test(raw) || Number(raw) < 1) {
    throw new Error(`--days must be a positive integer, got ${raw === undefined ? 'nothing' : `"${raw}"`}`);
  }
  return Number(raw);
}

/**
 * Apaga arquivos regulares mais antigos que `days` diretamente dentro de `dirs`.
 * Não desce em subdiretórios nem toca em nada fora dos diretórios informados.
 * @param {{dirs: string[], days: number, dryRun?: boolean, now?: number}} opts
 * @returns {{deleted: number, bytes: number, dryRun: boolean, files: string[]}}
 */
export function prune({ dirs, days, dryRun = false, now = Date.now() }) {
  const cutoff = now - days * DAY_MS;
  const files = [];
  let bytes = 0;
  for (const dir of dirs) {
    let names;
    try {
      names = readdirSync(dir);
    } catch (err) {
      if (err.code === 'ENOENT') continue;
      throw err;
    }
    for (const name of names) {
      const full = join(dir, name);
      const st = statSync(full);
      if (!st.isFile() || st.mtimeMs >= cutoff) continue;
      if (!dryRun) unlinkSync(full);
      files.push(full);
      bytes += st.size;
    }
  }
  return { deleted: files.length, bytes, dryRun, files };
}
