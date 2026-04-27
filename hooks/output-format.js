#!/usr/bin/env node
// Stop hook for researcher/validator: remind output format
'use strict';
const { readStdinJson, guardStopActive, emitStopBlock } = require('./_lib/hook-io');

const reason = 'Verify your output follows the required format: Research Summary (researcher) or Validation Report (validator) with all mandatory sections.';

readStdinJson((input) => {
  guardStopActive(input);
  emitStopBlock(reason);
}, { onParseError: () => emitStopBlock(reason) });
