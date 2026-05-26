import { useReducer, useRef, useEffect } from 'react';
import type { Key, ReactNode } from 'react';
import { Button } from './ui/button.js';
import { MatrixItem } from './MatrixItem.js';
import { MatrixItemList } from './MatrixItemList.js';

export type MatrixItemColumnProps<T> = {
  // ── Data ──────────────────────────────────────────────────────────────────
  items: T[];
  getKey: (item: T, idx: number) => Key;

  // ── Pixel rendering ───────────────────────────────────────────────────────
  /** Called on every tick when animated, or once per render when not. */
  getPixels: (item: T, tick: number) => string;
  getWidth?: (item: T) => 9 | 18;

  // ── Item metadata ─────────────────────────────────────────────────────────
  getName?: (item: T) => string | undefined;
  /** Falls back to getName or "Item N" when omitted. */
  getAriaLabel?: (item: T, isActive: boolean, idx: number) => string;

  // ── State predicates ──────────────────────────────────────────────────────
  isSelected?: (item: T, idx: number) => boolean;
  isActive?:   (item: T, idx: number) => boolean;

  // ── Standard actions — controls appear only when the callback is provided ─
  onSelect?:     (item: T, idx: number) => void;
  onMove?:       (fromIdx: number, toIdx: number) => void;
  onInsert?:     (afterIdx: number) => void;
  insertLabel?:  (afterIdx: number) => string;
  onDelete?:     (item: T, idx: number) => void;
  onDuplicate?:  (item: T, idx: number) => void;
  onRename?:     (item: T, newName: string) => void;
  onAdd?:        () => void;
  addLabel?:     string;
  emptyText?:    string;

  // ── Activate (• / ∗) — optional ──────────────────────────────────────────
  onActivate?:   (item: T) => void;
  activateLabel?: string;
  activeLabel?:   string;

  // ── Domain extras — injected after activate, before ⧉/× ─────────────────
  extraControls?: (item: T, idx: number) => ReactNode;

  // ── Animation ─────────────────────────────────────────────────────────────
  /** When true, ticks every 100 ms and calls onTick before re-rendering. */
  animated?: boolean;
  /** Called before each render tick so consumers can update pixel refs. */
  onTick?: (tick: number) => void;

  // ── Layout ────────────────────────────────────────────────────────────────
  sideAlign?:    'start' | 'end';
  topPadding?:   number;
  bottomPadding?: number;

  // ── MatrixItemList passthrough ────────────────────────────────────────────
  'aria-label'?: string;
  semantic?:     boolean;
  gap?:          'sm';
};

export function MatrixItemColumn<T>({
  items,
  getKey,
  getPixels,
  getWidth,
  getName,
  getAriaLabel,
  isSelected,
  isActive,
  onSelect,
  onMove,
  onInsert,
  insertLabel,
  onDelete,
  onDuplicate,
  onRename,
  onAdd,
  addLabel = 'Add',
  emptyText,
  onActivate,
  activateLabel = 'Set as active',
  activeLabel   = 'Active',
  extraControls,
  animated = false,
  onTick,
  sideAlign,
  topPadding,
  bottomPadding,
  'aria-label': ariaLabel,
  semantic,
  gap,
}: MatrixItemColumnProps<T>) {
  // counter value unused; increment triggers a re-render
  const [, forceUpdate] = useReducer(c => c + 1, 0);
  const tickRef   = useRef(0);
  const onTickRef = useRef(onTick);
  onTickRef.current = onTick;

  useEffect(() => {
    if (!animated) return;
    const id = setInterval(() => {
      tickRef.current += 1;
      onTickRef.current?.(tickRef.current);
      forceUpdate();
    }, 100);
    return () => clearInterval(id);
  }, [animated]);

  return (
    <MatrixItemList
      items={items}
      getKey={getKey}
      renderItem={(item, idx, dragProps) => {
        const tick   = tickRef.current;
        const active = isActive?.(item, idx)   ?? false;
        const sel    = isSelected?.(item, idx) ?? false;
        const name   = getName?.(item);
        const width  = getWidth?.(item) ?? 9;
        const pixels = getPixels(item, tick);
        const label  = getAriaLabel
          ? getAriaLabel(item, active, idx)
          : (name ?? `Item ${idx + 1}`);

        const controlsTop = onMove ? (
          <>
            <Button variant="ghost" className="w-8" aria-label={`Move ${label} up`} tooltip={`Move ${label} up`} tooltipSide="right"
              disabled={idx === 0}
              onClick={e => { e.stopPropagation(); onMove(idx, idx - 1); }}>↑</Button>
            <Button variant="ghost" className="w-8" aria-label={`Move ${label} down`} tooltip={`Move ${label} down`} tooltipSide="right"
              disabled={idx === items.length - 1}
              onClick={e => { e.stopPropagation(); onMove(idx, idx + 1); }}>↓</Button>
          </>
        ) : undefined;

        const extraNode = extraControls?.(item, idx) ?? null;
        const hasBottom = Boolean(onActivate)
          || extraNode !== null
          || Boolean(onDuplicate)
          || (Boolean(onDelete) && items.length > 1);
        const controlsBottom = hasBottom ? (
          <>
            {onActivate && (active ? (
              <Button variant="primary" className="w-8" aria-label={activeLabel} tooltip={activeLabel} tooltipSide="right"
                aria-pressed={true} aria-disabled={true}
                onClick={e => e.stopPropagation()}>∗</Button>
            ) : (
              <Button variant="ghost" className="w-8" aria-label={activateLabel} tooltip={activateLabel} tooltipSide="right"
                onClick={e => { e.stopPropagation(); onActivate(item); }}>•</Button>
            ))}
            {extraNode}
            {onDuplicate && (
              <Button variant="ghost" className="w-8" aria-label={`Clone ${label}`} tooltip={`Clone ${label}`} tooltipSide="right"
                onClick={e => { e.stopPropagation(); onDuplicate(item, idx); }}>⧉</Button>
            )}
            {onDelete && items.length > 1 && (
              <Button variant="ghost" className="w-8" aria-label={`Delete ${label}`} tooltip={`Delete ${label}`} tooltipSide="right"
                onClick={e => { e.stopPropagation(); onDelete(item, idx); }}>×</Button>
            )}
          </>
        ) : undefined;

        return (
          <MatrixItem
            aria-label={label}
            width={width}
            pixels={pixels}
            isActive={active}
            isSelected={sel}
            {...(name !== undefined ? { name } : {})}
            {...(onSelect  ? { onSelect: () => onSelect(item, idx) } : {})}
            {...(onRename  ? { onRename: newName => onRename(item, newName) } : {})}
            {...(onMove    ? { dragIdx: dragProps.dragIdx, count: dragProps.count, onDragOver: dragProps.onDragOver, onDrop: dragProps.onDrop } : {})}
            {...(controlsTop    !== undefined ? { controlsTop }    : {})}
            {...(controlsBottom !== undefined ? { controlsBottom } : {})}
          />
        );
      }}
      onMove={onMove ?? (() => {})}
      {...(onInsert     !== undefined ? { onInsert }     : {})}
      {...(insertLabel  !== undefined ? { insertLabel }  : {})}
      {...(onAdd        !== undefined ? { onAdd }        : {})}
      {...(emptyText    !== undefined ? { emptyText }    : {})}
      {...(ariaLabel    !== undefined ? { 'aria-label': ariaLabel } : {})}
      {...(sideAlign    !== undefined ? { sideAlign }    : {})}
      {...(topPadding   !== undefined ? { topPadding }   : {})}
      {...(bottomPadding !== undefined ? { bottomPadding } : {})}
      {...(semantic     !== undefined ? { semantic }     : {})}
      {...(gap          !== undefined ? { gap }          : {})}
      addLabel={addLabel}
    />
  );
}
