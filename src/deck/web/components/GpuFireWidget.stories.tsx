import { useEffect, useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { MatrixPreview } from './MatrixPreview.js';
import { createDataRenderer } from '../../../animations/data-renderers.js';

function toB64(buf: Uint8Array): string {
  return btoa(Array.from(buf, b => String.fromCharCode(b)).join(''));
}

function Slider({ label, min, max, value, onChange, unit }: {
  label: string; min: number; max: number; value: number;
  onChange: (v: number) => void; unit?: string;
}) {
  const id = label.toLowerCase().replace(/\s+/g, '-');
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontFamily: 'monospace', fontSize: 11, color: '#aaa' }}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="range" min={min} max={max} value={value}
        aria-valuetext={`${value}${unit ?? ''}`}
        aria-describedby={`${id}-val`}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: 110 }}
      />
      <span
        id={`${id}-val`}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        style={{ color: '#ccc', minWidth: 36 }}
      >
        {value}{unit ?? ''}
      </span>
    </div>
  );
}

function GpuFireWidget({ initLoad = 60, initTemp = 72 }: { initLoad?: number; initTemp?: number }) {
  const [loadPct, setLoadPct] = useState(initLoad);
  const [tempC, setTempC]     = useState(initTemp);

  const loadRef = useRef(loadPct);
  const tempRef = useRef(tempC);
  loadRef.current = loadPct;
  tempRef.current = tempC;

  const renderer = useRef(createDataRenderer({ style: 'gpuburn' }));

  const [pixels, setPixels] = useState(() => {
    const r = renderer.current;
    r.update({ cpuPct: 0, ramPct: 0, netRxBps: 0, netTxBps: 0, gpuPct: initLoad, gpuTempC: initTemp });
    return toB64(r.render());
  });

  useEffect(() => {
    const r = renderer.current;
    const id = setInterval(() => {
      r.update({ cpuPct: 0, ramPct: 0, netRxBps: 0, netTxBps: 0, gpuPct: loadRef.current, gpuTempC: tempRef.current });
      setPixels(toB64(r.render()));
    }, 50);
    return () => clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, alignItems: 'center' }}>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', justifyContent: 'center' }}>
        <Slider label="gpu load" min={0} max={100} value={loadPct} onChange={setLoadPct} unit="%" />
        <Slider label="temp"     min={0} max={150} value={tempC}   onChange={setTempC}   unit="°" />
      </div>
      <MatrixPreview pixels={pixels} width={9} />
    </div>
  );
}

const meta = {
  title: 'App/HUD/GpuFireWidget',
  parameters: {
    layout: 'centered',
    backgrounds: { default: 'dark' },
    docs: {
      description: {
        component:
          'GPU/dGPU usage widget. Three hotspot columns (1, 4, 7) run hotter than the gaps, ' +
          'creating distinct flame tongues that merge into a single blaze at high load. ' +
          'DOOM-style heat-diffusion CA with stochastic rendering. ' +
          'Temperature (top) uses 2×5 digit glyphs: hundreds (blank <100°), tens, ones.',
      },
    },
  },
  argTypes: {
    initLoad: { control: { type: 'range', min: 0, max: 100 }, description: 'Initial GPU load %' },
    initTemp: { control: { type: 'range', min: 0, max: 150 }, description: 'Initial temperature °C' },
  },
  component: GpuFireWidget,
} satisfies Meta<typeof GpuFireWidget>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Live widget — use the sliders to explore load levels and temperatures. */
export const Live: Story = {
  args: { initLoad: 60, initTemp: 72 },
};

/** Idle (~10% load, 42°C) — three faint sparks, minimal fire. */
export const Idle: Story = {
  args: { initLoad: 10, initTemp: 42 },
};

/** Medium load (55%, 72°C) — distinct flame tongues visible at the hotspot columns. */
export const Medium: Story = {
  args: { initLoad: 55, initTemp: 72 },
};

/** Full blaze (100%, 94°C) — tongues merge, fire reaches the temperature digits. */
export const FullBlaze: Story = {
  args: { initLoad: 100, initTemp: 94 },
};
