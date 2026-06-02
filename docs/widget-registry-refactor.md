# Widget registry refactor

## The problem

Adding a new HUD widget currently requires edits across **15 locations in 5 files**:

| File | Location | What changes |
|---|---|---|
| `src/deck/web/types/hud-preset.ts` | `HudWidget` union | add type arm |
| `src/lib/config.ts` | `HudWidgetSchema` discriminated union | add Zod case |
| `src/deck/web/components/HudInspector.tsx` | `categoryOfWidget()` | add category mapping |
| `src/deck/web/components/HudInspector.tsx` | `widgetHasSettings()` | add settings flag |
| `src/deck/web/components/HudInspector.tsx` | grid component (new function) | add picker UI |
| `src/deck/web/components/HudInspector.tsx` | grid conditional render | add render branch |
| `src/deck/web/components/HudInspector.tsx` | settings panel conditionals | add settings branch |
| `src/deck/web/components/HudDualPreview.tsx` | `getPixels()` else-if chain | add preview renderer |
| `src/deck/web/components/usePresetPixels.ts` | `renderWidgetToB64()` if chain | add thumbnail renderer |
| `src/deck/web/components/HudPanel.tsx` | `buildPresetConfigPayload()` | add config serializer |
| `src/deck/web/components/HudPanel.tsx` | `previewHasAudio` check | add if audio-dependent |
| `src/daemon/index.ts` | `createWidgetRenderer()` switch | add hardware renderer |
| `src/daemon/index.ts` | dependency detection block | add if data/audio-dependent |
| `src/deck/server.ts` | `hud-config` message handler | add param extraction |

Nothing enforces completeness. A new widget compiles fine with partial implementation — missing branches fail silently at runtime.

---

## Option A: widget descriptor registry (recommended)

Co-locate everything a widget needs at its own definition site. Each widget exports a descriptor; a central registry assembles them. All the if/else and switch chains become single-line lookups.

### Shared descriptor (environment-neutral)

```typescript
// src/lib/widgets/types.ts
interface WidgetDescriptor<T extends HudWidget> {
  type: T['widget'];
  schema: ZodType<T>;
  defaultConfig: T;
  category: string;
  hasSettings: (config: T) => boolean;
  dependencies?: ('audio' | 'data')[];
}
```

### Browser descriptor

```typescript
// src/deck/web/widgets/types.ts
interface BrowserWidgetDescriptor<T extends HudWidget> extends WidgetDescriptor<T> {
  GridComponent: React.FC<GridProps>;
  SettingsComponent?: React.FC<SettingsProps<T>>;
  renderPreview: (config: T, side: 'left' | 'right') => Uint8Array;  // 9×34 pixels
  renderThumbnail: (config: T, side: 'left' | 'right') => string;    // base64
  serializeConfig: (config: T, side: 'left' | 'right') => Record<string, unknown>;
}
```

### Daemon descriptor

```typescript
// src/daemon/widgets/types.ts
interface DaemonWidgetDescriptor<T extends HudWidget> extends WidgetDescriptor<T> {
  createRenderer: (config: T, ctx: WidgetContext) => FrameSource;
  extractParams: (msg: HudConfigMessage, side: 'left' | 'right') => T;
}
```

### Usage after refactor

```typescript
// HudDualPreview.tsx — before: 70-line if/else chain
// after:
const descriptor = BROWSER_WIDGET_REGISTRY[widget.widget];
return descriptor.renderPreview(widget, side);

// daemon/index.ts — before: 330-line switch
// after:
const descriptor = DAEMON_WIDGET_REGISTRY[widget.widget];
return descriptor.createRenderer(widget, ctx);
```

TypeScript's mapped-type exhaustiveness guarantees the registry covers all types at compile time — no runtime silent failures.

### File layout

```
src/
  lib/widgets/
    types.ts          ← shared WidgetDescriptor interface
  deck/web/widgets/
    index.ts          ← BROWSER_WIDGET_REGISTRY (assembled map)
    clock.tsx
    audio.tsx
    data.tsx
    image.tsx
    life.tsx
    timer.tsx
    claude.tsx
    text.tsx
    zen.tsx
  daemon/widgets/
    index.ts          ← DAEMON_WIDGET_REGISTRY (assembled map)
    clock.ts
    audio.ts
    ...
```

Adding a widget: create two files (`deck/web/widgets/foo.tsx`, `daemon/widgets/foo.ts`), register in each index. TypeScript catches any missing descriptor fields.

### Tradeoffs

- Migration cost is high — all 9 existing widgets need to be ported
- Browser and daemon registries stay separate (they can't share React components or Node.js APIs), so there are two files per widget instead of one
- The daemon renderer for some widgets (`life`, `image`) is substantially stateful — the descriptor's `createRenderer` return type needs to handle lifecycle (start/stop/update) cleanly, which requires designing that interface carefully before porting

---

## Option B: exhaustiveness checks only (low-cost quick win)

Without restructuring anything, add TypeScript exhaustiveness assertions at each switch/if chain so that a new widget type that isn't handled becomes a compile error rather than a silent runtime miss.

```typescript
// in every switch(widget.widget) { ... }:
default: {
  const _exhaustive: never = widget;
  throw new Error(`unhandled widget type: ${(widget as HudWidget).widget}`);
}
```

This doesn't reduce the edit count — you still touch all 14 locations — but it makes omissions impossible to miss. Useful as a standalone step or as a prerequisite before Option A so the migration can be done incrementally with confidence.

---

## Recommendation

Do Option B now (30 minutes, zero risk). Schedule Option A as dedicated refactor work — it touches essentially every HUD file and is worth doing as its own branch with test coverage before any new widgets are added.
