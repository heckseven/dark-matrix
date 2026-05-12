import { describe, it, expect } from 'vitest';
import { parseDbusMonitorLine, makeParseState } from './dbus-notifications.js';

const NOTIFY_HEADER = 'method call time=1234567890.123 sender=:1.1 -> destination=org.freedesktop.Notifications serial=1 path=/org/freedesktop/Notifications; interface=org.freedesktop.Notifications; member=Notify';

function runLines(lines: string[]) {
  const state = makeParseState();
  const results = [];
  for (const line of lines) {
    const n = parseDbusMonitorLine(line, state);
    if (n) results.push(n);
  }
  return { results, state };
}

describe('parseDbusMonitorLine', () => {
  it('sets inNotify and resets counters on member=Notify', () => {
    const state = makeParseState();
    parseDbusMonitorLine(NOTIFY_HEADER, state);
    expect(state.inNotify).toBe(true);
    expect(state.argIdx).toBe(0);
    expect(state.appName).toBe('');
    expect(state.summary).toBe('');
  });

  it('parses a full notify sequence', () => {
    const { results } = runLines([
      NOTIFY_HEADER,
      '   string "notify-send"',
      '   uint32 0',
      '   string "dialog-information"',
      '   string "Test Summary"',
      '   string "Test body"',
    ]);
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({ appName: 'notify-send', summary: 'Test Summary', body: 'Test body' });
  });

  it('handles empty icon and body strings', () => {
    const { results } = runLines([
      NOTIFY_HEADER,
      '   string "myapp"',
      '   uint32 0',
      '   string ""',
      '   string "Summary only"',
      '   string ""',
    ]);
    expect(results[0]).toEqual({ appName: 'myapp', summary: 'Summary only', body: '' });
  });

  it('clears inNotify after body arg', () => {
    const { state } = runLines([
      NOTIFY_HEADER,
      '   string "app"',
      '   uint32 0',
      '   string ""',
      '   string "Title"',
      '   string "Body"',
    ]);
    expect(state.inNotify).toBe(false);
  });

  it('clears inNotify on array line before body', () => {
    const { state, results } = runLines([
      NOTIFY_HEADER,
      '   string "app"',
      '   uint32 0',
      '   string ""',
      '   string "Title"',
      '   array [',
    ]);
    expect(state.inNotify).toBe(false);
    expect(results).toHaveLength(0);
  });

  it('ignores non-notify lines when not in context', () => {
    const state = makeParseState();
    const n = parseDbusMonitorLine('   string "random"', state);
    expect(n).toBeNull();
    expect(state.argIdx).toBe(0);
  });

  it('resets correctly when a new Notify arrives before the previous completes', () => {
    const state = makeParseState();
    parseDbusMonitorLine(NOTIFY_HEADER, state);
    parseDbusMonitorLine('   string "first-app"', state);
    // Second notification arrives mid-stream
    parseDbusMonitorLine(NOTIFY_HEADER, state);
    expect(state.appName).toBe('');
    expect(state.argIdx).toBe(0);
  });

  it('parses two sequential notifications', () => {
    const { results } = runLines([
      NOTIFY_HEADER,
      '   string "app1"',
      '   uint32 0',
      '   string ""',
      '   string "First"',
      '   string "Body1"',
      NOTIFY_HEADER,
      '   string "app2"',
      '   uint32 0',
      '   string ""',
      '   string "Second"',
      '   string "Body2"',
    ]);
    expect(results).toHaveLength(2);
    expect(results[0]?.summary).toBe('First');
    expect(results[1]?.summary).toBe('Second');
  });

  it('preserves spaces inside string values', () => {
    const { results } = runLines([
      NOTIFY_HEADER,
      '   string "My Application"',
      '   uint32 0',
      '   string ""',
      '   string "New message from Alice Smith"',
      '   string "Hello there"',
    ]);
    expect(results[0]?.appName).toBe('My Application');
    expect(results[0]?.summary).toBe('New message from Alice Smith');
  });
});
