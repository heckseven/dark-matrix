import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { fn } from 'storybook/test';
import { expect, userEvent } from 'storybook/test';
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

// Disabled state decorative spans (aria-hidden) fail contrast at 40% opacity.
// WCAG 1.4.3 exempts inactive controls; exclude the specific decorative elements
// rather than disabling the rule for the whole story.
const disabledA11yParams = {
  a11y: { context: { exclude: ['[aria-hidden="true"]'] } },
};

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
  args: { defaultChecked: true, 'aria-label': 'Example checkbox' },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('checkbox')).toBeChecked();
  },
};

export const Disabled: Story = {
  args: { disabled: true, 'aria-label': 'Example checkbox' },
  parameters: disabledA11yParams,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('checkbox')).toBeDisabled();
  },
};

export const DisabledChecked: Story = {
  args: { defaultChecked: true, disabled: true, 'aria-label': 'Example checkbox' },
  parameters: disabledA11yParams,
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
