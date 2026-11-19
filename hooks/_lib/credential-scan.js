'use strict';
// Credential detection shared by the guard (staged diff, agent writes).
//
// Only shapes that cannot be anything else are matched (a provider's token prefix with its fixed
// length, a private-key header at the start of a line): a false alarm blocks a commit, a miss
// costs nothing the guard could have prevented, so there is no generic "high entropy" rule.
// A matched value is never returned or printed; findings carry the line and the kind only.
//
// @permissions: fs.read
const path = require('path');
const { spawnSync } = require('child_process');

const ALLOW_MARKER = 'skill-kit:allow-secret';
const ALLOW_ENV = 'SKILL_KIT_ALLOW_SECRETS';

const PLACEHOLDER = /example|placeholder|your[_-]|dummy|fake|redacted|x{6,}|\*{4,}|<[^>]*>/i;
const PATTERNS = [
  ['private key', /^\s*-----BEGIN (?:[A-Z]+ )*PRIVATE KEY(?: BLOCK)?-----/],
  ['AWS access key id', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ['AWS secret access key', /aws_secret_access_key["']?\s*[=:]\s*["']?[A-Za-z0-9/+=]{40}\b/i],
  ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})/],
  ['Slack token', /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['Stripe live key', /\b[sr]k_live_[0-9A-Za-z]{24,}/],
  ['Anthropic API key', /\bsk-ant-[A-Za-z0-9_-]{20,}/],
  ['npm token', /\bnpm_[A-Za-z0-9]{36}\b/],
];

const SENSITIVE_NAME = /^(?:\.env(?:\.(?!example$|sample$|template$|dist$).+)?|id_(?:rsa|dsa|ecdsa|ed25519)|.+\.(?:pem|p12|pfx|key))$/i;

/**
 * Whether the user switched the guard off for this process (`SKILL_KIT_ALLOW_SECRETS=1`).
 * @param {object} [env]
 * @returns {boolean}
 */
function guardDisabled(env) {
  return (env || process.env)[ALLOW_ENV] === '1';
}

/**
 * Credential-shaped lines in a text. Lines that say they are an example, or carry the
 * `skill-kit:allow-secret` marker, are skipped.
 * @param {string} text
 * @returns {{line: number, kind: string}[]} one finding per line, in line order
 */
function scanText(text) {
  const findings = [];
  const lines = String(text || '').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.includes(ALLOW_MARKER) || PLACEHOLDER.test(l)) continue;
    const hit = PATTERNS.find(([, re]) => re.test(l));
    if (hit) findings.push({ line: i + 1, kind: hit[0] });
  }
  return findings;
}

/**
 * Whether a file name is one that normally holds credentials (`.env`, `*.pem`, private keys).
 * Templates such as `.env.example` are not.
 * @param {string} file
 * @returns {boolean}
 */
function isSensitiveFileName(file) {
  return SENSITIVE_NAME.test(path.basename(String(file || '')));
}

/**
 * Credentials added by a unified diff (only the `+` lines are read).
 * @param {string} diff output of `git diff --cached -U0`
 * @returns {{file: string, line: number, kind: string}[]}
 */
function scanDiff(diff) {
  const findings = [];
  let file = '';
  let newLine = 0;
  for (const raw of String(diff || '').split(/\r?\n/)) {
    if (raw.startsWith('+++ ')) { file = raw.slice(4).replace(/^b\//, ''); continue; }
    const hunk = raw.match(/^@@ -\S+ \+(\d+)/);
    if (hunk) { newLine = Number(hunk[1]); continue; }
    if (raw.startsWith('+') && !raw.startsWith('+++')) {
      for (const f of scanText(raw.slice(1))) findings.push({ file, line: newLine, kind: f.kind });
      newLine++;
    }
  }
  return findings;
}

/**
 * Review what `git commit` would record.
 * @param {string} cwd repository directory
 * @returns {{ok: boolean, findings: {file: string, line: number, kind: string}[], files: string[], error?: string}}
 *   `ok` is false when git could not answer; the caller decides what unknown means.
 */
function reviewStaged(cwd) {
  const run = (args) => spawnSync('git', args, { cwd, encoding: 'utf8', timeout: 5000, windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
  const diff = run(['diff', '--cached', '-U0', '--no-color', '--no-ext-diff']);
  const names = run(['diff', '--cached', '--name-only', '--no-color']);
  if (diff.error || diff.status !== 0 || names.error || names.status !== 0) {
    return { ok: false, findings: [], files: [], error: 'git could not list the staged changes' };
  }
  const files = names.stdout.split(/\r?\n/).filter(Boolean).filter(isSensitiveFileName);
  return { ok: true, findings: scanDiff(diff.stdout), files };
}

module.exports = { ALLOW_MARKER, ALLOW_ENV, guardDisabled, scanText, scanDiff, isSensitiveFileName, reviewStaged };
