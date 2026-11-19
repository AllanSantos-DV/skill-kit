'use strict';
// Every hook command declared in an agent frontmatter names its owner project.
// Run: node --test tests/hooks/agents-hook-origin.test.js

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const AGENTS = path.join(__dirname, '..', '..', 'agents');

for (const file of fs.readdirSync(AGENTS).filter((f) => f.endsWith('.agent.md'))) {
  test(`${file}: every hook command ends with --hook-origin=skill-kit`, () => {
    const text = fs.readFileSync(path.join(AGENTS, file), 'utf8').replace(/\r\n/g, '\n');
    const commands = [...text.matchAll(/^\s*command:\s*"([^"]+)"/gm)].map((m) => m[1]);
    assert.ok(commands.length > 0, 'no hook command found');
    for (const c of commands) assert.match(c, / --hook-origin=skill-kit$/, c);
  });
}
