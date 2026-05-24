import type { ReactNode, CSSProperties, Ref } from 'react';

export type ThreePanelLayoutProps = {
  left: ReactNode;
  center: ReactNode;
  right: ReactNode;
  columns?: string;
  gap?: string | number;
  leftLabel?: string;
  centerLabel?: string;
  rightLabel?: string;
  leftClassName?: string;
  centerClassName?: string;
  rightClassName?: string;
  leftStyle?: CSSProperties;
  centerStyle?: CSSProperties;
  rightStyle?: CSSProperties;
  centerRef?: Ref<HTMLElement>;
};

export function ThreePanelLayout({
  left,
  center,
  right,
  columns = 'minmax(0,1fr) auto minmax(0,1fr)',
  gap = 0,
  leftLabel,
  centerLabel,
  rightLabel,
  leftClassName = 'overflow-hidden flex flex-col',
  centerClassName = 'overflow-hidden',
  rightClassName = 'overflow-hidden flex flex-col',
  leftStyle,
  centerStyle,
  rightStyle,
  centerRef,
}: ThreePanelLayoutProps) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: columns, gap, height: '100%', width: '100%', overflow: 'hidden' }}>
      <aside aria-label={leftLabel} className={leftClassName} style={leftStyle}>
        {left}
      </aside>
      <section ref={centerRef} aria-label={centerLabel} className={centerClassName} style={centerStyle}>
        {center}
      </section>
      <aside aria-label={rightLabel} className={rightClassName} style={rightStyle}>
        {right}
      </aside>
    </div>
  );
}
