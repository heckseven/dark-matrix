import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { useState } from 'react';
import { TimeInput } from './time-input.js';

const meta = {
  title: 'Components/TimeInput',
  component: TimeInput,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: [
          'A bracket-styled `[ HH:MM ]` or `[ HH:MM:SS ]` time input.',
          'Three scrub segments share a single bracket wrapper — drag any segment horizontally to scrub, click to enter text-edit mode, then blur or press Enter to commit.',
          '',
          '**Carry-over**',
          'Scrubbing past a segment boundary carries into the adjacent segment.',
          'Dragging minutes from 58 to 70 wraps minutes to 10 and increments hours by 1.',
          'Carry works in both directions — dragging below 0 borrows from the segment to the left.',
          '',
          '**Clock vs. timer mode**',
          '- `maxHours={23}` (default) — hours wrap at midnight on carry, mirroring 24-hour clock behaviour.',
          '- `maxHours={undefined}` — hours are uncapped and clamp at 0 on the low end. Use for stopwatch/countdown inputs.',
          '',
          '**Usage**',
          '- Always controlled — pass `value` + `onChange` together.',
          '- `value` is a `"HH:MM"` or `"HH:MM:SS"` string; `onChange` emits the same format.',
          '- `showSeconds` adds the `:SS` segment.',
          '- `label` renders a label to the left of the bracket, consistent with `Input` and `ScrubInput`.',
        ].join('\n'),
      },
    },
  },
  argTypes: {
    value: { control: 'text', description: '`"HH:MM"` or `"HH:MM:SS"` string.' },
    showSeconds: { control: 'boolean', description: 'Adds a seconds segment.' },
    maxHours: {
      control: { type: 'number', min: 0 },
      description: 'Max value for the hours segment. `23` = clock mode (wraps midnight). Omit for uncapped timer mode.',
    },
    label: { control: 'text', description: 'Label rendered to the left of the bracket.' },
    disabled: { control: 'boolean', description: 'Disables all segments.' },
    'aria-label': { control: 'text', description: 'Accessible group label when no visible label is present.' },
  },
  args: { onChange: fn() },
} satisfies Meta<typeof TimeInput>;

export default meta;
type Story = StoryObj<typeof meta>;

function Controlled(props: Parameters<typeof TimeInput>[0]) {
  const [v, setV] = useState(props.value);
  return <TimeInput {...props} value={v} onChange={val => { setV(val); props.onChange?.(val); }} />;
}

/** Drag any segment to scrub; click to type, then blur or Enter to commit. */
export const Playground: Story = {
  render: args => <Controlled {...args} />,
  args: { value: '09:30' },
};

/** `showSeconds` adds a third `:SS` segment. Carry propagates across all three. */
export const WithSeconds: Story = {
  render: args => <Controlled {...args} />,
  args: { value: '01:30:45', showSeconds: true },
};

/** `label` places a muted label to the left of the bracket, wired to focus. */
export const WithLabel: Story = {
  render: args => <Controlled {...args} />,
  args: { value: '18:00', label: 'to' },
};

/** `from` / `to` pair as used in the time trigger. */
export const FromToPair: Story = {
  args: { value: '09:00' },
  render: () => {
    const [from, setFrom] = useState('09:00');
    const [to, setTo] = useState('17:30');
    return (
      <div className="flex items-center gap-4">
        <TimeInput label="from" value={from} onChange={setFrom} />
        <TimeInput label="to"   value={to}   onChange={setTo} />
      </div>
    );
  },
};

/**
 * `maxHours={undefined}` removes the upper cap on hours.
 * Scrubbing minutes past 59 accumulates hours indefinitely.
 * Hours clamp at 0 on the low end.
 */
export const TimerMode: Story = {
  render: args => <Controlled {...args} />,
  args: { value: '02:30:00', showSeconds: true, maxHours: 99 },
};

/** All segments are non-interactive and rendered at reduced opacity. */
export const Disabled: Story = {
  args: { value: '12:00', disabled: true },
};
