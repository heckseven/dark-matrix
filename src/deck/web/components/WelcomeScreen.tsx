import { useEffect, useState } from 'react';
import { Button } from './ui/button.js';

interface FeatureCheck {
  ffmpeg: boolean;
  wpctl: boolean;
  pwDump: boolean;
  ytDlp: boolean;
  dbusMonitor: boolean;
  claudeLoggedIn: boolean;
}

interface Props {
  daemonOnline: boolean;
  hardwareOnline: boolean;
  onDismiss: () => void;
}

function StatusRow({ ok, label, detail }: { ok: boolean; label: string; detail?: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className={`font-mono text-sm mt-0.5 ${ok ? 'text-green-400' : 'text-amber-400'}`} aria-hidden="true">
        {ok ? '✓' : '○'}
      </span>
      <div>
        <span className="font-mono text-sm">
          {label}
          <span className="sr-only">{ok ? ', ready' : ', not ready'}</span>
        </span>
        {detail && <span className="text-xs text-muted-foreground mt-0.5 block">{detail}</span>}
      </div>
    </div>
  );
}

export function WelcomeScreen({ daemonOnline, hardwareOnline, onDismiss }: Props) {
  const [features, setFeatures] = useState<FeatureCheck | null>(null);
  const [skipping, setSkipping] = useState(false);

  useEffect(() => {
    fetch('/api/feature-check')
      .then(r => r.json() as Promise<Partial<FeatureCheck>>)
      .then(d => ({
        ffmpeg: d.ffmpeg ?? false,
        wpctl: d.wpctl ?? false,
        pwDump: d.pwDump ?? false,
        ytDlp: d.ytDlp ?? false,
        dbusMonitor: d.dbusMonitor ?? false,
        claudeLoggedIn: d.claudeLoggedIn ?? false,
      } satisfies FeatureCheck))
      .then(setFeatures)
      .catch(() => {});
  }, []);

  const handleSkip = async () => {
    setSkipping(true);
    try {
      const cfgRes = await fetch('/api/config');
      if (cfgRes.ok) {
        const { config } = await cfgRes.json() as { config: Record<string, unknown> };
        await fetch('/api/config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...config, uncalibrated: false }),
        });
      }
    } catch { /* best-effort */ }
    onDismiss();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-title"
    >
      <div className="bg-background border border-border rounded-lg w-full max-w-md mx-4 p-6 flex flex-col gap-5">
        <div>
          <h2 id="welcome-title" className="font-mono text-base font-semibold">Setup required</h2>
          <p className="text-xs text-muted-foreground mt-1">
            dark-matrix has not been calibrated yet. Run through the checklist below, then calibrate.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <StatusRow
            ok={daemonOnline}
            label="Daemon reachable"
            {...(daemonOnline ? {} : { detail: 'Start with: systemctl --user start dark-matrix' })}
          />
          <StatusRow
            ok={hardwareOnline}
            label="Hardware detected"
            {...(hardwareOnline ? {} : { detail: 'Check USB connections and dialout group membership' })}
          />
          <StatusRow
            ok={false}
            label="Calibration pending"
            detail="Run: dark-matrix calibrate"
          />
        </div>

        {features && (
          <div>
            <p className="font-mono text-xs text-muted-foreground mb-2">Optional packages</p>
            <div className="flex flex-col gap-2">
              <StatusRow
                ok={features.claudeLoggedIn}
                label="claude login"
                {...(features.claudeLoggedIn ? {} : { detail: 'Run: claude login (enables usage/reset-time widget)' })}
              />
              <StatusRow ok={features.ffmpeg}     label="ffmpeg"       detail="audio pipeline" />
              <StatusRow ok={features.wpctl}      label="wpctl"        detail="audio source selection (wireplumber)" />
              <StatusRow ok={features.pwDump}     label="pw-dump"      detail="audio device enumeration (pipewire-utils)" />
              <StatusRow ok={features.ytDlp}      label="yt-dlp"       detail="video download" />
              <StatusRow ok={features.dbusMonitor} label="dbus-monitor" detail="desktop notifications" />
            </div>
          </div>
        )}

        <div className="flex items-center justify-end pt-1">
          <Button variant="ghost" onClick={() => void handleSkip()} disabled={skipping}>
            skip
          </Button>
        </div>
      </div>
    </div>
  );
}
