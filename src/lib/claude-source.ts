// Claude Code PostToolUse hook payload (subset we care about)
export type ClaudeToolEvent = {
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_response: Record<string, unknown>;
  session_id: string;
};

export type ClaudeActivityEvent =
  | { type: 'tool_use'; tool: string; session_id: string }
  | { type: 'agent_spawn'; subagent_type: string; session_id: string }
  | { type: 'idle'; session_id: string }
  | { type: 'input_needed'; message: string; session_id: string }
  | { type: 'unknown'; raw: ClaudeToolEvent };

/**
 * Parse raw hook JSON string into a ClaudeActivityEvent.
 * Handles PostToolUse, Stop, and Notification hook payloads.
 * - stop_hook_active present → idle
 * - message present, no tool_name → input_needed
 * - tool_name === 'Agent' with subagent_type → agent_spawn
 * - tool_name === 'Agent' without subagent_type → unknown
 * - any other tool_name → tool_use
 * - missing session_id or unrecognised shape → null
 */
const MAX_FIELD_LEN = 256;

function safeStr(v: unknown): string | null {
  return typeof v === 'string' && v.length <= MAX_FIELD_LEN ? v : null;
}

export function parseClaudeHook(raw: string): ClaudeActivityEvent | null {
  if (raw.length > 65536) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) return null;

  const obj = parsed as Record<string, unknown>;
  const session_id = safeStr(obj['session_id']);
  if (!session_id) return null;

  // Stop hook: presence of stop_hook_active distinguishes it from PostToolUse
  if ('stop_hook_active' in obj) {
    return { type: 'idle', session_id };
  }

  // Notification hook: has message but no tool_name
  const message = safeStr(obj['message']);
  if (message !== null && !('tool_name' in obj)) {
    return { type: 'input_needed', message, session_id };
  }

  // PostToolUse hook: requires tool_name
  const tool_name = safeStr(obj['tool_name']);
  if (!tool_name) return null;

  const tool_input =
    typeof obj['tool_input'] === 'object' && obj['tool_input'] !== null
      ? (obj['tool_input'] as Record<string, unknown>)
      : {};

  const tool_response =
    typeof obj['tool_response'] === 'object' && obj['tool_response'] !== null
      ? (obj['tool_response'] as Record<string, unknown>)
      : {};

  const event: ClaudeToolEvent = { tool_name, tool_input, tool_response, session_id };

  if (tool_name === 'Agent') {
    const subagent_type = safeStr(tool_input['subagent_type']);
    if (subagent_type) {
      return { type: 'agent_spawn', subagent_type, session_id };
    }
    return { type: 'unknown', raw: event };
  }

  return { type: 'tool_use', tool: tool_name, session_id };
}

/**
 * Returns true if lastEventAt is non-null and within windowMs of Date.now().
 * Default windowMs: 30_000 (30 seconds).
 */
export function isClaudeActive(lastEventAt: number | null, windowMs = 30_000): boolean {
  if (lastEventAt === null) return false;
  return Date.now() - lastEventAt < windowMs;
}
