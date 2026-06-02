import { describe, it, expect } from 'vitest';
import { matchesGlob, routeNotification } from './notification-routing.js';
import type { NotificationRule } from './config.js';
import type { DisplayIntent } from './dispatcher.js';

let _seq = 0;

// Build a desktop-notification DisplayIntent. content mimics n.summary || n.appName.
function desktopIntent(content: string): DisplayIntent {
  return {
    id: `intent-${++_seq}`,
    source: 'desktop-notification',
    priority: 50,
    content,
    durationMs: 5000,
    expiresAt: Date.now() + 5000,
  };
}

function sourceIntent(source: DisplayIntent['source'], content = 'test'): DisplayIntent {
  return {
    id: `intent-${++_seq}`,
    source,
    priority: 50,
    content,
    durationMs: 3000,
    expiresAt: Date.now() + 3000,
  };
}

describe('matchesGlob', () => {
  it('* matches everything', () => {
    expect(matchesGlob('*', '')).toBe(true);
    expect(matchesGlob('*', 'anything')).toBe(true);
    expect(matchesGlob('*', 'Slack')).toBe(true);
  });

  it('? matches exactly one character', () => {
    expect(matchesGlob('?', 'a')).toBe(true);
    expect(matchesGlob('?', '')).toBe(false);
    expect(matchesGlob('?', 'ab')).toBe(false);
    expect(matchesGlob('a?c', 'abc')).toBe(true);
    expect(matchesGlob('a?c', 'ac')).toBe(false);
  });

  it('exact match', () => {
    expect(matchesGlob('Slack', 'Slack')).toBe(true);
    expect(matchesGlob('slack', 'Slack')).toBe(false);
    expect(matchesGlob('Slack', 'slack')).toBe(false);
  });

  it('no match', () => {
    expect(matchesGlob('Slack', 'Discord')).toBe(false);
    expect(matchesGlob('abc', '')).toBe(false);
    expect(matchesGlob('', 'a')).toBe(false);
  });

  it('empty pattern matches empty string', () => {
    expect(matchesGlob('', '')).toBe(true);
  });

  it('prefix glob: Slack*', () => {
    expect(matchesGlob('Slack*', 'Slack')).toBe(true);
    expect(matchesGlob('Slack*', 'SlackBot')).toBe(true);
    expect(matchesGlob('Slack*', 'Discord')).toBe(false);
  });

  it('infix glob: *daemon*', () => {
    expect(matchesGlob('*daemon*', 'dark-matrix-daemon')).toBe(true);
    expect(matchesGlob('*daemon*', 'daemon')).toBe(true);
    expect(matchesGlob('*daemon*', 'daemonize-it')).toBe(true);
    expect(matchesGlob('*daemon*', 'Slack')).toBe(false);
  });

  it('multiple wildcards', () => {
    expect(matchesGlob('*a*b*', 'xaxbx')).toBe(true);
    expect(matchesGlob('*a*b*', 'ab')).toBe(true);
    expect(matchesGlob('*a*b*', 'ba')).toBe(false);
  });
});

describe('routeNotification', () => {
  it('returns suppress+replace when no rules match', () => {
    const rules: NotificationRule[] = [{ app_name_glob: 'Slack', animation: 'suppress' }];
    expect(routeNotification(desktopIntent('Discord'), rules)).toEqual({ action: 'suppress', composite: 'replace' });
  });

  it('returns suppress+replace when rules array is empty', () => {
    expect(routeNotification(desktopIntent('Slack'), [])).toEqual({ action: 'suppress', composite: 'replace' });
  });

  it('first-match-wins', () => {
    const rules: NotificationRule[] = [
      { app_name_glob: 'Slack', animation: 'suppress' },
      { app_name_glob: 'Slack', animation: 'text' },
    ];
    expect(routeNotification(desktopIntent('Slack'), rules)).toEqual({ action: 'suppress', composite: 'replace' });
  });

  it('animation=suppress returns { action: "suppress" }', () => {
    const rules: NotificationRule[] = [{ app_name_glob: '*', animation: 'suppress' }];
    expect(routeNotification(desktopIntent('anything'), rules)).toEqual({ action: 'suppress', composite: 'replace' });
  });

  it('animation=text returns { action: "text" }', () => {
    const rules: NotificationRule[] = [{ app_name_glob: 'Slack', animation: 'text' }];
    expect(routeNotification(desktopIntent('Slack'), rules)).toEqual({ action: 'text', composite: 'replace' });
  });

  it('animation=design includes asset_path via assetPath', () => {
    const rules: NotificationRule[] = [
      { app_name_glob: 'Slack', animation: 'design', asset_path: '/home/user/alert.dmx.json' },
    ];
    expect(routeNotification(desktopIntent('Slack'), rules)).toEqual({
      action: 'design',
      assetPath: '/home/user/alert.dmx.json',
      composite: 'replace',
    });
  });

  it('animation=design without asset_path omits assetPath key', () => {
    const rules: NotificationRule[] = [{ app_name_glob: 'Slack', animation: 'design' }];
    const result = routeNotification(desktopIntent('Slack'), rules);
    expect(result.action).toBe('design');
    expect('assetPath' in result).toBe(false);
  });

  it('omitted urgency on rule matches any notification urgency', () => {
    const rules: NotificationRule[] = [{ app_name_glob: '*', animation: 'suppress' }];
    expect(routeNotification(desktopIntent('App'), rules)).toEqual({ action: 'suppress', composite: 'replace' });
  });

  it('urgency=any on rule matches any notification urgency', () => {
    const rules: NotificationRule[] = [{ app_name_glob: '*', urgency: 'any', animation: 'suppress' }];
    expect(routeNotification(desktopIntent('App'), rules)).toEqual({ action: 'suppress', composite: 'replace' });
  });

  it('urgency filter skips non-matching urgency (TODO: always skips until dbus urgency is parsed)', () => {
    // DesktopNotification does not yet expose urgency — all urgency-filtered rules
    // are treated as non-matching, so the fallback rule always wins.
    const rules: NotificationRule[] = [
      { app_name_glob: '*', urgency: 'critical', animation: 'suppress' },
      { app_name_glob: '*', animation: 'text' },
    ];
    expect(routeNotification(desktopIntent('App'), rules)).toEqual({ action: 'text', composite: 'replace' });
  });

  it('glob pattern matching in rules', () => {
    const rules: NotificationRule[] = [
      { app_name_glob: 'Slack*', animation: 'suppress' },
      { app_name_glob: '*', animation: 'text' },
    ];
    expect(routeNotification(desktopIntent('SlackBot'), rules)).toEqual({ action: 'suppress', composite: 'replace' });
    expect(routeNotification(desktopIntent('Discord'), rules)).toEqual({ action: 'text', composite: 'replace' });
  });

  // --- New tests for generalized routing ---

  it('source filter: matches when source matches', () => {
    const rules: NotificationRule[] = [
      { source: 'ec-switch', animation: 'suppress' },
    ];
    expect(routeNotification(sourceIntent('ec-switch', 'CAM ON'), rules)).toEqual({ action: 'suppress', composite: 'replace' });
  });

  it('source filter: skips when source does not match', () => {
    // Fallback rule proves the source-filtered rule was skipped, not just absent.
    const rules: NotificationRule[] = [
      { source: 'ec-switch', animation: 'suppress' },
      { animation: 'text' },
    ];
    expect(routeNotification(sourceIntent('vm', 'VM UP foo'), rules)).toEqual({ action: 'text', composite: 'replace' });
  });

  it('app_name_glob skips non-desktop-notification sources', () => {
    // Fallback rule proves the glob rule was skipped for non-desktop sources.
    const rules: NotificationRule[] = [
      { app_name_glob: '*', animation: 'suppress' },
      { animation: 'text' },
    ];
    expect(routeNotification(sourceIntent('vm', 'VM UP foo'), rules)).toEqual({ action: 'text', composite: 'replace' });
    expect(routeNotification(sourceIntent('ec-switch', 'CAM ON'), rules)).toEqual({ action: 'text', composite: 'replace' });
  });

  it('content_glob matches against intent.content', () => {
    const rules: NotificationRule[] = [
      { content_glob: 'CAM*', animation: 'suppress' },
    ];
    expect(routeNotification(sourceIntent('ec-switch', 'CAM ON'), rules)).toEqual({ action: 'suppress', composite: 'replace' });
    expect(routeNotification(sourceIntent('ec-switch', 'MIC OFF'), rules)).toEqual({ action: 'suppress', composite: 'replace' });
  });

  it('content_glob works across sources', () => {
    const rules: NotificationRule[] = [
      { content_glob: '*VM*', animation: 'text' },
    ];
    expect(routeNotification(sourceIntent('vm', 'VM UP mybox'), rules)).toEqual({ action: 'text', composite: 'replace' });
    expect(routeNotification(desktopIntent('VM UP mybox'), rules)).toEqual({ action: 'text', composite: 'replace' });
  });

  it('composite field is returned from rule', () => {
    const rules: NotificationRule[] = [
      { source: 'claude', animation: 'text', composite: 'overlay' },
    ];
    expect(routeNotification(sourceIntent('claude', 'TOOL bash'), rules)).toEqual({ action: 'text', composite: 'overlay' });
  });

  it('composite defaults to replace when not set on rule', () => {
    const rules: NotificationRule[] = [
      { source: 'manual', animation: 'suppress' },
    ];
    const result = routeNotification(sourceIntent('manual'), rules);
    expect(result.composite).toBe('replace');
  });

  it('duration_ms_override is returned when set', () => {
    const rules: NotificationRule[] = [
      { source: 'vm', animation: 'text', duration_ms_override: 12000 },
    ];
    expect(routeNotification(sourceIntent('vm', 'VM DN mybox'), rules)).toEqual({
      action: 'text',
      composite: 'replace',
      durationMs: 12000,
    });
  });

  it('duration_ms_override absent when not set', () => {
    const rules: NotificationRule[] = [{ animation: 'suppress' }];
    const result = routeNotification(sourceIntent('ec-switch'), rules);
    expect('durationMs' in result).toBe(false);
  });

  it('ec-switch source routing', () => {
    const rules: NotificationRule[] = [
      { source: 'ec-switch', content_glob: 'CAM*', animation: 'design', asset_path: 'cam.dmx.json', composite: 'overlay', duration_ms_override: 3000 },
      { source: 'ec-switch', animation: 'text' },
    ];
    expect(routeNotification(sourceIntent('ec-switch', 'CAM ON'), rules)).toEqual({
      action: 'design',
      assetPath: 'cam.dmx.json',
      composite: 'overlay',
      durationMs: 3000,
    });
    expect(routeNotification(sourceIntent('ec-switch', 'MIC OFF'), rules)).toEqual({ action: 'text', composite: 'replace' });
  });

  it('default route with no rules returns suppress+replace', () => {
    expect(routeNotification(sourceIntent('ec-switch', 'CAM ON'), [])).toEqual({ action: 'suppress', composite: 'replace' });
    expect(routeNotification(desktopIntent('anything'), [])).toEqual({ action: 'suppress', composite: 'replace' });
  });

  it('noMatchAction=text returns text when no rule matches', () => {
    expect(routeNotification(desktopIntent('anything'), [], 'text')).toEqual({ action: 'text', composite: 'replace' });
  });

  it('noMatchAction=text does not override an explicit suppress rule', () => {
    const rules: NotificationRule[] = [{ app_name_glob: '*', animation: 'suppress' }];
    expect(routeNotification(desktopIntent('anything'), rules, 'text')).toEqual({ action: 'suppress', composite: 'replace' });
  });
});
