import { forwardRef } from 'react';
import type { ReactNode, CSSProperties } from 'react';

export type PanelBarProps = {
  left?: ReactNode;
  center?: ReactNode;
  right?: ReactNode;
  as?: 'div' | 'header';
  sticky?: boolean;
  blur?: boolean;
  border?: boolean;
  className?: string;
  style?: CSSProperties;
};

export const PanelBar = forwardRef<HTMLElement, PanelBarProps>(function PanelBar({
  left,
  center,
  right,
  as: As = 'div',
  sticky = false,
  blur = true,
  border = false,
  className = '',
  style,
}, ref) {
  const blurStyle: CSSProperties = blur
    ? { backdropFilter: 'blur(4px)', backgroundColor: 'var(--color-backdrop-strong)' }
    : {};
  const cn = [
    'flex items-center',
    sticky && 'sticky top-0 z-10',
    border && 'border-b border-foreground/15',
    className,
  ].filter(Boolean).join(' ');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <As ref={ref as any} className={cn} style={{ ...blurStyle, ...style }}>
    <div className="flex-1 flex items-center min-w-0">{left}</div>
    {center != null && <div className="shrink-0 flex items-center">{center}</div>}
    <div className="flex-1 flex items-center justify-end min-w-0">{right}</div>
  </As>;
});
