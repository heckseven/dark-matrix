export function TabFrame({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-4 p-2">{children}</div>;
}

export function TabField({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}
