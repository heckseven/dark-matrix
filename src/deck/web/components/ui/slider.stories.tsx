import * as React from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { Slider } from './slider';
import { Toggle } from './toggle';

const meta = {
  title: 'Components/Slider',
  component: Slider,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: [
          'Range input with two visual variants.',
          '',
          '**Variants**',
          '- `value` (default): monospace track with the current value displayed as a readout at the thumb position.',
          '- `cycling`: monospace track with a character thumb that cycles through a set as the handle moves.',
          '',
          '**Usage**',
          '- Use `defaultValue` for uncontrolled usage. Use `value` + `onChange` for controlled usage.',
          '- Both variants render a fixed-width monospace track; `className` applies to the wrapper element.',
        ].join('\n'),
      },
    },
  },
  argTypes: {
    variant: {
      control: 'select',
      options: ['value', 'cycling'],
      description: 'Visual style.',
    },
    min: { control: 'number', description: 'Minimum value.' },
    max: { control: 'number', description: 'Maximum value.' },
    step: { control: 'number', description: 'Increment between values. Defaults to `1`.' },
    defaultValue: { control: 'number', description: 'Initial value for uncontrolled usage.' },
    value: { control: 'number', description: 'Current value for controlled usage. Requires `onChange`.' },
    onChange: { description: 'Change handler for controlled usage.' },
    disabled: { control: 'boolean', description: 'Prevents interaction.' },
  },
  args: { onChange: fn(), min: 0, max: 255, defaultValue: 128 },
} satisfies Meta<typeof Slider>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Variant and range configurable via controls. */
export const Playground: Story = {
  args: { variant: 'value', 'aria-label': 'Slider' },
};

/** Thumb character cycles through a set as the handle moves. */
export const Cycling: Story = {
  args: { variant: 'cycling', 'aria-label': 'Slider' },
};

const DURATION = 120;

function fmt(secs: number) {
  return `${Math.floor(secs / 60)}:${Math.floor(secs % 60).toString().padStart(2, '0')}`;
}

/** Cycling variant as a video progress bar. Toggle play to see the thumb animate. */
export const CyclingPlayback: Story = {
  args: { cycleStep: 4 },
  argTypes: {
    cycleStep: {
      control: { type: 'range', min: 1, max: 32, step: 1 },
      description: 'Pixels of thumb travel before the cycling character advances.',
    },
  },
  render: ({ cycleStep }) => {
    const [currentTime, setCurrentTime] = React.useState(0);
    const [playing, setPlaying] = React.useState(false);

    React.useEffect(() => {
      if (!playing) return;
      const id = setInterval(() => {
        setCurrentTime(t => {
          if (t >= DURATION) { setPlaying(false); return DURATION; }
          return t + 1;
        });
      }, 100);
      return () => clearInterval(id);
    }, [playing]);

    return (
      <div className="flex items-center gap-2 px-3 py-1 bg-black w-full">
        <Toggle pressed={playing} onPressedChange={setPlaying} aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? '⏸' : '▶'}
        </Toggle>
        <span className="font-mono text-sm text-foreground tabular-nums shrink-0">{fmt(currentTime)}</span>
        <Slider
          variant="cycling"
          {...(cycleStep !== undefined ? { cycleStep } : {})}
          min={0}
          max={DURATION}
          step="any"
          value={currentTime}
          className="flex-1"
          aria-label="Seek"
          onChange={e => setCurrentTime(Number(e.target.value))}
        />
        <span className="font-mono text-sm text-foreground tabular-nums shrink-0">{fmt(DURATION)}</span>
      </div>
    );
  },
};
