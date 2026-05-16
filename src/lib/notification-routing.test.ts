import { describe, it, expect } from 'vitest';
import { matchesGlob, routeNotification } from './notification-routing.js';
import type { NotificationRule } from './config.js';
import type { DesktopNotification } from './dbus-notifications.js';

// Minimal helper to build a DesktopNotification
function notif(appName: string, urgency?: 'low' | 'normal' | 'critical'): DesktopNotification & { urgency?: 'low' | 'normal' | 'critical' } {
  return { appName, summary: 'test', body: '', ...(urgency !== undefined ? { urgency } : {}) };
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
  it('returns scroll when no rules match', () => {
    const rules: NotificationRule[] = [{ app_name_glob: 'Slack', animation: 'none' }];
    expect(routeNotification(notif('Discord'), rules)).toEqual({ action: 'scroll' });
  });

  it('returns scroll when rules array is empty', () => {
    expect(routeNotification(notif('Slack'), [])).toEqual({ action: 'scroll' });
  });

  it('first-match-wins', () => {
    const rules: NotificationRule[] = [
      { app_name_glob: 'Slack', animation: 'none' },
      { app_name_glob: 'Slack', animation: 'scroll' },
    ];
    expect(routeNotification(notif('Slack'), rules)).toEqual({ action: 'none' });
  });

  it('animation=none returns { action: "none" }', () => {
    const rules: NotificationRule[] = [{ app_name_glob: '*', animation: 'none' }];
    expect(routeNotification(notif('anything'), rules)).toEqual({ action: 'none' });
  });

  it('animation=scroll returns { action: "scroll" }', () => {
    const rules: NotificationRule[] = [{ app_name_glob: 'Slack', animation: 'scroll' }];
    expect(routeNotification(notif('Slack'), rules)).toEqual({ action: 'scroll' });
  });

  it('animation=dmx includes dmx_path', () => {
    const rules: NotificationRule[] = [
      { app_name_glob: 'Slack', animation: 'dmx', dmx_path: '/home/user/alert.dmx.json' },
    ];
    expect(routeNotification(notif('Slack'), rules)).toEqual({
      action: 'dmx',
      dmx_path: '/home/user/alert.dmx.json',
    });
  });

  it('animation=dmx without dmx_path omits dmx_path key', () => {
    const rules: NotificationRule[] = [{ app_name_glob: 'Slack', animation: 'dmx' }];
    const result = routeNotification(notif('Slack'), rules);
    expect(result.action).toBe('dmx');
    expect('dmx_path' in result).toBe(false);
  });

  it('omitted urgency on rule matches any notification urgency', () => {
    const rules: NotificationRule[] = [{ app_name_glob: '*', animation: 'none' }];
    expect(routeNotification(notif('App', 'low'), rules)).toEqual({ action: 'none' });
    expect(routeNotification(notif('App', 'critical'), rules)).toEqual({ action: 'none' });
    expect(routeNotification(notif('App'), rules)).toEqual({ action: 'none' });
  });

  it('urgency=any on rule matches any notification urgency', () => {
    const rules: NotificationRule[] = [{ app_name_glob: '*', urgency: 'any', animation: 'none' }];
    expect(routeNotification(notif('App', 'low'), rules)).toEqual({ action: 'none' });
    expect(routeNotification(notif('App', 'critical'), rules)).toEqual({ action: 'none' });
  });

  it('urgency filter skips non-matching urgency', () => {
    const rules: NotificationRule[] = [
      { app_name_glob: '*', urgency: 'critical', animation: 'none' },
      { app_name_glob: '*', animation: 'scroll' },
    ];
    // critical urgency matches first rule
    expect(routeNotification(notif('App', 'critical'), rules)).toEqual({ action: 'none' });
    // low urgency skips first rule, matches second
    expect(routeNotification(notif('App', 'low'), rules)).toEqual({ action: 'scroll' });
    // no urgency on notification skips critical-filtered rule, matches second
    expect(routeNotification(notif('App'), rules)).toEqual({ action: 'scroll' });
  });

  it('glob pattern matching in rules', () => {
    const rules: NotificationRule[] = [
      { app_name_glob: 'Slack*', animation: 'none' },
      { app_name_glob: '*', animation: 'scroll' },
    ];
    expect(routeNotification(notif('SlackBot'), rules)).toEqual({ action: 'none' });
    expect(routeNotification(notif('Discord'), rules)).toEqual({ action: 'scroll' });
  });
});
