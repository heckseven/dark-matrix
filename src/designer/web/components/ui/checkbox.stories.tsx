import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { fn } from 'storybook/test';
import { expect, userEvent } from 'storybook/test';
import { cn } from '@/lib/utils';
import { Checkbox } from './checkbox';
import { Text } from './text';

const meta = {
  title: 'Components/Checkbox',
  component: Checkbox,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: [
          'A styled `<input type="checkbox">`. All standard checkbox attributes are forwarded.',
          '',
          '**Usage**',
          '- Use `defaultChecked` for uncontrolled usage. Use `checked` + `onChange` for controlled usage.',
          '- Always pair with a visible label — wrap both in a `<label>` element or use `htmlFor`.',
        ].join('\n'),
      },
    },
  },
  argTypes: {
    checked: { control: 'boolean', description: 'Checked state for controlled usage. Requires `onChange`.' },
    defaultChecked: { control: 'boolean', description: 'Initial checked state for uncontrolled usage.' },
    disabled: { control: 'boolean', description: 'Prevents interaction and reduces opacity to 40%.' },
    onChange: { description: 'Change handler for controlled usage.' },
  },
  args: { onChange: fn() },
} satisfies Meta<typeof Checkbox>;

export default meta;
type Story = StoryObj<typeof meta>;

/** State and disabled configurable via controls. Click to toggle. */
export const Playground: Story = {
  args: { defaultChecked: false },
  render: (args) => (
    <label className="flex items-center gap-2 cursor-pointer">
      <Checkbox {...args} />
      <Text as="span" size="xs">Click to toggle</Text>
    </label>
  ),
};

export const Checked: Story = {
  args: { defaultChecked: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('checkbox')).toBeChecked();
  },
};

export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('checkbox')).toBeDisabled();
  },
};

export const DisabledChecked: Story = {
  args: { defaultChecked: true, disabled: true },
};

/**
 * Four aesthetic directions. Each column is interactive — click to toggle.
 * Static off/on previews shown below each interactive example.
 */
export const DesignOptions: Story = {
  tags: ['!autodocs'],
  render: () => {
    const options = [
      {
        id: 'A',
        name: 'A — Terminal',
        note: 'ASCII brackets',
        off: '[ ]',
        on:  '[×]',
      },
      {
        id: 'B',
        name: 'B — LED block',
        note: 'Unicode fill square',
        off: '□',
        on:  '■',
      },
      {
        id: 'C',
        name: 'C — Noise fill',
        note: 'Block-element ramp',
        off: '░',
        on:  '▓',
      },
      {
        id: 'D',
        name: 'D — Target',
        note: 'Ring / dot',
        off: '◯',
        on:  '◉',
      },
    ] as const;

    function OptionCol({ id, name, note, off, on }: typeof options[number]) {
      const [checked, setChecked] = useState(false);
      const inputId = `opt-${id}`;
      return (
        <div className="flex flex-col gap-4 min-w-[112px]">
          <div className="flex flex-col gap-0.5">
            <Text size="xs" weight="semibold">{name}</Text>
            <Text size="xs" variant="muted">{note}</Text>
          </div>

          {/* static preview — both states */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm text-muted-foreground select-none w-8 inline-block">{off}</span>
              <Text as="span" size="xs" variant="muted">off</Text>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm text-primary select-none w-8 inline-block">{on}</span>
              <Text as="span" size="xs" variant="muted">on</Text>
            </div>
          </div>

          {/* interactive */}
          <label htmlFor={inputId} className="flex items-center gap-2 cursor-pointer">
            <input
              id={inputId}
              type="checkbox"
              className="sr-only peer"
              checked={checked}
              onChange={e => setChecked(e.target.checked)}
            />
            <span
              aria-hidden="true"
              className={cn(
                'font-mono text-sm select-none transition-colors w-8 inline-block',
                'peer-focus-visible:outline-none peer-focus-visible:ring-1 peer-focus-visible:ring-ring rounded-sm',
                checked ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {checked ? on : off}
            </span>
            <Text as="span" size="xs">{checked ? 'on' : 'off'}</Text>
          </label>
        </div>
      );
    }

    return (
      <div className="flex gap-8 flex-wrap">
        {options.map(o => <OptionCol key={o.id} {...o} />)}
      </div>
    );
  },
};

/** Canonical usage: checkbox inside a label with a Text sibling. */
export const WithLabel: Story = {
  render: () => (
    <label className="flex items-center gap-2 cursor-pointer">
      <Checkbox defaultChecked />
      <Text as="span" size="xs">Loop animation</Text>
    </label>
  ),
  play: async ({ canvas }) => {
    const checkbox = canvas.getByRole('checkbox');
    await expect(checkbox).toBeChecked();
    await userEvent.click(checkbox);
    await expect(checkbox).not.toBeChecked();
  },
};
