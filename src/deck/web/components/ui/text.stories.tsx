import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { Text } from './text';

const meta = {
  title: 'Components/Text',
  component: Text,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: [
          'Polymorphic text primitive. Renders as `<p>` by default.',
          '',
          '**Usage**',
          '- Use `as` to match the semantic element: `as="h1"` for headings, `as="span"` for inline, `as="label"` for form labels.',
          '- `size` is independent of the semantic element — an `h1` can render at any size.',
        ].join('\n'),
      },
    },
  },
  argTypes: {
    as: {
      control: 'select',
      options: ['p', 'span', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'label', 'small', 'strong', 'em'],
      description: 'Rendered HTML element.',
    },
    size: {
      control: 'select',
      options: ['xs', 'sm', 'md', 'lg', 'xl'],
      description: '`xs` 12px · `sm` 14px (default) · `md` 16px · `lg` 18px · `xl` 20px.',
    },
    weight: {
      control: 'select',
      options: ['normal', 'medium', 'semibold', 'bold'],
      description: 'Font weight.',
    },
    variant: {
      control: 'select',
      options: ['default', 'muted', 'primary', 'destructive'],
      description: 'Text color.',
    },
    children: { control: 'text', description: 'Content.' },
  },
} satisfies Meta<typeof Text>;

export default meta;
type Story = StoryObj<typeof meta>;

/** All props configurable via controls. */
export const Playground: Story = {
  args: { children: 'The quick brown fox jumps over the lazy dog.', size: 'sm', weight: 'normal', variant: 'default' },
};

export const AllSizes: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <Text size="xl">Extra large — 20px</Text>
      <Text size="lg">Large — 18px</Text>
      <Text size="md">Medium — 16px</Text>
      <Text size="sm">Small — 14px (default)</Text>
      <Text size="xs">Extra small — 12px</Text>
    </div>
  ),
};

export const AllWeights: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <Text weight="normal">Normal — 400</Text>
      <Text weight="medium">Medium — 500</Text>
      <Text weight="semibold">Semibold — 600</Text>
      <Text weight="bold">Bold — 700</Text>
    </div>
  ),
};

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <Text variant="default">Default</Text>
      <Text variant="muted">Muted</Text>
      <Text variant="primary">Primary</Text>
      <Text variant="destructive">Destructive</Text>
    </div>
  ),
};

export const AsHeadings: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <Text as="h1" size="xl" weight="bold">Heading 1</Text>
      <Text as="h2" size="lg" weight="semibold">Heading 2</Text>
      <Text as="h3" size="md" weight="semibold">Heading 3</Text>
      <Text as="h4" size="sm" weight="medium">Heading 4</Text>
    </div>
  ),
};
