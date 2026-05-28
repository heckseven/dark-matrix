import type { Meta, StoryObj } from '@storybook/react-vite';
import { Grid } from './grid';
import { Text } from './text';

const meta = {
  title: 'Layout/Grid',
  component: Grid,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: [
          'CSS Grid layout primitive. Sets `display: grid` with an equal-width column track.',
          '',
          '**Usage**',
          '- `cols` sets the number of equal-width columns (1–12). Use `className` for `auto-fill` or asymmetric tracks.',
          '- `gap` applies uniform row and column spacing. Override with `gap-x-*` / `gap-y-*` via `className` when you need different axes.',
        ].join('\n'),
      },
    },
  },
  argTypes: {
    as: {
      control: 'select',
      options: ['div', 'section', 'ul', 'ol'],
      description: 'Rendered HTML element.',
    },
    cols: {
      control: 'select',
      options: ['1', '2', '3', '4', '6', '12'],
      description: 'Number of equal-width column tracks.',
    },
    gap: {
      control: 'select',
      options: ['none', 'xs', 'sm', 'md', 'lg', 'xl'],
      description: '`none` 0 · `xs` 4px · `sm` 8px (default) · `md` 16px · `lg` 24px · `xl` 32px.',
    },
  },
} satisfies Meta<typeof Grid>;

export default meta;
type Story = StoryObj<typeof meta>;

function Cell({ label }: { label: string }) {
  return (
    <Text as="div" size="xs" variant="muted" className="border border-border rounded px-2 py-3 text-center">
      {label}
    </Text>
  );
}

/** Column count and gap configurable via controls. */
export const Playground: Story = {
  args: { cols: '3', gap: 'sm' },
  render: (args) => (
    <Grid {...args}>
      {Array.from({ length: 6 }, (_, i) => <Cell key={i} label={`${i + 1}`} />)}
    </Grid>
  ),
};

export const TwoColumns: Story = {
  render: () => (
    <Grid cols="2" gap="md">
      {Array.from({ length: 4 }, (_, i) => <Cell key={i} label={`${i + 1}`} />)}
    </Grid>
  ),
};

export const FourColumns: Story = {
  render: () => (
    <Grid cols="4" gap="sm">
      {Array.from({ length: 8 }, (_, i) => <Cell key={i} label={`${i + 1}`} />)}
    </Grid>
  ),
};

export const TwelveColumnLayout: Story = {
  render: () => (
    <Grid cols="12" gap="xs">
      <Text as="div" size="xs" variant="muted" className="col-span-3 border border-border rounded px-2 py-3 text-center">3 cols</Text>
      <Text as="div" size="xs" variant="primary" className="col-span-6 border border-primary rounded px-2 py-3 text-center">6 cols</Text>
      <Text as="div" size="xs" variant="muted" className="col-span-3 border border-border rounded px-2 py-3 text-center">3 cols</Text>
    </Grid>
  ),
};
