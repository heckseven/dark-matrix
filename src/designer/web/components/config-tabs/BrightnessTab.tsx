import { useId } from 'react';
import { Input } from '../ui/input.js';
import { Radio } from '../ui/radio.js';
import { Slider } from '../ui/slider.js';
import { ScrubInput } from '../ui/scrub-input.js';

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

type Props = {
  value: BrightnessValue;
  onChange: (v: BrightnessValue) => void;
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 py-1">
      <span className="w-28 shrink-0 font-mono text-xs text-foreground/70">{label}</span>
      <div className="flex items-center gap-2 flex-1 min-w-0">{children}</div>
    </div>
  );
}

export function BrightnessTab({ value, onChange }: Props) {
  const uid = useId();
  const sensorValid = value.mode === 'sensor' && SENSOR_PATH_RE.test(value.sensor_path);
  const minMaxError = value.min > value.max;
  const minMaxErrorId = `${uid}-minmax-error`;

  return (
    <div className="font-mono text-xs flex flex-col">

      {/* mode */}
      <Row label="mode">
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
      </Row>

      {/* sensor_path — only when mode === 'sensor' */}
      {value.mode === 'sensor' && (
        <Row label="sensor path">
          <div className="flex flex-col gap-1">
            <Input
              value={value.sensor_path}
              expandedClassName="w-96"
              onChange={e => onChange({ ...value, sensor_path: e.target.value })}
              placeholder="/sys/bus/iio/devices/iio:device0/in_illuminance_raw"
              aria-label="sensor path"
              spellCheck={false}
            />
            {value.sensor_path.length > 0 && (
              <span
                role="status"
                aria-label={sensorValid ? 'valid path' : 'path does not match expected pattern'}
                className={`text-xs ${sensorValid ? 'text-green-400' : 'text-red-400'}`}
              >
                {sensorValid ? '✓ valid path' : '✗ path does not match expected pattern'}
              </span>
            )}
          </div>
        </Row>
      )}

      {/* multiplier */}
      <Row label="multiplier">
        <Input
          type="number"
          value={value.multiplier}
          min={0}
          max={10}
          step={0.001}
          onChange={e => onChange({ ...value, multiplier: Number(e.target.value) })}
          aria-label="brightness multiplier"
        />
      </Row>

      {/* offset */}
      <Row label="offset">
        <Slider
          aria-label="brightness offset"
          min={0}
          max={255}
          step={1}
          size={40}
          value={value.offset}
          onChange={e => onChange({ ...value, offset: Number(e.target.value) })}
        />
      </Row>

      {/* min */}
      <Row label="min brightness">
        <Slider
          aria-label="minimum brightness"
          aria-describedby={minMaxErrorId}
          min={0}
          max={255}
          step={1}
          size={40}
          value={value.min}
          onChange={e => onChange({ ...value, min: Number(e.target.value) })}
        />
        {minMaxError && <span id={minMaxErrorId} role="alert" className="text-red-400 text-xs">must be ≤ max</span>}
      </Row>

      {/* max */}
      <Row label="max brightness">
        <Slider
          aria-label="maximum brightness"
          aria-describedby={minMaxErrorId}
          min={0}
          max={255}
          step={1}
          size={40}
          value={value.max}
          onChange={e => onChange({ ...value, max: Number(e.target.value) })}
        />
      </Row>

      {/* hysteresis */}
      <Row label="hysteresis">
        <ScrubInput
          value={value.hysteresis}
          min={0}
          max={255}
          onChange={n => onChange({ ...value, hysteresis: n })}
          aria-label="brightness hysteresis"
          className="w-10 text-center"
          expandedClassName="w-16"
        />
      </Row>

      {/* manual_value — only when mode === 'manual' */}
      {value.mode === 'manual' && (
        <Row label="brightness">
          <Slider
            aria-label="manual brightness"
            min={0}
            max={255}
            step={1}
            size={40}
            value={value.manual_value}
            onChange={e => onChange({ ...value, manual_value: Number(e.target.value) })}
          />
        </Row>
      )}

    </div>
  );
}
