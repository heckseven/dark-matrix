import { describe, expect, it } from 'vitest';
import { isClaudeActive, parseClaudeHook } from './claude-source.js';

describe('parseClaudeHook', () => {
  it('returns tool_use for a Bash tool payload', () => {
    const raw = JSON.stringify({
      tool_name: 'Bash',
      session_id: 'abc',
      tool_input: { command: 'ls' },
      tool_response: { output: '' },
    });
    expect(parseClaudeHook(raw)).toEqual({ type: 'tool_use', tool: 'Bash', session_id: 'abc' });
  });

  it('returns agent_spawn when tool_name is Agent and subagent_type is set', () => {
    const raw = JSON.stringify({
      tool_name: 'Agent',
      session_id: 'abc',
      tool_input: { subagent_type: 'neo' },
      tool_response: {},
    });
    expect(parseClaudeHook(raw)).toEqual({
      type: 'agent_spawn',
      subagent_type: 'neo',
      session_id: 'abc',
    });
  });

  it('returns unknown when tool_name is Agent but subagent_type is missing', () => {
    const raw = JSON.stringify({
      tool_name: 'Agent',
      session_id: 'abc',
      tool_input: {},
      tool_response: {},
    });
    const result = parseClaudeHook(raw);
    expect(result).not.toBeNull();
    expect(result?.type).toBe('unknown');
    if (result?.type === 'unknown') {
      expect(result.raw.tool_name).toBe('Agent');
      expect(result.raw.session_id).toBe('abc');
    }
  });

  it('returns null for invalid JSON', () => {
    expect(parseClaudeHook('not json {')).toBeNull();
  });

  it('returns null for JSON missing tool_name', () => {
    const raw = JSON.stringify({ session_id: 'abc', tool_input: {}, tool_response: {} });
    expect(parseClaudeHook(raw)).toBeNull();
  });

  it('returns null for JSON missing session_id', () => {
    const raw = JSON.stringify({ tool_name: 'Bash', tool_input: {}, tool_response: {} });
    expect(parseClaudeHook(raw)).toBeNull();
  });

  it('returns null for oversized payload (> 65536 bytes)', () => {
    expect(parseClaudeHook('x'.repeat(65537))).toBeNull();
  });

  it('returns null for tool_name exceeding 256 chars', () => {
    const raw = JSON.stringify({
      tool_name: 'A'.repeat(257),
      session_id: 'abc',
      tool_input: {},
      tool_response: {},
    });
    expect(parseClaudeHook(raw)).toBeNull();
  });
});

describe('isClaudeActive', () => {
  it('returns true when lastEventAt is within window', () => {
    expect(isClaudeActive(Date.now() - 1000, 30_000)).toBe(true);
  });

  it('returns false when lastEventAt is outside window', () => {
    expect(isClaudeActive(Date.now() - 60_000, 30_000)).toBe(false);
  });

  it('returns false when lastEventAt is null', () => {
    expect(isClaudeActive(null, 30_000)).toBe(false);
  });
});
