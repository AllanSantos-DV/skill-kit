#!/usr/bin/env node
// Stop hook: verify file references in assistant messages were tool-backed
'use strict';
const fs = require('fs');
const path = require('path');

let rawInput = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { rawInput += chunk; });
process.stdin.on('end', () => {
  let hookInput;
  try { hookInput = JSON.parse(rawInput); } catch (_) { process.exit(0); }
  if (hookInput.stop_hook_active === true) process.exit(0);

  const transcriptPath = hookInput.transcript_path;
  if (!transcriptPath || !fs.existsSync(transcriptPath)) process.exit(0);

  let lines;
  try { lines = fs.readFileSync(transcriptPath, 'utf8').split('\n'); } catch (_) { process.exit(0); }
  if (!lines || lines.length < 5) process.exit(0);

  const accessedPaths = new Set();
  const unverified = [];

  const fileTools = [
    'read_file','create_file','replace_string_in_file','multi_replace_string_in_file',
    'list_dir','create_directory','vscode_listCodeUsages','grep_search',
    'edit_notebook_file','copilot_getNotebookSummary','file_search','semantic_search',
    'run_in_terminal'
  ];

  function norm(p) {
    return p ? p.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase() : '';
  }

  function testAccessed(mention) {
    const nm = norm(mention);
    if (!nm || nm.length < 6) return true;
    for (const ap of accessedPaths) {
      const na = norm(ap);
      if (na.endsWith(nm) || nm.endsWith(na)) return true;
    }
    return false;
  }

  const winPathRe = /(?:^|[\s`"'()\[\]>\/])([a-zA-Z]:\\(?:[\w\s._-]+\\)*[\w._-]+\.\w+)/gi;
  const relPathRe = /(?:^|[\s`"'()\[\]>\/])((src|test|docs|dist|lib|utils|commands|services|providers|webview|hooks|skills|agents|resources|config)[\\\/][\w._\/-]+\.\w+)/gi;

  function addToolPaths(args) {
    if (!args) return;
    if (args.filePath) accessedPaths.add(args.filePath);
    if (args.path) accessedPaths.add(args.path);
    if (args.query && /[\\\/]/.test(args.query)) accessedPaths.add(args.query);
    if (args.includePattern && /[\\\/]/.test(args.includePattern)) accessedPaths.add(args.includePattern);
    if (args.replacements) {
      for (const r of args.replacements) {
        if (r.filePath) accessedPaths.add(r.filePath);
      }
    }
    if (args.command) {
      const cmdRe = /([a-zA-Z]:\\(?:[\w\s._-]+\\)*[\w._-]+\.\w+)/gi;
      let m;
      while ((m = cmdRe.exec(args.command)) !== null) {
        accessedPaths.add(m[1]);
      }
    }
  }

  // Scope to current interaction: find last user.message
  let startIdx = 0;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].includes('"user.message"')) {
      startIdx = i;
      break;
    }
  }

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.length < 20) continue;
    if (!line.includes('"tool.execution_start"') && !line.includes('"assistant.message"')) continue;

    let evt;
    try { evt = JSON.parse(line); } catch (_) { continue; }

    if (evt.type === 'tool.execution_start' && fileTools.includes(evt.data && evt.data.toolName)) {
      addToolPaths(evt.data.arguments);
    } else if (evt.type === 'assistant.message') {
      // Register paths from tool requests in this message first
      if (evt.data && evt.data.toolRequests) {
        for (const req of evt.data.toolRequests) {
          if (fileTools.includes(req.name) && req.arguments) {
            try {
              const reqArgs = JSON.parse(req.arguments);
              addToolPaths(reqArgs);
            } catch (_) {}
          }
        }
      }

      const content = evt.data && evt.data.content;
      if (!content || content.length < 10) continue;

      const mentioned = [];
      let m;
      winPathRe.lastIndex = 0;
      while ((m = winPathRe.exec(content)) !== null) mentioned.push(m[1]);
      relPathRe.lastIndex = 0;
      while ((m = relPathRe.exec(content)) !== null) mentioned.push(m[1]);

      for (const mp of mentioned) {
        if (!testAccessed(mp)) unverified.push(mp);
      }
    }
  }

  if (unverified.length > 0) {
    const unique = [...new Set(unverified)].slice(0, 10);
    const list = unique.map(p => '  - ' + p).join('\n');
    const msg = 'UNVERIFIED FILE REFERENCES - these paths were mentioned without prior tool verification:\n' +
      list + '\nVerify with tools (read_file, grep_search, list_dir) or mark as assumed.';
    const result = {
      decision: 'block',
      reason: msg,
      hookSpecificOutput: {
        hookEventName: 'Stop',
        decision: 'block',
        reason: msg
      }
    };
    process.stdout.write(JSON.stringify(result) + '\n');
  } else {
    process.exit(0);
  }
});
