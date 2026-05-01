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
  | { type: 'unknown'; raw: ClaudeToolEvent };

/**
 * Parse raw hook JSON string into a ClaudeActivityEvent.
 * - tool_name === 'Agent' with tool_input.subagent_type (string) → agent_spawn
 * - tool_name === 'Agent' without subagent_type → unknown
 * - any other valid tool event → tool_use
 * - valid JSON but missing tool_name or session_id → null
 * - invalid JSON → null
 */
export function parseClaudeHook(raw: string): ClaudeActivityEvent | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) return null;

  const obj = parsed as Record<string, unknown>;
  const tool_name = obj['tool_name'];
  const session_id = obj['session_id'];

  if (typeof tool_name !== 'string' || typeof session_id !== 'string') return null;

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
    const subagent_type = tool_input['subagent_type'];
    if (typeof subagent_type === 'string') {
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
