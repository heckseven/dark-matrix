import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { Container } from './container';
import { Text } from './text';

const meta = {
  title: 'Layout/Container',
  component: Container,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: [
          'Centers content horizontally with a max-width constraint and symmetric horizontal padding.',
          '',
          '**Usage**',
          '- `size` maps to viewport breakpoints: `sm` 640px · `md` 768px · `lg` 1024px (default) · `xl` 1280px.',
          '- Use `full` to preserve centering behavior without a width cap.',
          '- Use `as` to set the semantic element — prefer `main`, `section`, or `article` at page level.',
        ].join('\n'),
      },
    },
  },
  argTypes: {
    as: {
      control: 'select',
      options: ['div', 'section', 'main', 'article', 'header', 'footer', 'nav'],
      description: 'Rendered HTML element.',
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg', 'xl', 'full'],
      description: 'Max-width constraint.',
    },
    children: { control: false, description: 'Content.' },
  },
} satisfies Meta<typeof Container>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Max-width and element configurable via controls. */
export const Playground: Story = {
  args: { size: 'lg' },
  render: (args) => (
    <Container {...args} className="border border-dashed border-border py-3">
      <Text variant="muted">Container · size={args.size}</Text>
    </Container>
  ),
};

export const AllSizes: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      {(['sm', 'md', 'lg', 'xl', 'full'] as const).map((size) => (
        <Container key={size} size={size} className="border border-dashed border-border py-2">
          <Text variant="muted">{size}</Text>
        </Container>
      ))}
    </div>
  ),
};
