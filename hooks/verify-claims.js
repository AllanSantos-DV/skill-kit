#!/usr/bin/env node
// Stop hook: MECHANICAL file-reference check.
//
// The hook does the verification ITSELF — it is not the agent's job to re-open a file just to "prove"
// it exists. For every file path the assistant mentions in its message this turn, the hook resolves
// the path and checks the filesystem. It ONLY warns when a cited path does NOT exist on disk (a likely
// typo / hallucination). Paths that exist, or that the agent actively operated on this turn (create /
// edit / delete / read via ANY tool), never trigger a warning.
//
// This replaces the old behavior, which flagged EVERY mention as "unverified" because it keyed off a
// hardcoded list of VS-Code tool names (read_file, grep_search, …) that don't match this runtime's
// tools (view, create, edit, grep, glob, powershell). That produced a false positive on every file
// path the agent named. The only accepted residual false positive now is naming a file you are ABOUT
// to create in a LATER turn — rare and specific, by design.
'use strict';
const fs = require('fs');
const path = require('path');
const { readStdinJson, guardStopActive, readTranscript, lastUserMessageIdx, emitStopBlock } = require('./_lib/hook-io');

readStdinJson((hookInput) => {
  guardStopActive(hookInput);

  const lines = readTranscript(hookInput);
  if (!lines) process.exit(0);

  const cwd = hookInput.cwd || process.cwd();

  // Absolute Windows path (C:\a\b\file.ext) and workspace-relative path (dir/.../file.ext) matchers.
  const winPathRe = /([a-zA-Z]:\\(?:[\w .\-]+\\)*[\w .\-]+\.\w+)/g;
  const relPathRe = /(?:^|[\s`"'(\[<>])((?:src|test|tests|docs|dist|lib|bin|scripts|daemon|bridge|app|util|utils|commands|services|providers|webview|hooks|skills|agents|resources|config|public)[\\/][\w.\-/\\]+\.\w+)/gi;

  const operated = new Set();   // paths the agent touched via ANY tool this turn (tool-name-agnostic)
  const mentioned = new Set();  // paths the assistant cited in prose this turn

  function harvest(target, text) {
    if (!text || typeof text !== 'string') return;
    for (const m of text.matchAll(winPathRe)) target.add(m[1]);
    for (const m of text.matchAll(relPathRe)) target.add(m[1]);
  }
  function harvestArgs(args) {
    if (!args) return;
    try { harvest(operated, typeof args === 'string' ? args : JSON.stringify(args)); } catch (_) {}
  }

  const startIdx = lastUserMessageIdx(lines);
  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.length < 20) continue;
    if (!line.includes('"tool.execution_start"') && !line.includes('"assistant.message"')) continue;
    let evt;
    try { evt = JSON.parse(line); } catch (_) { continue; }

    if (evt.type === 'tool.execution_start') {
      harvestArgs(evt.data && evt.data.arguments);
    } else if (evt.type === 'assistant.message') {
      if (evt.data && evt.data.toolRequests) {
        for (const req of evt.data.toolRequests) harvestArgs(req.arguments);
      }
      const content = evt.data && evt.data.content;
      if (content && content.length >= 10) harvest(mentioned, content);
    }
  }

  const norm = (p) => (p ? p.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase() : '');

  function existsResolved(p) {
    const isAbs = path.isAbsolute(p) || /^[a-zA-Z]:\\/.test(p);
    try {
      if (isAbs) return fs.existsSync(p);
      // workspace-relative: resolve against the session cwd (and, as a fallback, process.cwd()).
      if (fs.existsSync(path.resolve(cwd, p))) return true;
      if (fs.existsSync(path.resolve(process.cwd(), p))) return true;
    } catch (_) {}
    return false;
  }

  function wasOperatedOn(p) {
    const np = norm(p);
    if (!np) return false;
    for (const op of operated) {
      const no = norm(op);
      if (no && (no.endsWith(np) || np.endsWith(no))) return true;
    }
    return false;
  }

  const missing = [];
  for (const mp of mentioned) {
    if (!mp || mp.length < 6) continue;
    if (existsResolved(mp)) continue;   // the hook verified it exists — nothing for the agent to do
    if (wasOperatedOn(mp)) continue;    // created/edited/deleted this turn (may not exist right now)
    missing.push(mp);
  }

  if (missing.length > 0) {
    const unique = [...new Set(missing)].slice(0, 10);
    const list = unique.map((p) => '  - ' + p).join('\n');
    const msg = 'CAMINHO NÃO ENCONTRADO NO DISCO — estes caminhos citados não existem (possível erro de digitação ou nome; ignore se você ainda vai criá-lo):\n' +
      list;
    emitStopBlock(msg);
  } else {
    process.exit(0);
  }
});
