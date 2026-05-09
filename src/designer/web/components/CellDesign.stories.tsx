import type React from 'react';
import type { Meta, StoryObj } from '@storybook/tanstack-react';

// Minimum luminance so the asterisk never goes fully black (LEDs are never
// truly off — they retain a faint glow at zero power).
const MIN_L = 48;

function Cell({ value, isHovered = false, isFocused = false }: {
  value: number;
  isHovered?: boolean;
  isFocused?: boolean;
}) {
  const l = Math.round(MIN_L + (value / 255) * (255 - MIN_L));
  const boosted = Math.min(255, l + 60);
  const color = `rgb(${isHovered ? boosted : l},${isHovered ? boosted : l},${isHovered ? boosted : l})`;

  const corner: React.CSSProperties = { position: 'absolute', width: 4, height: 4 };
  const g = '#4ade80';

  return (
    <div
      style={{
        position: 'relative',
        width: 20,
        height: 20,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: isHovered ? 'rgba(255,255,255,0.06)' : 'black',
      }}
    >
      {isFocused && <>
        <span style={{ ...corner, top: 1, left: 1,    borderTop: `1px solid ${g}`, borderLeft:  `1px solid ${g}` }} />
        <span style={{ ...corner, top: 1, right: 1,   borderTop: `1px solid ${g}`, borderRight: `1px solid ${g}` }} />
        <span style={{ ...corner, bottom: 1, left: 1,  borderBottom: `1px solid ${g}`, borderLeft:  `1px solid ${g}` }} />
        <span style={{ ...corner, bottom: 1, right: 1, borderBottom: `1px solid ${g}`, borderRight: `1px solid ${g}` }} />
      </>}
      <span style={{ fontSize: 14, lineHeight: 1, color, fontFamily: 'monospace', userSelect: 'none' }}>
        {value === 0 ? '•' : '∗'}
      </span>
    </div>
  );
}

const meta = {
  title: 'Design/Cell',
  component: Cell,
  tags: ['autodocs'],
  parameters: {
    backgrounds: { default: 'dark' },
    docs: {
      description: {
        component: 'Single pixel cell design. Value 0–255 maps to asterisk luminance; never fully black.',
      },
    },
  },
  argTypes: {
    value: { control: { type: 'range', min: 0, max: 255, step: 1 }, description: 'Pixel brightness (0–255).' },
    isHovered: { control: 'boolean', description: 'Mouse hover state.' },
    isFocused: { control: 'boolean', description: 'Keyboard focus cursor state.' },
  },
  args: { value: 128, isHovered: false, isFocused: false },
} satisfies Meta<typeof Cell>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Drag the value control to preview any brightness. */
export const Playground: Story = {};

export const Off: Story = { args: { value: 0 } };
export const Half: Story = { args: { value: 128 } };
export const Full: Story = { args: { value: 255 } };

/** Mouse over — character brightens, faint background tint. */
export const Hovered: Story = { args: { value: 0, isHovered: true } };

/** Keyboard focus cursor — inset ring, no background change. */
export const Focused: Story = { args: { value: 0, isFocused: true } };
