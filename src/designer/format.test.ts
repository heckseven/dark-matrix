import { describe, it, expect } from 'vitest';
import {
  serializeProject,
  parseProject,
  frameToBase64,
  base64ToFrame,
  createBlankFrame,
  type DmxProject,
  type DmxFrame,
} from './format.js';

const HEIGHT = 34;

function makeFrames(width: number, count: number): DmxFrame[] {
  return Array.from({ length: count }, (_, i) => {
    const pixels = new Uint8Array(width * HEIGHT);
    // Fill with recognizable pattern so round-trip is meaningful
    for (let j = 0; j < pixels.length; j++) {
      pixels[j] = (i * 7 + j * 3) & 0xff;
    }
    return { delayMs: i * 100, pixels: frameToBase64(pixels) };
  });
}

describe('designer format', () => {
  it('round-trips a 10-frame gray 9×34 project', () => {
    const project: DmxProject = {
      format: 'dark-matrix',
      version: 1,
      width: 9,
      height: 34,
      mode: 'gray',
      loop: true,
      frames: makeFrames(9, 10),
    };
    const parsed = parseProject(serializeProject(project));
    expect(parsed.frames.length).toBe(10);
    for (let i = 0; i < 10; i++) {
      expect(parsed.frames[i]!.pixels).toBe(project.frames[i]!.pixels);
      expect(parsed.frames[i]!.delayMs).toBe(project.frames[i]!.delayMs);
    }
  });

  it('round-trips a dual 18×34 project', () => {
    const project: DmxProject = {
      format: 'dark-matrix',
      version: 1,
      width: 18,
      height: 34,
      mode: 'bw',
      loop: false,
      frames: makeFrames(18, 3),
    };
    const parsed = parseProject(serializeProject(project));
    expect(parsed.width).toBe(18);
    expect(parsed.frames.length).toBe(3);
    for (let i = 0; i < 3; i++) {
      expect(parsed.frames[i]!.pixels).toBe(project.frames[i]!.pixels);
    }
  });

  it('throws on missing format field', () => {
    const bad = { version: 1, width: 9, height: 34, mode: 'gray', loop: false, frames: makeFrames(9, 1) };
    expect(() => parseProject(JSON.stringify(bad))).toThrow();
  });

  it('throws on wrong version', () => {
    const bad = {
      format: 'dark-matrix',
      version: 2,
      width: 9,
      height: 34,
      mode: 'gray',
      loop: false,
      frames: makeFrames(9, 1),
    };
    expect(() => parseProject(JSON.stringify(bad))).toThrow();
  });

  it('throws on truncated base64 (wrong byte count)', () => {
    const truncated = Buffer.from(new Uint8Array(100)).toString('base64'); // 100 bytes, not 306
    const bad = {
      format: 'dark-matrix',
      version: 1,
      width: 9,
      height: 34,
      mode: 'gray',
      loop: false,
      frames: [{ delayMs: 0, pixels: truncated }],
    };
    expect(() => parseProject(JSON.stringify(bad))).toThrow();
  });

  it('throws on empty frames array', () => {
    const bad = {
      format: 'dark-matrix',
      version: 1,
      width: 9,
      height: 34,
      mode: 'gray',
      loop: false,
      frames: [],
    };
    expect(() => parseProject(JSON.stringify(bad))).toThrow();
  });

  it('frameToBase64 and base64ToFrame are inverses for a 306-byte array', () => {
    const original = new Uint8Array(306);
    for (let i = 0; i < 306; i++) original[i] = (i * 17 + 3) & 0xff;
    const b64 = frameToBase64(original);
    const recovered = base64ToFrame(b64, 306);
    expect(recovered).toEqual(original);
  });

  it('createBlankFrame(9) returns a 306-byte all-zero Uint8Array', () => {
    const frame = createBlankFrame(9);
    expect(frame).toBeInstanceOf(Uint8Array);
    expect(frame.length).toBe(306);
    expect(frame.every((b) => b === 0)).toBe(true);
  });
});
