#!/usr/bin/env node
// Stop hook: raise a desktop alert when a long agent run ends. Off unless SKILL_KIT_STOP_ALERT is set.
//
// SKILL_KIT_STOP_ALERT=<seconds>  alert only when the run lasted at least that long ("on" = 120)
// SKILL_KIT_STOP_ALERT_CMD=<cmd>  run this command instead of the built-in alert (gets SKILL_KIT_ALERT_SECONDS)
//
// Never blocks the stop and writes nothing to stdout. An unknown duration is silent: an alert that
// cannot tell the run was long would fire on every turn.
//
// @permissions: fs.read, process.spawn
'use strict';
const { spawn } = require('child_process');
const { readStdinJson, guardStopActive, readTranscript } = require('./_lib/hook-io');

const DEFAULT_SECONDS = 120;

/**
 * Minimum run length that triggers the alert, from SKILL_KIT_STOP_ALERT.
 * @param {object} [env]
 * @returns {number|null} seconds, or null when the alert is off
 */
function thresholdSeconds(env) {
  const raw = String((env || process.env).SKILL_KIT_STOP_ALERT || '').trim().toLowerCase();
  if (raw === 'on') return DEFAULT_SECONDS;
  return /^\d+$/.test(raw) && Number(raw) > 0 ? Number(raw) : null;
}

/** Timestamp (ms) carried by a transcript event, or NaN. */
function eventTime(evt) {
  const v = evt.timestamp || evt.ts || (evt.data && evt.data.timestamp);
  return v ? Date.parse(v) : NaN;
}

/** A prompt the user typed, as opposed to a tool result carried in a user-role entry. */
function isUserPrompt(evt) {
  if (evt.type === 'user.message') return true;
  if (evt.type !== 'user' || !evt.message) return false;
  const c = evt.message.content;
  if (typeof c === 'string') return true;
  return Array.isArray(c) && c.some((p) => p && p.type === 'text') && !c.some((p) => p && p.type === 'tool_result');
}

/**
 * Seconds since the last user prompt in a transcript.
 * @param {string[]} lines JSONL transcript lines
 * @param {number} [nowMs]
 * @returns {number|null} null when no timestamped prompt is found
 */
function elapsedSeconds(lines, nowMs) {
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (!line || !line.includes('user')) continue;
    let evt;
    try { evt = JSON.parse(line); } catch (_) { continue; }
    if (!evt || !isUserPrompt(evt)) continue;
    const t = eventTime(evt);
    return Number.isNaN(t) ? null : Math.max(0, Math.round(((nowMs || Date.now()) - t) / 1000));
  }
  return null;
}

/**
 * The built-in alert for a platform: a hidden PowerShell balloon on Windows, a terminal bell elsewhere.
 * @param {string} platform process.platform value
 * @param {number} seconds run length shown in the message
 * @returns {{command: string, args: string[]}|null} null means "write a bell to stderr"
 */
function builtinAlert(platform, seconds) {
  if (platform !== 'win32') return null;
  const script = "Add-Type -AssemblyName System.Windows.Forms,System.Drawing;" +
    "$n=New-Object System.Windows.Forms.NotifyIcon;$n.Icon=[System.Drawing.SystemIcons]::Information;$n.Visible=$true;" +
    "$n.ShowBalloonTip(5000,'Agent run finished','Ran for " + seconds + " s',[System.Windows.Forms.ToolTipIcon]::Info);" +
    'Start-Sleep -Seconds 6;$n.Dispose()';
  return { command: 'powershell.exe', args: ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', script] };
}

/** Fire the alert without waiting for it. */
function raiseAlert(seconds, env) {
  const e = env || process.env;
  const custom = (e.SKILL_KIT_STOP_ALERT_CMD || '').trim();
  const childEnv = { ...e, SKILL_KIT_ALERT_SECONDS: String(seconds) };
  const opts = { env: childEnv, detached: true, stdio: 'ignore', windowsHide: true };
  if (custom) { spawn(custom, [], { ...opts, shell: true }).unref(); return; }
  const spec = builtinAlert(process.platform, seconds);
  if (!spec) { process.stderr.write('\x07'); return; }
  spawn(spec.command, spec.args, opts).unref();
}

function main() {
  readStdinJson((input) => {
    guardStopActive(input);
    const minimum = thresholdSeconds();
    if (minimum === null) return;
    const lines = readTranscript(input, { minLines: 1 });
    const seconds = lines ? elapsedSeconds(lines) : null;
    if (seconds === null || seconds < minimum) return;
    raiseAlert(seconds);
  });
}

if (require.main === module) main();

module.exports = { thresholdSeconds, elapsedSeconds, builtinAlert };
