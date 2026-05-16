import { useId } from 'react';

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
      <span className="w-32 shrink-0 text-foreground/70">{label}</span>
      <div className="flex-1 flex items-center gap-2">{children}</div>
    </div>
  );
}

export function BrightnessTab({ value, onChange }: Props) {
  const uid = useId();
  const sensorValid = SENSOR_PATH_RE.test(value.sensor_path);
  const minMaxError = value.min > value.max;

  return (
    <div className="font-mono text-xs flex flex-col">

      {/* mode */}
      <Row label="mode">
        {(['sensor', 'time', 'manual'] as const).map(m => (
          <label key={m} className="flex items-center gap-1 cursor-pointer">
            <input
              type="radio"
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
          <div className="flex-1 flex flex-col gap-1">
            <input
              type="text"
              className={`w-full bg-transparent border rounded px-1 py-0.5 font-mono text-xs outline-none ${
                sensorValid ? 'border-foreground/30' : 'border-red-400'
              }`}
              value={value.sensor_path}
              onChange={e => onChange({ ...value, sensor_path: e.target.value })}
              placeholder="/sys/bus/iio/devices/iio:device0/in_illuminance_raw"
            />
            <span className="text-foreground/50">
              e.g. /sys/bus/iio/devices/iio:device0/in_illuminance_raw
            </span>
            {!sensorValid && (
              <span className="text-red-400">path does not match expected pattern</span>
            )}
          </div>
        </Row>
      )}

      {/* multiplier */}
      <Row label="multiplier">
        <input
          type="number"
          className="bg-transparent border border-foreground/30 rounded px-1 py-0.5 font-mono text-xs w-24 outline-none"
          min={0}
          max={10}
          step={0.001}
          value={value.multiplier}
          onChange={e => onChange({ ...value, multiplier: Number(e.target.value) })}
        />
      </Row>

      {/* offset */}
      <Row label={`offset: ${value.offset}`}>
        <input
          type="range"
          className="flex-1"
          min={0}
          max={255}
          step={1}
          value={value.offset}
          onChange={e => onChange({ ...value, offset: Number(e.target.value) })}
        />
      </Row>

      {/* min */}
      <Row label={`min brightness: ${value.min}`}>
        <input
          type="range"
          className="flex-1"
          min={0}
          max={255}
          step={1}
          value={value.min}
          onChange={e => onChange({ ...value, min: Number(e.target.value) })}
        />
      </Row>

      {/* min > max error */}
      {minMaxError && (
        <div className="text-red-400 text-xs pl-36 py-0.5">min must be ≤ max</div>
      )}

      {/* max */}
      <Row label={`max brightness: ${value.max}`}>
        <input
          type="range"
          className="flex-1"
          min={0}
          max={255}
          step={1}
          value={value.max}
          onChange={e => onChange({ ...value, max: Number(e.target.value) })}
        />
      </Row>

      {/* hysteresis */}
      <Row label="hysteresis">
        <input
          type="number"
          className="bg-transparent border border-foreground/30 rounded px-1 py-0.5 font-mono text-xs w-24 outline-none"
          min={0}
          step={1}
          value={value.hysteresis}
          onChange={e => onChange({ ...value, hysteresis: Number(e.target.value) })}
        />
      </Row>

      {/* manual_value — only when mode === 'manual' */}
      {value.mode === 'manual' && (
        <Row label={`brightness: ${value.manual_value}`}>
          <input
            type="range"
            className="flex-1"
            min={0}
            max={255}
            step={1}
            value={value.manual_value}
            onChange={e => onChange({ ...value, manual_value: Number(e.target.value) })}
          />
        </Row>
      )}

    </div>
  );
}
