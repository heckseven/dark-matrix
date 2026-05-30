import { describe, it, expect } from 'vitest';
import { parseLocation, pathForMode, routeConfigTab } from './router.js';

describe('router — parseLocation', () => {
  it('root is the mode-select screen (not a known route)', () => {
    expect(parseLocation('/')).toEqual({ mode: null, configTab: null, known: false });
  });

  it('parses a plain mode path', () => {
    expect(parseLocation('/cast')).toEqual({ mode: 'cast', configTab: null, known: true });
    expect(parseLocation('/hud')).toEqual({ mode: 'hud', configTab: null, known: true });
  });

  it('parses /config with and without a tab', () => {
    expect(parseLocation('/config')).toEqual({ mode: 'config', configTab: null, known: true });
    expect(parseLocation('/config/integrations')).toEqual({ mode: 'config', configTab: 'integrations', known: true });
  });

  it('ignores an unknown config tab but keeps config mode', () => {
    expect(parseLocation('/config/bogus')).toEqual({ mode: 'config', configTab: null, known: true });
  });

  it('ignores trailing segments on non-config modes', () => {
    expect(parseLocation('/cast/whatever')).toEqual({ mode: 'cast', configTab: null, known: true });
  });

  it('treats unknown top-level paths as not-known', () => {
    expect(parseLocation('/bogus')).toEqual({ mode: null, configTab: null, known: false });
  });

  it('treats the empty string as not-known', () => {
    expect(parseLocation('')).toEqual({ mode: null, configTab: null, known: false });
  });
});

describe('router — pathForMode', () => {
  it('maps null to root', () => {
    expect(pathForMode(null)).toBe('/');
  });
  it('maps a mode to its path', () => {
    expect(pathForMode('cast')).toBe('/cast');
    expect(pathForMode('config')).toBe('/config');
  });
  it('includes the config tab only for config mode', () => {
    expect(pathForMode('config', 'integrations')).toBe('/config/integrations');
    expect(pathForMode('cast', 'integrations')).toBe('/cast');
  });
  it('config with an explicit null tab returns /config', () => {
    expect(pathForMode('config', null)).toBe('/config');
  });
});

describe('router — round-trips and routeConfigTab', () => {
  it('pathForMode/parseLocation round-trip for canonical paths', () => {
    for (const p of ['/cast', '/hud', '/config', '/config/integrations']) {
      const r = parseLocation(p);
      expect(pathForMode(r.mode, r.configTab)).toBe(p);
    }
  });
  it('routeConfigTab extracts the tab or null', () => {
    expect(routeConfigTab('/config/integrations')).toBe('integrations');
    expect(routeConfigTab('/config')).toBeNull();
    expect(routeConfigTab('/cast')).toBeNull();
  });
});
