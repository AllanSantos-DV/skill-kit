#!/usr/bin/env node
// Stop hook: validate that contextação Phase 2 confidence table has tool
// evidence for every 🟡/🔴 axis, and cross-check listed tools against
// the session transcript.
'use strict';
const { readStdinJson, guardStopActive, readTranscriptRaw, emitStopBlock } = require('./_lib/hook-io');

readStdinJson((inputJson) => {
  guardStopActive(inputJson);

  const transcript = readTranscriptRaw(inputJson);
  if (!transcript) process.exit(0);

  // Detect Phase 2 confidence table with Tools used column
  if (!/\|\s*Axis\s*\|\s*Confidence\s*\|\s*Justification\s*\|\s*Tools\s*used\s*\|/.test(transcript)) {
    process.exit(0);
  }

  // Parse confidence table rows
  // Match rows: | AxisName | emoji | justification | tools |
  const greenEmoji = '\u{1F7E2}';
  const yellowEmoji = '\u{1F7E1}';
  const redEmoji = '\u{1F534}';
  const rowPattern = new RegExp(
    '\\|\\s*([^|]+?)\\s*\\|\\s*(' + greenEmoji + '|' + yellowEmoji + '|' + redEmoji + ')\\s*\\|\\s*([^|]*?)\\s*\\|\\s*([^|]*?)\\s*\\|',
    'g'
  );

  const violations = [];
  let match;
  while ((match = rowPattern.exec(transcript)) !== null) {
    const axisName = match[1].trim();
    const emoji = match[2].trim();
    const toolsCell = match[4].trim();

    // Skip 🟢 axes — no tool evidence required
    if (emoji === greenEmoji) continue;

    const emojiLabel = emoji === yellowEmoji ? yellowEmoji : redEmoji;

    // Check if tools column is empty or just a dash
    if (!toolsCell || /^\s*$/.test(toolsCell) || /^\s*[-\u2014]\s*$/.test(toolsCell)) {
      violations.push({ type: 'empty', axis: axisName, emoji: emojiLabel });
      continue;
    }

    // Extract tool names from the cell: tool_name("...") or tool_name('...')
    const toolMatches = [...toolsCell.matchAll(/(\w+)\s*\(/g)];
    if (toolMatches.length === 0) {
      violations.push({ type: 'empty', axis: axisName, emoji: emojiLabel });
      continue;
    }

    for (const toolMatch of toolMatches) {
      const toolName = toolMatch[1];
      // Cross-check: does this tool name appear elsewhere in the transcript?
      if (!transcript.includes(toolName)) {
        violations.push({ type: 'notfound', axis: axisName, emoji: emojiLabel, tool: toolName });
      }
    }
  }

  if (violations.length === 0) process.exit(0);

  // Build block reason from first violation
  const first = violations[0];
  let reason;
  if (first.type === 'empty') {
    reason = "Axis '" + first.axis + "' classified as " + first.emoji + " but no tools listed in the Tools used column. Active Research Gate requires declaring which tools were used.";
  } else {
    reason = "Axis '" + first.axis + "' lists tool '" + first.tool + "' but no matching tool call was found in the session transcript. The tool evidence must match actual tool usage.";
  }

  if (violations.length > 1) {
    reason += ' (+ ' + (violations.length - 1) + ' more violation(s))';
  }

  emitStopBlock(reason);
});
