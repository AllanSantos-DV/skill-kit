#!/usr/bin/env node
// Stop hook: remind implementor of checklist
'use strict';
const { readStdinJson, guardStopActive, emitStopBlock } = require('./_lib/hook-io');

const reason = 'Before finishing: 1) Did you run tests? 2) Did you produce a task map (if decisions were made)? 3) Is the quality checklist satisfied?';

readStdinJson((input) => {
  guardStopActive(input);
  emitStopBlock(reason);
}, { onParseError: () => emitStopBlock(reason) });
