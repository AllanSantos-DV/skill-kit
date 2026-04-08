/**
 * Parse stdin JSON and produce enriched context packet.
 * Event-agnostic: extracts known fields if present, ignores if not.
 *
 * Supports both VS Code Copilot nested format and flat format (backward compat).
 * Nested paths tried first, flat fallback second, null if neither.
 *
 *   agent: copilot_chat.agentName → agentName
 *   tool_name: toolCall.toolName → tool_name
 *   tool_input: toolCall.input → tool_input
 *   tool_use_id: toolCall.toolUseId → tool_use_id
 *   turn_number: copilot_chat.turnNumber
 *   Common: cwd, sessionId, timestamp, transcript_path, hook_event_name
 *   Stop/SubagentStop: stop_hook_active
 *   SubagentStart/Stop: agent_id, agent_type
 *   SessionStart: source
 *   UserPromptSubmit: prompt
 * 
 * Addresses DEV-10: Input validation with truncation, event type validation, path validation
 */

// Known hook event types (from VS Code Copilot documentation and codebase)
const KNOWN_EVENT_TYPES = [
  'PreToolUse',
  'PostToolUse',
  'SessionStart',
  'Stop',
  'SubagentStart',
  'SubagentStop',
  'UserPromptSubmit',
];

// Maximum string lengths to prevent abuse
const MAX_STRING_LENGTH = 100000; // 100KB
const MAX_PATH_LENGTH = 4096;
const MAX_COMMAND_LENGTH = 50000;

/**
 * Truncate a string if it exceeds max length.
 */
function truncateString(value, maxLength) {
  if (typeof value !== 'string') return value;
  if (value.length <= maxLength) return value;
  
  console.warn(`[Sensor] Truncating string from ${value.length} to ${maxLength} chars`);
  return value.slice(0, maxLength);
}

/**
 * Validate event type against known types.
 */
function validateEventType(eventType) {
  if (!eventType) return null;
  
  if (!KNOWN_EVENT_TYPES.includes(eventType)) {
    console.warn(`[Sensor] Unknown event type: ${eventType}`);
  }
  
  return eventType;
}

/**
 * Validate and normalize file path.
 */
function validatePath(path) {
  if (!path || typeof path !== 'string') return null;
  
  // Truncate if too long
  if (path.length > MAX_PATH_LENGTH) {
    console.warn(`[Sensor] Path too long (${path.length} chars), truncating`);
    path = path.slice(0, MAX_PATH_LENGTH);
  }
  
  // Check for null bytes (path traversal protection)
  if (path.includes('\0')) {
    console.warn(`[Sensor] Path contains null byte, rejecting`);
    return null;
  }
  
  return path;
}

export function sense(stdinJson) {
  const toolInput = stdinJson.toolCall?.input ?? stdinJson.tool_input ?? null;
  const command = toolInput?.command ?? null;
  
  // Extract and validate event type
  const rawEventType = stdinJson.event ?? stdinJson.hook_event_name ?? stdinJson.hookEventName ?? null;
  const eventType = validateEventType(rawEventType);
  
  // Validate and truncate paths
  const cwd = validatePath(stdinJson.cwd);
  const transcriptPath = validatePath(stdinJson.transcript_path);
  
  // Truncate command if too long
  const validatedCommand = truncateString(command, MAX_COMMAND_LENGTH);
  
  // Truncate prompt if too long
  const rawPrompt = stdinJson.prompt ?? null;
  const validatedPrompt = truncateString(rawPrompt, MAX_STRING_LENGTH);
  
  const rawChatMessage = stdinJson.chatMessage ?? stdinJson.prompt ?? null;
  const validatedChatMessage = truncateString(rawChatMessage, MAX_STRING_LENGTH);

  return {
    // Core identity
    event_type: eventType,
    agent: stdinJson.copilot_chat?.agentName ?? stdinJson.agentName ?? stdinJson.agent_type ?? process.env.NEURAL_LINK_AGENT ?? null,

    // Workspace & session (official VS Code fields)
    cwd,
    sessionId: stdinJson.session_id ?? stdinJson.sessionId ?? null,
    timestamp: stdinJson.timestamp ?? null,
    transcript_path: transcriptPath,

    // Tool context (PreToolUse, PostToolUse) — nested (real VS Code) then flat (compat)
    tool_name: stdinJson.toolCall?.toolName ?? stdinJson.tool_name ?? null,
    tool_input: toolInput,
    command: validatedCommand,
    tool_use_id: stdinJson.toolCall?.toolUseId ?? stdinJson.tool_use_id ?? null,
    tool_response: stdinJson.tool_response ?? null,

    // Stop context
    stop_hook_active: stdinJson.stop_hook_active ?? false,

    // Subagent context
    agent_id: stdinJson.agent_id ?? null,
    agent_type: stdinJson.agent_type ?? null,

    // Session start
    source: stdinJson.source ?? null,

    // UserPromptSubmit
    prompt: validatedPrompt,
    chat_message: validatedChatMessage,

    // Turn context (from copilot_chat)
    turn_number: stdinJson.copilot_chat?.turnNumber ?? null,

    // Raw for passthrough
    raw: stdinJson,
  };
}
