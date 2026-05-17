# HUD Picker Thumbnail Draw Order

Draw in the designer at **9-wide, BW mode**. One frame per widget, in this exact order.
Export as `.dmx.json` and hand off — the pixel data will be parsed by frame index.

## Clocks (frames 1–7) — matches CLOCK_FACES order

| Frame | Face ID | Label |
|-------|---------|-------|
| 1 | `binary-audio` | stack |
| 2 | `elegant` | elegant |
| 3 | `stretch` | stretch |
| 4 | `analogue` | analogue |
| 5 | `binary-blocks` | blocks |
| 6 | `binary-tall` | signal |
| 7 | `binary-diamond` | struct |

## Data (frames 8–11) — matches DATA_STYLES order

| Frame | Style ID | Label |
|-------|----------|-------|
| 8 | `line` | line |
| 9 | `fill` | fill |
| 10 | `scroll` | scroll |
| 11 | `cores` | cores |

## AI (frame 12)

| Frame | Widget ID | Label |
|-------|-----------|-------|
| 12 | `heatmap` | tool heatmap |

## Audio (frames 13–34) — matches AUDIO_STYLES order

| Frame | Style ID | Label |
|-------|----------|-------|
| 13 | `dark-matter` | dark matter |
| 14 | `glitch-corrupt` | summon |
| 15 | `vu-glitch` | vu glitch |
| 16 | `specter` | specter |
| 17 | `circuit` | circuit |
| 18 | `scope-dual` | ward |
| 19 | `heat` | heat |
| 20 | `kick-d` | kick |
| 21 | `waterfall` | waterfall |
| 22 | `hex` | hex |
| 23 | `life-erode-4` | replicants |
| 24 | `wake` | wake |
| 25 | `drop` | drop |
| 26 | `spirits` | spirits |
| 27 | `spectrum-fall` | timeline |
| 28 | `cipher` | cipher |
| 29 | `neo` | neo |
| 30 | `rhythm` | rhythm |
| 31 | `spiral-d` | spiral d |
| 32 | `glitch-sort-b` | rift |
| 33 | `strobe` | beam |
| 34 | `sparks` | sparks |
