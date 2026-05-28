import type { Meta, StoryObj } from '@storybook/react-vite';
import { Stack } from './stack';
import { Button } from './button';

const meta = {
  title: 'Layout/Stack',
  component: Stack,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: [
          'Flexbox layout primitive. Stacks children vertically (`col`) or horizontally (`row`).',
          '',
          '**Usage**',
          '- Default direction is `col`. Switch to `row` for inline groups like toolbars or button clusters.',
          '- `align` controls cross-axis alignment; `justify` controls main-axis distribution.',
        ].join('\n'),
      },
    },
  },
  argTypes: {
    as: {
      control: 'select',
      options: ['div', 'section', 'main', 'article', 'header', 'footer', 'nav', 'ul', 'ol', 'li'],
      description: 'Rendered HTML element.',
    },
    direction: {
      control: 'select',
      options: ['col', 'row'],
      description: '`col` stacks vertically. `row` stacks horizontally.',
    },
    gap: {
      control: 'select',
      options: ['none', 'xs', 'sm', 'md', 'lg', 'xl'],
      description: '`none` 0 · `xs` 4px · `sm` 8px (default) · `md` 16px · `lg` 24px · `xl` 32px.',
    },
    align: {
      control: 'select',
      options: ['start', 'center', 'end', 'stretch', 'baseline'],
      description: 'Cross-axis alignment (flex `align-items`).',
    },
    justify: {
      control: 'select',
      options: ['start', 'center', 'end', 'between', 'around'],
      description: 'Main-axis distribution (flex `justify-content`).',
    },
    wrap: {
      control: 'boolean',
      description: 'Allow children to wrap onto multiple lines.',
    },
  },
} satisfies Meta<typeof Stack>;

export default meta;
type Story = StoryObj<typeof meta>;

/** All props configurable via controls. */
export const Playground: Story = {
  args: { direction: 'row', gap: 'sm', align: 'center', justify: 'start' },
  render: (args) => (
    <Stack {...args}>
      <Button>First</Button>
      <Button>Second</Button>
      <Button>Third</Button>
    </Stack>
  ),
};

export const Column: Story = {
  render: () => (
    <Stack direction="col" gap="sm">
      <Button>First</Button>
      <Button>Second</Button>
      <Button>Third</Button>
    </Stack>
  ),
};

export const Row: Story = {
  render: () => (
    <Stack direction="row" gap="sm" align="center">
      <Button>First</Button>
      <Button>Second</Button>
      <Button>Third</Button>
    </Stack>
  ),
};

export const SpaceBetween: Story = {
  render: () => (
    <Stack direction="row" justify="between" align="center" className="w-full border border-dashed border-border p-2">
      <Button>Left</Button>
      <Button variant="primary">Right</Button>
    </Stack>
  ),
};

export const Wrapping: Story = {
  render: () => (
    <Stack direction="row" gap="xs" wrap className="w-48">
      {Array.from({ length: 10 }, (_, i) => (
        <Button key={i} size="sm">{i + 1}</Button>
      ))}
    </Stack>
  ),
};
