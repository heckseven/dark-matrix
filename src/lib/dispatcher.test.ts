import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  Dispatcher, PRIORITY,
  ecSwitchIntent, vmIntent, claudeIntent,
  type DisplayIntent,
} from './dispatcher.js';

function intent(overrides: Partial<DisplayIntent> = {}): DisplayIntent {
  return {
    id: 'test-1',
    source: 'manual',
    priority: PRIORITY.NORMAL,
    content: 'hello',
    durationMs: 5000,
    expiresAt: Date.now() + 5000,
    ...overrides,
  };
}

describe('Dispatcher', () => {
  let d: Dispatcher;
  beforeEach(() => { d = new Dispatcher(); });

  it('returns null when queue is empty', () => {
    expect(d.current()).toBeNull();
  });

  it('higher priority intent is returned first', () => {
    d.push(intent({ id: 'low', priority: PRIORITY.LOW }));
    d.push(intent({ id: 'urgent', priority: PRIORITY.URGENT }));
    expect(d.current()?.id).toBe('urgent');
  });

  it('expired intents are not returned by current()', () => {
    d.push(intent({ id: 'expired', expiresAt: Date.now() - 1 }));
    expect(d.current()).toBeNull();
  });

  it('gc() removes expired intents', () => {
    d.push(intent({ id: 'expired', expiresAt: Date.now() - 1 }));
    d.push(intent({ id: 'live', expiresAt: Date.now() + 5000 }));
    d.gc();
    expect(d.current()?.id).toBe('live');
  });

  it('onChange fires when an intent is pushed', () => {
    const cb = vi.fn();
    d.onChange(cb);
    d.push(intent());
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0]![0]).not.toBeNull();
  });

  it('onChange fires after gc() clears the queue', () => {
    const cb = vi.fn();
    d.push(intent({ expiresAt: Date.now() - 1 }));
    d.onChange(cb);
    d.gc();
    expect(cb).toHaveBeenCalledWith(null);
  });

  it('disposer removes the onChange listener', () => {
    const cb = vi.fn();
    const dispose = d.onChange(cb);
    dispose();
    d.push(intent());
    expect(cb).not.toHaveBeenCalled();
  });
});

describe('intent factories', () => {
  it('ecSwitchIntent: mic off maps to URGENT priority', () => {
    const i = ecSwitchIntent({ type: 'mic', value: 0, prev: 1 });
    expect(i.source).toBe('ec-switch');
    expect(i.priority).toBe(PRIORITY.URGENT);
    expect(i.content).toContain('MIC OFF');
  });

  it('ecSwitchIntent: cam on maps correctly', () => {
    const i = ecSwitchIntent({ type: 'cam', value: 1, prev: 0 });
    expect(i.content).toContain('CAM ON');
  });

  it('vmIntent: started VM maps to HIGH priority', () => {
    const i = vmIntent({ running: ['myvm'], started: ['myvm'], stopped: [] });
    expect(i.source).toBe('vm');
    expect(i.priority).toBe(PRIORITY.HIGH);
    expect(i.content).toContain('myvm');
  });

  it('claudeIntent: tool_use maps to NORMAL priority', () => {
    const i = claudeIntent({ type: 'tool_use', tool: 'Bash', session_id: 'abc' });
    expect(i?.source).toBe('claude');
    expect(i?.priority).toBe(PRIORITY.NORMAL);
    expect(i?.content).toContain('Bash');
  });

  it('claudeIntent: agent_spawn maps label correctly', () => {
    const i = claudeIntent({ type: 'agent_spawn', subagent_type: 'neo', session_id: 'abc' });
    expect(i?.content).toContain('neo');
  });

  it('claudeIntent: unknown returns null', () => {
    const i = claudeIntent({
      type: 'unknown',
      raw: { tool_name: 'Agent', tool_input: {}, tool_response: {}, session_id: 'abc' },
    });
    expect(i).toBeNull();
  });
});
