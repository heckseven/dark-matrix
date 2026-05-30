import * as React from 'react';
import { Input } from '../ui/input.js';
import { TabFrame, TabRow } from './tab-frame.js';

interface DaemonValue {
  poll_interval_ms: number;
}

interface DaemonTabProps {
  value: DaemonValue;
  onChange: (v: DaemonValue) => void;
}

export function DaemonTab({ value, onChange }: DaemonTabProps) {
  return (
    <TabFrame>

      <TabRow label="poll interval">
        <Input
          fluid
          type="number"
          value={value.poll_interval_ms}
          min={100}
          max={60000}
          suffix="ms"
          onChange={e => {
            const n = parseInt(e.target.value, 10);
            if (!isNaN(n)) onChange({ ...value, poll_interval_ms: n });
          }}
          aria-label="poll interval ms"
        />
      </TabRow>

    </TabFrame>
  );
}
