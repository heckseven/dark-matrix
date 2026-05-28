# HUD Picker Thumbnail Draw Order

Draw in the deck at **9-wide, BW mode**. One frame per widget, in this exact order.
Export as `.dmx.json` and hand off — the pixel data will be parsed by frame index.

## Clocks (frames 1–10) — matches CLOCK_FACES order

| Frame | Face ID | Label |
|-------|---------|-------|
| 1 | `stretch` | stretch |
| 2 | `twinz` | twinz |
| 3 | `elegant` | elegant |
| 4 | `binary-diamond` | struct |
| 5 | `binary-audio` | stack |
| 6 | `binary-tall` | signal |
| 7 | `binary-blocks` | blocks |
| 8 | `razor` | razor |
| 9 | `blade` | blade |
| 10 | `analog` | analog |

## Data (frames 11–14) — matches DATA_STYLES order

| Frame | Style ID | Label |
|-------|----------|-------|
| 11 | `line` | line |
| 12 | `fill` | fill |
| 13 | `scroll` | scroll |
| 14 | `cores` | cores |

## Agent (frame 15)

| Frame | Widget ID | Label |
|-------|-----------|-------|
| 15 | `heatmap` | tool heatmap |

## Audio (frames 16–37) — matches AUDIO_STYLES order

| Frame | Style ID | Label |
|-------|----------|-------|
| 16 | `dark-matter` | dark matter |
| 17 | `glitch-corrupt` | summon |
| 18 | `vu-glitch` | vu glitch |
| 19 | `specter` | specter |
| 20 | `circuit` | circuit |
| 21 | `scope-dual` | ward |
| 22 | `heat` | heat |
| 23 | `kick-d` | kick |
| 24 | `waterfall` | waterfall |
| 25 | `hex` | hex |
| 26 | `life-erode-4` | replicants |
| 27 | `wake` | wake |
| 28 | `drop` | drop |
| 29 | `spirits` | spirits |
| 30 | `spectrum-fall` | timeline |
| 31 | `cipher` | cipher |
| 32 | `neo` | neo |
| 33 | `rhythm` | rhythm |
| 34 | `spiral-d` | spiral d |
| 35 | `glitch-sort-b` | rift |
| 36 | `strobe` | beam |
| 37 | `sparks` | sparks |
