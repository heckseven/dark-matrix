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
  it('returns scroll+replace when no rules match', () => {
    const rules: NotificationRule[] = [{ app_name_glob: 'Slack', animation: 'none' }];
    expect(routeNotification(desktopIntent('Discord'), rules)).toEqual({ action: 'scroll', composite: 'replace' });
  });

  it('returns scroll+replace when rules array is empty', () => {
    expect(routeNotification(desktopIntent('Slack'), [])).toEqual({ action: 'scroll', composite: 'replace' });
  });

  it('first-match-wins', () => {
    const rules: NotificationRule[] = [
      { app_name_glob: 'Slack', animation: 'none' },
      { app_name_glob: 'Slack', animation: 'scroll' },
    ];
    expect(routeNotification(desktopIntent('Slack'), rules)).toEqual({ action: 'none', composite: 'replace' });
  });

  it('animation=none returns { action: "none" }', () => {
    const rules: NotificationRule[] = [{ app_name_glob: '*', animation: 'none' }];
    expect(routeNotification(desktopIntent('anything'), rules)).toEqual({ action: 'none', composite: 'replace' });
  });

  it('animation=scroll returns { action: "scroll" }', () => {
    const rules: NotificationRule[] = [{ app_name_glob: 'Slack', animation: 'scroll' }];
    expect(routeNotification(desktopIntent('Slack'), rules)).toEqual({ action: 'scroll', composite: 'replace' });
  });

  it('animation=dmx includes dmx_path via assetPath', () => {
    const rules: NotificationRule[] = [
      { app_name_glob: 'Slack', animation: 'dmx', asset_path: '/home/user/alert.dmx.json' },
    ];
    expect(routeNotification(desktopIntent('Slack'), rules)).toEqual({
      action: 'dmx',
      assetPath: '/home/user/alert.dmx.json',
      composite: 'replace',
    });
  });

  it('animation=dmx without asset_path omits assetPath key', () => {
    const rules: NotificationRule[] = [{ app_name_glob: 'Slack', animation: 'dmx' }];
    const result = routeNotification(desktopIntent('Slack'), rules);
    expect(result.action).toBe('dmx');
    expect('assetPath' in result).toBe(false);
  });

  it('omitted urgency on rule matches any notification urgency', () => {
    const rules: NotificationRule[] = [{ app_name_glob: '*', animation: 'none' }];
    expect(routeNotification(desktopIntent('App'), rules)).toEqual({ action: 'none', composite: 'replace' });
  });

  it('urgency=any on rule matches any notification urgency', () => {
    const rules: NotificationRule[] = [{ app_name_glob: '*', urgency: 'any', animation: 'none' }];
    expect(routeNotification(desktopIntent('App'), rules)).toEqual({ action: 'none', composite: 'replace' });
  });

  it('urgency filter skips non-matching urgency (TODO: always skips until dbus urgency is parsed)', () => {
    // DesktopNotification does not yet expose urgency — all urgency-filtered rules
    // are treated as non-matching, so the fallback rule always wins.
    const rules: NotificationRule[] = [
      { app_name_glob: '*', urgency: 'critical', animation: 'none' },
      { app_name_glob: '*', animation: 'scroll' },
    ];
    expect(routeNotification(desktopIntent('App'), rules)).toEqual({ action: 'scroll', composite: 'replace' });
  });

  it('glob pattern matching in rules', () => {
    const rules: NotificationRule[] = [
      { app_name_glob: 'Slack*', animation: 'none' },
      { app_name_glob: '*', animation: 'scroll' },
    ];
    expect(routeNotification(desktopIntent('SlackBot'), rules)).toEqual({ action: 'none', composite: 'replace' });
    expect(routeNotification(desktopIntent('Discord'), rules)).toEqual({ action: 'scroll', composite: 'replace' });
  });

  // --- New tests for generalized routing ---

  it('source filter: matches when source matches', () => {
    const rules: NotificationRule[] = [
      { source: 'ec-switch', animation: 'none' },
    ];
    expect(routeNotification(sourceIntent('ec-switch', 'CAM ON'), rules)).toEqual({ action: 'none', composite: 'replace' });
  });

  it('source filter: skips when source does not match', () => {
    const rules: NotificationRule[] = [
      { source: 'ec-switch', animation: 'none' },
    ];
    expect(routeNotification(sourceIntent('vm', 'VM UP foo'), rules)).toEqual({ action: 'scroll', composite: 'replace' });
  });

  it('app_name_glob skips non-desktop-notification sources', () => {
    const rules: NotificationRule[] = [
      { app_name_glob: '*', animation: 'none' },
    ];
    // vm intent — app_name_glob should not match non-desktop-notification
    expect(routeNotification(sourceIntent('vm', 'VM UP foo'), rules)).toEqual({ action: 'scroll', composite: 'replace' });
    expect(routeNotification(sourceIntent('ec-switch', 'CAM ON'), rules)).toEqual({ action: 'scroll', composite: 'replace' });
  });

  it('content_glob matches against intent.content', () => {
    const rules: NotificationRule[] = [
      { content_glob: 'CAM*', animation: 'none' },
    ];
    expect(routeNotification(sourceIntent('ec-switch', 'CAM ON'), rules)).toEqual({ action: 'none', composite: 'replace' });
    expect(routeNotification(sourceIntent('ec-switch', 'MIC OFF'), rules)).toEqual({ action: 'scroll', composite: 'replace' });
  });

  it('content_glob works across sources', () => {
    const rules: NotificationRule[] = [
      { content_glob: '*VM*', animation: 'scroll' },
    ];
    expect(routeNotification(sourceIntent('vm', 'VM UP mybox'), rules)).toEqual({ action: 'scroll', composite: 'replace' });
    expect(routeNotification(desktopIntent('VM UP mybox'), rules)).toEqual({ action: 'scroll', composite: 'replace' });
  });

  it('composite field is returned from rule', () => {
    const rules: NotificationRule[] = [
      { source: 'claude', animation: 'scroll', composite: 'overlay' },
    ];
    expect(routeNotification(sourceIntent('claude', 'TOOL bash'), rules)).toEqual({ action: 'scroll', composite: 'overlay' });
  });

  it('composite defaults to replace when not set on rule', () => {
    const rules: NotificationRule[] = [
      { source: 'manual', animation: 'none' },
    ];
    const result = routeNotification(sourceIntent('manual'), rules);
    expect(result.composite).toBe('replace');
  });

  it('duration_ms_override is returned when set', () => {
    const rules: NotificationRule[] = [
      { source: 'vm', animation: 'scroll', duration_ms_override: 12000 },
    ];
    expect(routeNotification(sourceIntent('vm', 'VM DN mybox'), rules)).toEqual({
      action: 'scroll',
      composite: 'replace',
      durationMs: 12000,
    });
  });

  it('duration_ms_override absent when not set', () => {
    const rules: NotificationRule[] = [{ animation: 'none' }];
    const result = routeNotification(sourceIntent('ec-switch'), rules);
    expect('durationMs' in result).toBe(false);
  });

  it('ec-switch source routing', () => {
    const rules: NotificationRule[] = [
      { source: 'ec-switch', content_glob: 'CAM*', animation: 'image', asset_path: '/assets/cam.dmx.json', composite: 'overlay', duration_ms_override: 3000 },
      { source: 'ec-switch', animation: 'scroll' },
    ];
    expect(routeNotification(sourceIntent('ec-switch', 'CAM ON'), rules)).toEqual({
      action: 'image',
      assetPath: '/assets/cam.dmx.json',
      composite: 'overlay',
      durationMs: 3000,
    });
    expect(routeNotification(sourceIntent('ec-switch', 'MIC OFF'), rules)).toEqual({ action: 'scroll', composite: 'replace' });
  });

  it('default route with no rules returns scroll+replace', () => {
    expect(routeNotification(sourceIntent('ec-switch', 'CAM ON'), [])).toEqual({ action: 'scroll', composite: 'replace' });
    expect(routeNotification(desktopIntent('anything'), [])).toEqual({ action: 'scroll', composite: 'replace' });
  });
});
