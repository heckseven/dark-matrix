import { useId, useState } from 'react';
import { Button } from '../ui/button.js';
import { Input } from '../ui/input.js';
import { Radio } from '../ui/radio.js';
import { Slider } from '../ui/slider.js';
import { ScrubInput } from '../ui/scrub-input.js';
import { TabFrame, TabRow } from './tab-frame.js';

const SENSOR_PATH_RE = /^\/sys\/bus\/iio\/devices\/iio:device\d+\/in_illuminance_raw$/;

export type BrightnessValue = {
  mode: 'sensor' | 'time' | 'manual';
  sensor_path: string;
  multiplier: number;
  offset: number;
  min: number;
  max: number;
  hysteresis: number;
  manual_value: number;
};

const DEFAULTS: BrightnessValue = {
  mode: 'sensor',
  sensor_path: '',
  multiplier: 0.14,
  offset: 7,
  min: 7,
  max: 255,
  hysteresis: 10,
  manual_value: 100,
};

type Props = {
  value: BrightnessValue;
  onChange: (v: BrightnessValue) => void;
};

export function BrightnessTab({ value, onChange }: Props) {
  const uid = useId();
  const [detecting, setDetecting] = useState(false);
  const [detectStatus, setDetectStatus] = useState<'idle' | 'done' | 'failed'>('idle');
  const sensorValid = value.mode === 'sensor' && SENSOR_PATH_RE.test(value.sensor_path);
  const minMaxError = value.min > value.max;
  const minMaxErrorId = `${uid}-minmax-error`;

  async function handleAutodetect() {
    setDetecting(true);
    setDetectStatus('idle');
    try {
      const res = await fetch('/api/sensor-detect');
      if (!res.ok) throw new Error(`sensor-detect: ${res.status}`);
      const body: unknown = await res.json();
      if (
        typeof body === 'object' && body !== null &&
        'ok' in body && (body as Record<string, unknown>)['ok'] === true &&
        'path' in body && typeof (body as Record<string, unknown>)['path'] === 'string' &&
        SENSOR_PATH_RE.test((body as Record<string, unknown>)['path'] as string)
      ) {
        onChange({ ...value, sensor_path: (body as { path: string }).path });
        setDetectStatus('done');
      } else {
        setDetectStatus('failed');
      }
    } catch {
      setDetectStatus('failed');
    } finally {
      setDetecting(false);
    }
  }

  return (
    <TabFrame>

      <TabRow label="mode">
        <div className="flex gap-5">
          {(['sensor', 'time', 'manual'] as const).map(m => (
            <label key={m} className="flex items-center gap-2 cursor-pointer">
              <Radio
                name={`${uid}-mode`}
                value={m}
                checked={value.mode === m}
                onChange={() => onChange({ ...value, mode: m })}
              />
              {m}
            </label>
          ))}
        </div>
      </TabRow>

      {value.mode === 'sensor' && (
        <TabRow label="sensor path">
          <div className="flex flex-col gap-1 w-full">
            <div className="flex gap-2 w-full">
              <Input
                fluid
                value={value.sensor_path}
                onChange={e => onChange({ ...value, sensor_path: e.target.value })}
                placeholder="/sys/bus/iio/devices/iio:device0/in_illuminance_raw"
                aria-label="sensor path"
                spellCheck={false}
              />
              <Button
                variant="ghost"
                onClick={handleAutodetect}
                disabled={detecting}
                aria-label={detecting ? 'detecting sensor path…' : 'autodetect sensor path'}
                aria-busy={detecting}
              >
                {detecting ? '...' : 'detect'}
              </Button>
            </div>
            <span role="status" aria-live="polite" className="sr-only">
              {detectStatus === 'done' ? 'Sensor path detected.' : detectStatus === 'failed' ? 'Sensor path detection failed.' : ''}
            </span>
            {value.sensor_path.length > 0 && (
              <span
                role="status"
                aria-label={sensorValid ? 'valid path' : 'path does not match expected pattern'}
                className={sensorValid ? 'text-green-400' : 'text-red-400'}
              >
                {sensorValid ? '✓ valid path' : '✗ path does not match expected pattern'}
              </span>
            )}
          </div>
        </TabRow>
      )}

      <TabRow label="multiplier">
        <Input
          fluid
          type="number"
          value={value.multiplier}
          min={0}
          max={10}
          step={0.001}
          onChange={e => onChange({ ...value, multiplier: Number(e.target.value) })}
          aria-label="brightness multiplier"
        />
      </TabRow>

      <TabRow label="offset">
        <Slider
          aria-label="brightness offset"
          min={0}
          max={255}
          step={1}
          segments={60}
          value={value.offset}
          onChange={e => onChange({ ...value, offset: Number(e.target.value) })}
        />
      </TabRow>

      <TabRow label="min brightness">
        <Slider
          aria-label="minimum brightness"
          aria-describedby={minMaxError ? minMaxErrorId : undefined}
          min={0}
          max={255}
          step={1}
          segments={60}
          value={value.min}
          onChange={e => onChange({ ...value, min: Number(e.target.value) })}
        />
        {minMaxError && <span id={minMaxErrorId} role="alert" className="font-mono text-xs text-red-400">must be ≤ max</span>}
      </TabRow>

      <TabRow label="max brightness">
        <Slider
          aria-label="maximum brightness"
          aria-describedby={minMaxError ? minMaxErrorId : undefined}
          min={0}
          max={255}
          step={1}
          segments={60}
          value={value.max}
          onChange={e => onChange({ ...value, max: Number(e.target.value) })}
        />
      </TabRow>

      <TabRow label="hysteresis">
        <ScrubInput
          value={value.hysteresis}
          min={0}
          max={255}
          onChange={n => onChange({ ...value, hysteresis: n })}
          aria-label="brightness hysteresis"
          className="w-10 text-center"
          expandedClassName="w-16"
        />
      </TabRow>

      {value.mode === 'manual' && (
        <TabRow label="brightness">
          <Slider
            aria-label="manual brightness"
            min={0}
            max={255}
            step={1}
            segments={60}
            value={value.manual_value}
            onChange={e => onChange({ ...value, manual_value: Number(e.target.value) })}
          />
        </TabRow>
      )}

      <TabRow label="reset">
        <Button variant="ghost" onClick={() => onChange(DEFAULTS)}>reset to defaults</Button>
      </TabRow>

    </TabFrame>
  );
}
