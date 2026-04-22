#!/usr/bin/env node
// UserPromptSubmit hook: inject relevant lessons learned into agent context
// Reads user prompt, matches keywords to tags, finds lessons, injects summaries.
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

let rawInput = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { rawInput += chunk; });
process.stdin.on('end', () => {
  let hookInput;
  try { hookInput = JSON.parse(rawInput); } catch (_) { process.exit(0); }

  // Extract user prompt text from the hook input
  let userPrompt = null;
  if (hookInput.chatMessage) userPrompt = hookInput.chatMessage;
  if (!userPrompt && hookInput.user_message) userPrompt = hookInput.user_message;
  if (!userPrompt && hookInput.prompt) userPrompt = hookInput.prompt;
  if (!userPrompt && hookInput.data) {
    const d = hookInput.data;
    if (d.chatMessage) userPrompt = d.chatMessage;
    if (!userPrompt && d.user_message) userPrompt = d.user_message;
    if (!userPrompt && d.message) userPrompt = d.message;
  }
  if (!userPrompt) process.exit(0);

  const promptLower = userPrompt.toLowerCase();

  // Keyword matching — map prompt words to lesson tags
  const tagMap = {
    'create':    ['criar','novo','adicionar','new','add','create'],
    'modify':    ['alterar','mudar','editar','refatorar','update','edit','modify','refactor'],
    'fix':       ['corrigir','fix','bug','erro','error'],
    'delete':    ['deletar','remover','remove','delete'],
    'search':    ['pesquisar','buscar','search','find','grep'],
    'configure': ['configurar','config','setup'],
    'hooks':     ['hook','hooks'],
    'agents':    ['agent','agente'],
    'skills':    ['skill','skills'],
    'git':       ['git','commit','push','branch','merge'],
    'testing':   ['test','teste','testing'],
    'regex':     ['regex','pattern'],
    'shell':     ['shell','bash','powershell','ps1','terminal']
  };

  const matchedTags = new Set();
  for (const [tag, keywords] of Object.entries(tagMap)) {
    for (const kw of keywords) {
      if (new RegExp('\\b' + kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(promptLower)) {
        matchedTags.add(tag);
        break;
      }
    }
  }

  if (matchedTags.size === 0) process.exit(0);

  // Find lessons directory
  const lessonsDir = path.join(os.homedir(), '.copilot', 'lessons');
  if (!fs.existsSync(lessonsDir)) process.exit(0);

  let lessonFiles;
  try {
    lessonFiles = fs.readdirSync(lessonsDir).filter(f => /^L.*\.md$/.test(f));
  } catch (_) { process.exit(0); }
  if (!lessonFiles || lessonFiles.length === 0) process.exit(0);

  // Parse frontmatter and filter by tags
  const candidates = [];
  for (const f of lessonFiles) {
    let content;
    try { content = fs.readFileSync(path.join(lessonsDir, f), 'utf8'); } catch (_) { continue; }
    if (!content) continue;

    // Check for frontmatter delimiters
    const fmMatch = content.match(/^---\s*\r?\n([\s\S]+?)\r?\n---/);
    if (!fmMatch) continue;
    const fm = fmMatch[1];

    // Extract id
    let id = '';
    const idMatch = fm.match(/^id:\s*(.+)$/m);
    if (idMatch) id = idMatch[1].trim();

    // Extract tags — supports [tag1, tag2] format
    let fileTags = [];
    const tagsMatch = fm.match(/^tags:\s*\[([^\]]*)\]/m);
    if (tagsMatch) {
      fileTags = tagsMatch[1].split(',').map(t => t.trim()).filter(Boolean);
    }
    if (fileTags.length === 0) continue;

    // Extract confidence
    let confidence = 0.5;
    const confMatch = fm.match(/^confidence:\s*([\d.]+)/m);
    if (confMatch) confidence = parseFloat(confMatch[1]);

    // Check tag intersection
    let hasMatch = false;
    for (const ft of fileTags) {
      if (matchedTags.has(ft)) { hasMatch = true; break; }
    }
    if (!hasMatch) continue;

    // Extract resumo (first 2 lines after ## Resumo)
    let resumo = '';
    const resumoMatch = content.match(/## Resumo\s*\r?\n([\s\S]+?)(?:\r?\n## |\s*$)/);
    if (resumoMatch) {
      const resumoLines = resumoMatch[1].trim().split(/\r?\n/).filter(l => l.trim() !== '').slice(0, 2);
      resumo = resumoLines.join(' ').trim();
    }
    if (!resumo) continue;

    candidates.push({ id, confidence, resumo, tags: fileTags });
  }

  if (candidates.length === 0) process.exit(0);

  // Sort by confidence DESC, take top 5
  candidates.sort((a, b) => b.confidence - a.confidence);
  const top = candidates.slice(0, 5);

  const tagList = [...matchedTags].sort().join(', ');
  const outputLines = ['Licoes aprendidas relevantes (tags: ' + tagList + '):'];
  for (const lesson of top) {
    outputLines.push('- [' + lesson.id + '] ' + lesson.resumo + ' (confidence: ' + lesson.confidence + ')');
  }
  outputLines.push('Para detalhes completos: read_file ~/.copilot/lessons/<id>-*.md');

  let msg = outputLines.join('\n');

  // Enforce 500 char limit
  if (msg.length > 500) {
    msg = msg.substring(0, 497) + '...';
  }

  const result = {
    decision: 'add',
    content: msg
  };
  process.stdout.write(JSON.stringify(result) + '\n');
});
