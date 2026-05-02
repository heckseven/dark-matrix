import type { Frame } from '../lib/frame.js';
import { createFrame } from '../lib/frame.js';

export type ScrollFrame = [left: Frame, right: Frame];

export interface ScrollAnimation {
  [Symbol.asyncIterator](): AsyncIterator<ScrollFrame>;
  stop(): void;
}

export type ScrollSize = 'small' | 'medium' | 'large' | 'max';
export type ScrollStyle = 'normal' | 'bold' | 'outline' | 'thin' | 'tiny';

export type ScrollOptions = {
  text: string;
  fps?: number;
  pixelsPerTick?: number;
  loop?: boolean;
  size?: ScrollSize;
  style?: ScrollStyle;
};

// 5×7 bitmap font. Key = char code, value = 7 rows (one per row, MSB = leftmost pixel, 5 bits).
// Printable ASCII 32–126.
const FONT = new Map<number, number[]>([
  // 32 space
  [32, [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]],
  // 33 !
  [33, [0x04, 0x04, 0x04, 0x04, 0x00, 0x00, 0x04]],
  // 34 "
  [34, [0x0a, 0x0a, 0x00, 0x00, 0x00, 0x00, 0x00]],
  // 35 #
  [35, [0x0a, 0x0a, 0x1f, 0x0a, 0x1f, 0x0a, 0x0a]],
  // 36 $
  [36, [0x04, 0x0f, 0x14, 0x0e, 0x05, 0x1e, 0x04]],
  // 37 %
  [37, [0x18, 0x19, 0x02, 0x04, 0x08, 0x13, 0x03]],
  // 38 &
  [38, [0x0c, 0x12, 0x14, 0x08, 0x15, 0x12, 0x0d]],
  // 39 '
  [39, [0x04, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00]],
  // 40 (
  [40, [0x02, 0x04, 0x08, 0x08, 0x08, 0x04, 0x02]],
  // 41 )
  [41, [0x08, 0x04, 0x02, 0x02, 0x02, 0x04, 0x08]],
  // 42 *
  [42, [0x00, 0x04, 0x15, 0x0e, 0x15, 0x04, 0x00]],
  // 43 +
  [43, [0x00, 0x04, 0x04, 0x1f, 0x04, 0x04, 0x00]],
  // 44 ,
  [44, [0x00, 0x00, 0x00, 0x00, 0x06, 0x04, 0x08]],
  // 45 -
  [45, [0x00, 0x00, 0x00, 0x1f, 0x00, 0x00, 0x00]],
  // 46 .
  [46, [0x00, 0x00, 0x00, 0x00, 0x00, 0x06, 0x06]],
  // 47 /
  [47, [0x01, 0x02, 0x02, 0x04, 0x08, 0x08, 0x10]],
  // 48 0
  [48, [0x0e, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0e]],
  // 49 1
  [49, [0x04, 0x0c, 0x04, 0x04, 0x04, 0x04, 0x0e]],
  // 50 2
  [50, [0x0e, 0x11, 0x01, 0x02, 0x04, 0x08, 0x1f]],
  // 51 3
  [51, [0x1f, 0x02, 0x04, 0x02, 0x01, 0x11, 0x0e]],
  // 52 4
  [52, [0x02, 0x06, 0x0a, 0x12, 0x1f, 0x02, 0x02]],
  // 53 5
  [53, [0x1f, 0x10, 0x1e, 0x01, 0x01, 0x11, 0x0e]],
  // 54 6
  [54, [0x06, 0x08, 0x10, 0x1e, 0x11, 0x11, 0x0e]],
  // 55 7
  [55, [0x1f, 0x01, 0x02, 0x04, 0x04, 0x04, 0x04]],
  // 56 8
  [56, [0x0e, 0x11, 0x11, 0x0e, 0x11, 0x11, 0x0e]],
  // 57 9
  [57, [0x0e, 0x11, 0x11, 0x0f, 0x01, 0x02, 0x0c]],
  // 58 :
  [58, [0x00, 0x06, 0x06, 0x00, 0x06, 0x06, 0x00]],
  // 59 ;
  [59, [0x00, 0x06, 0x06, 0x00, 0x06, 0x04, 0x08]],
  // 60 <
  [60, [0x02, 0x04, 0x08, 0x10, 0x08, 0x04, 0x02]],
  // 61 =
  [61, [0x00, 0x00, 0x1f, 0x00, 0x1f, 0x00, 0x00]],
  // 62 >
  [62, [0x08, 0x04, 0x02, 0x01, 0x02, 0x04, 0x08]],
  // 63 ?
  [63, [0x0e, 0x11, 0x01, 0x02, 0x04, 0x00, 0x04]],
  // 64 @
  [64, [0x0e, 0x11, 0x01, 0x0d, 0x15, 0x15, 0x0e]],
  // 65 A
  [65, [0x04, 0x0a, 0x11, 0x11, 0x1f, 0x11, 0x11]],
  // 66 B
  [66, [0x1e, 0x11, 0x11, 0x1e, 0x11, 0x11, 0x1e]],
  // 67 C
  [67, [0x0e, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0e]],
  // 68 D
  [68, [0x1c, 0x12, 0x11, 0x11, 0x11, 0x12, 0x1c]],
  // 69 E
  [69, [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x1f]],
  // 70 F
  [70, [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x10]],
  // 71 G
  [71, [0x0e, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0f]],
  // 72 H
  [72, [0x11, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11]],
  // 73 I
  [73, [0x0e, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0e]],
  // 74 J
  [74, [0x07, 0x02, 0x02, 0x02, 0x02, 0x12, 0x0c]],
  // 75 K
  [75, [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11]],
  // 76 L
  [76, [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1f]],
  // 77 M
  [77, [0x11, 0x1b, 0x15, 0x15, 0x11, 0x11, 0x11]],
  // 78 N
  [78, [0x11, 0x11, 0x19, 0x15, 0x13, 0x11, 0x11]],
  // 79 O
  [79, [0x0e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e]],
  // 80 P
  [80, [0x1e, 0x11, 0x11, 0x1e, 0x10, 0x10, 0x10]],
  // 81 Q
  [81, [0x0e, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0d]],
  // 82 R
  [82, [0x1e, 0x11, 0x11, 0x1e, 0x14, 0x12, 0x11]],
  // 83 S
  [83, [0x0f, 0x10, 0x10, 0x0e, 0x01, 0x01, 0x1e]],
  // 84 T
  [84, [0x1f, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04]],
  // 85 U
  [85, [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e]],
  // 86 V
  [86, [0x11, 0x11, 0x11, 0x11, 0x11, 0x0a, 0x04]],
  // 87 W
  [87, [0x11, 0x11, 0x11, 0x15, 0x15, 0x1b, 0x11]],
  // 88 X
  [88, [0x11, 0x11, 0x0a, 0x04, 0x0a, 0x11, 0x11]],
  // 89 Y
  [89, [0x11, 0x11, 0x0a, 0x04, 0x04, 0x04, 0x04]],
  // 90 Z
  [90, [0x1f, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1f]],
  // 91 [
  [91, [0x0e, 0x08, 0x08, 0x08, 0x08, 0x08, 0x0e]],
  // 92 backslash
  [92, [0x10, 0x08, 0x08, 0x04, 0x02, 0x02, 0x01]],
  // 93 ]
  [93, [0x0e, 0x02, 0x02, 0x02, 0x02, 0x02, 0x0e]],
  // 94 ^
  [94, [0x04, 0x0a, 0x11, 0x00, 0x00, 0x00, 0x00]],
  // 95 _
  [95, [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x1f]],
  // 96 `
  [96, [0x08, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00]],
  // 97 a
  [97, [0x00, 0x00, 0x0e, 0x01, 0x0f, 0x11, 0x0f]],
  // 98 b
  [98, [0x10, 0x10, 0x1e, 0x11, 0x11, 0x11, 0x1e]],
  // 99 c
  [99, [0x00, 0x00, 0x0e, 0x10, 0x10, 0x10, 0x0e]],
  // 100 d
  [100, [0x01, 0x01, 0x0f, 0x11, 0x11, 0x11, 0x0f]],
  // 101 e
  [101, [0x00, 0x00, 0x0e, 0x11, 0x1f, 0x10, 0x0e]],
  // 102 f
  [102, [0x06, 0x09, 0x08, 0x1c, 0x08, 0x08, 0x08]],
  // 103 g
  [103, [0x00, 0x00, 0x0f, 0x11, 0x0f, 0x01, 0x0e]],
  // 104 h
  [104, [0x10, 0x10, 0x1e, 0x11, 0x11, 0x11, 0x11]],
  // 105 i
  [105, [0x00, 0x04, 0x00, 0x04, 0x04, 0x04, 0x0e]],
  // 106 j
  [106, [0x00, 0x02, 0x00, 0x02, 0x02, 0x12, 0x0c]],
  // 107 k
  [107, [0x10, 0x10, 0x12, 0x14, 0x18, 0x14, 0x12]],
  // 108 l
  [108, [0x0c, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0e]],
  // 109 m
  [109, [0x00, 0x00, 0x1a, 0x15, 0x15, 0x11, 0x11]],
  // 110 n
  [110, [0x00, 0x00, 0x1e, 0x11, 0x11, 0x11, 0x11]],
  // 111 o
  [111, [0x00, 0x00, 0x0e, 0x11, 0x11, 0x11, 0x0e]],
  // 112 p
  [112, [0x00, 0x00, 0x1e, 0x11, 0x1e, 0x10, 0x10]],
  // 113 q
  [113, [0x00, 0x00, 0x0f, 0x11, 0x0f, 0x01, 0x01]],
  // 114 r
  [114, [0x00, 0x00, 0x16, 0x19, 0x10, 0x10, 0x10]],
  // 115 s
  [115, [0x00, 0x00, 0x0e, 0x10, 0x0e, 0x01, 0x1e]],
  // 116 t
  [116, [0x08, 0x08, 0x1c, 0x08, 0x08, 0x09, 0x06]],
  // 117 u
  [117, [0x00, 0x00, 0x11, 0x11, 0x11, 0x11, 0x0f]],
  // 118 v
  [118, [0x00, 0x00, 0x11, 0x11, 0x11, 0x0a, 0x04]],
  // 119 w
  [119, [0x00, 0x00, 0x11, 0x15, 0x15, 0x15, 0x0a]],
  // 120 x
  [120, [0x00, 0x00, 0x11, 0x0a, 0x04, 0x0a, 0x11]],
  // 121 y
  [121, [0x00, 0x00, 0x11, 0x11, 0x0f, 0x01, 0x0e]],
  // 122 z
  [122, [0x00, 0x00, 0x1f, 0x02, 0x04, 0x08, 0x1f]],
  // 123 {
  [123, [0x03, 0x04, 0x04, 0x18, 0x04, 0x04, 0x03]],
  // 124 |
  [124, [0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04]],
  // 125 }
  [125, [0x18, 0x04, 0x04, 0x03, 0x04, 0x04, 0x18]],
  // 126 ~
  [126, [0x00, 0x08, 0x15, 0x02, 0x00, 0x00, 0x00]],
]);

// 3×5 tiny font. Key = char code, value = 5 rows (3 bits each, MSB = leftmost).
const TINY_FONT = new Map<number, number[]>([
  [32,  [0,0,0,0,0]],   // space
  [33,  [2,2,2,0,2]],   // !
  [39,  [2,2,0,0,0]],   // '
  [40,  [1,2,2,2,1]],   // (
  [41,  [4,2,2,2,4]],   // )
  [42,  [0,5,2,5,0]],   // *
  [43,  [0,2,7,2,0]],   // +
  [44,  [0,0,0,2,4]],   // ,
  [45,  [0,0,7,0,0]],   // -
  [46,  [0,0,0,0,2]],   // .
  [47,  [1,1,2,4,4]],   // /
  [48,  [3,5,5,5,6]],   // 0
  [49,  [2,6,2,2,7]],   // 1
  [50,  [6,1,2,4,7]],   // 2
  [51,  [6,1,3,1,6]],   // 3
  [52,  [5,5,7,1,1]],   // 4
  [53,  [7,4,6,1,6]],   // 5
  [54,  [3,4,6,5,2]],   // 6
  [55,  [7,1,2,2,2]],   // 7
  [56,  [2,5,2,5,2]],   // 8
  [57,  [2,5,3,1,6]],   // 9
  [58,  [0,2,0,2,0]],   // :
  [59,  [0,2,0,2,4]],   // ;
  [60,  [1,2,4,2,1]],   // <
  [61,  [0,7,0,7,0]],   // =
  [62,  [4,2,1,2,4]],   // >
  [63,  [6,1,2,0,2]],   // ?
  [65,  [2,5,7,5,5]],   // A
  [66,  [6,5,6,5,6]],   // B
  [67,  [3,4,4,4,3]],   // C
  [68,  [6,5,5,5,6]],   // D
  [69,  [7,4,7,4,7]],   // E
  [70,  [7,4,6,4,4]],   // F
  [71,  [3,4,5,5,3]],   // G
  [72,  [5,5,7,5,5]],   // H
  [73,  [7,2,2,2,7]],   // I
  [74,  [3,1,1,5,2]],   // J
  [75,  [5,5,6,5,5]],   // K
  [76,  [4,4,4,4,7]],   // L
  [77,  [5,7,5,5,5]],   // M
  [78,  [5,7,7,5,5]],   // N
  [79,  [2,5,5,5,2]],   // O
  [80,  [6,5,6,4,4]],   // P
  [81,  [2,5,5,6,3]],   // Q
  [82,  [6,5,6,5,5]],   // R
  [83,  [3,4,2,1,6]],   // S
  [84,  [7,2,2,2,2]],   // T
  [85,  [5,5,5,5,2]],   // U
  [86,  [5,5,5,2,2]],   // V
  [87,  [5,5,7,7,5]],   // W
  [88,  [5,5,2,5,5]],   // X
  [89,  [5,5,2,2,2]],   // Y
  [90,  [7,1,2,4,7]],   // Z
]);
// Map lowercase to uppercase for tiny font
for (let i = 97; i <= 122; i++) {
  if (!TINY_FONT.has(i)) {
    const upper = TINY_FONT.get(i - 32);
    if (upper) TINY_FONT.set(i, upper);
  }
}

const LOGICAL_ROWS = 34;
const MODULE_COLS = 9;

const SCALE_MAP: Record<ScrollSize, number> = { small: 1, medium: 2, large: 3, max: 4 };

// Decode a glyph from FONT or TINY_FONT into a [row][col] boolean grid.
function decodeGlyph(code: number, tiny: boolean): boolean[][] {
  if (tiny) {
    const bits = TINY_FONT.get(code) ?? TINY_FONT.get(32)!;
    return bits.map(b => [(b >> 2 & 1) === 1, (b >> 1 & 1) === 1, (b & 1) === 1]);
  }
  const FONT_HEIGHT = 7, FONT_CHAR_WIDTH = 5;
  const bits = FONT.get(code) ?? FONT.get(32)!;
  return Array.from({ length: FONT_HEIGHT }, (_, r) => {
    const row = bits[r] ?? 0;
    return Array.from({ length: FONT_CHAR_WIDTH }, (__, c) => ((row >> (FONT_CHAR_WIDTH - 1 - c)) & 1) === 1);
  });
}

function applyStyle(px: boolean[][], style: ScrollStyle): boolean[][] {
  if (style === 'bold') {
    return px.map(row => row.map((v, c) => v || (c > 0 && (row[c - 1] ?? false))));
  }
  if (style === 'outline') {
    return px.map((row, r) => row.map((v, c) => {
      if (!v) return false;
      return !(px[r - 1]?.[c] ?? false) || !(px[r + 1]?.[c] ?? false) ||
             !(px[r]?.[c - 1] ?? false) || !(px[r]?.[c + 1] ?? false);
    }));
  }
  if (style === 'thin') {
    return px.map((row, r) => row.map((v, c) => {
      if (!v) return false;
      const n = [px[r - 1]?.[c], px[r + 1]?.[c], px[r]?.[c - 1], px[r]?.[c + 1]];
      return n.filter(Boolean).length < 3;
    }));
  }
  return px;
}

function scaleGlyph(px: boolean[][], scale: number): boolean[][] {
  if (scale === 1) return px;
  const out: boolean[][] = [];
  for (const row of px) {
    const sr = row.flatMap(v => Array<boolean>(scale).fill(v));
    for (let i = 0; i < scale; i++) out.push([...sr]);
  }
  return out;
}

function renderText(text: string, size: ScrollSize, style: ScrollStyle): { buf: Uint8Array; width: number } {
  const tiny = style === 'tiny';
  const scale = tiny ? 1 : SCALE_MAP[size];
  const baseH = tiny ? 5 : 7;
  const baseW = tiny ? 3 : 5;
  const scaledH = baseH * scale;
  const scaledW = baseW * scale;
  const step = scaledW + scale; // char width + scaled gap
  const top = Math.floor((LOGICAL_ROWS - scaledH) / 2);

  const width = text.length * step;
  const buf = new Uint8Array(width * LOGICAL_ROWS);

  for (let ci = 0; ci < text.length; ci++) {
    const code = text.charCodeAt(ci);
    let glyph = decodeGlyph(code, tiny);
    if (!tiny) glyph = applyStyle(glyph, style);
    const scaled = scaleGlyph(glyph, scale);
    const charCol = ci * step;

    for (let r = 0; r < scaled.length; r++) {
      const row = scaled[r]!;
      for (let c = 0; c < row.length; c++) {
        if (row[c]) {
          const bufCol = charCol + c;
          const bufRow = top + r;
          if (bufCol < width && bufRow < LOGICAL_ROWS) {
            buf[bufCol * LOGICAL_ROWS + bufRow] = 255;
          }
        }
      }
    }
  }

  return { buf, width };
}

// Extract a 9-column frame from the logical text buffer at the given x offset.
// Columns outside [0, width) are blank (already zero).
function extractFrame(buf: Uint8Array, bufWidth: number, xOffset: number): Frame {
  const frame = createFrame();
  for (let fc = 0; fc < MODULE_COLS; fc++) {
    const srcCol = xOffset + fc;
    if (srcCol >= 0 && srcCol < bufWidth) {
      for (let row = 0; row < LOGICAL_ROWS; row++) {
        const pixel = buf[srcCol * LOGICAL_ROWS + row] ?? 0;
        frame[fc * LOGICAL_ROWS + row] = pixel;
      }
    }
  }
  return frame;
}

export function createScrollAnimation(opts: ScrollOptions): ScrollAnimation {
  const { text, fps = 20, pixelsPerTick = 1, loop = true, size = 'small', style = 'normal' } = opts;
  const { buf, width } = renderText(text, size, style);
  const LEAD = MODULE_COLS * 2; // blank columns before text enters from right
  const wrapAt = width + LEAD;  // reset when text has fully exited left + trailing blank

  let stopped = false;
  let offset = -LEAD; // start off-screen right

  function stop(): void {
    stopped = true;
  }

  function makeIterator(): AsyncIterator<ScrollFrame> {
    return {
      async next(): Promise<IteratorResult<ScrollFrame>> {
        if (stopped) {
          return { value: undefined as unknown as ScrollFrame, done: true };
        }

        const leftOffset = offset;
        const rightOffset = offset + MODULE_COLS;

        const left = extractFrame(buf, width, leftOffset);
        const right = extractFrame(buf, width, rightOffset);

        offset += pixelsPerTick;

        if (!loop && offset >= wrapAt) {
          stopped = true;
        } else if (loop && offset >= wrapAt) {
          offset = -LEAD;
        }

        return { value: [left, right], done: false };
      },
    };
  }

  return {
    stop,
    [Symbol.asyncIterator](): AsyncIterator<ScrollFrame> {
      return makeIterator();
    },
  };
}
