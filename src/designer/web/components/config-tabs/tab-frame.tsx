import type { ReactNode } from 'react';

export function TabFrame({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-4 p-2">{children}</div>;
}

export function TabRow({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center gap-4">
      <span className="w-28 shrink-0 text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2 flex-1 min-w-0">{children}</div>
    </div>
  );
}
