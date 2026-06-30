import { spawn } from 'node:child_process';
import process from 'node:process';

export type DesktopNotification = {
  appName: string;
  summary: string;
  body: string;
};

export type ParseState = {
  inNotify: boolean;
  argIdx: number;
  appName: string;
  summary: string;
};

export function makeParseState(): ParseState {
  return { inNotify: false, argIdx: 0, appName: '', summary: '' };
}

// Process one line of dbus-monitor output. Returns a completed notification or null.
export function parseDbusMonitorLine(line: string, state: ParseState): DesktopNotification | null {
  if (line.includes('member=Notify')) {
    state.inNotify = true;
    state.argIdx = 0;
    state.appName = '';
    state.summary = '';
    return null;
  }

  if (!state.inNotify) return null;

  if (/^\s+array\s+\[/.test(line)) {
    state.inNotify = false;
    return null;
  }

  const strM = /^\s+string\s+"(.*)"\s*$/.exec(line);
  const isUint32 = /^\s+uint32\s+/.test(line);

  if (strM) {
    const val = strM[1]!;
    // Notify args: 0=app_name, 1=replaces_id(uint32), 2=icon, 3=summary, 4=body
    switch (state.argIdx) {
      case 0: state.appName = val; break;
      case 3: state.summary = val; break;
      case 4:
        state.inNotify = false;
        return { appName: state.appName, summary: state.summary, body: val };
    }
    state.argIdx++;
  } else if (isUint32) {
    state.argIdx++;
  }

  return null;
}

export function watchDesktopNotifications(
  onNotification: (n: DesktopNotification) => void,
  opts?: { bin?: string },
): () => void {
  const bin = opts?.bin ?? 'dbus-monitor';
  let stopped = false;
  let proc: ReturnType<typeof spawn> | null = null;

  function start() {
    if (stopped) return;

    // Ensure dbus-monitor can find the session bus under systemd user services.
    const env: NodeJS.ProcessEnv = { ...process.env };
    if (!env['DBUS_SESSION_BUS_ADDRESS'] && env['XDG_RUNTIME_DIR']) {
      env['DBUS_SESSION_BUS_ADDRESS'] = `unix:path=${env['XDG_RUNTIME_DIR']}/bus`;
    }

    proc = spawn(
      bin,
      ['--session', "type='method_call',interface='org.freedesktop.Notifications',member='Notify'"],
      { shell: false, env },
    );

    let lineBuf = '';
    const state = makeParseState();

    proc.stdout?.on('data', (chunk: Buffer) => {
      lineBuf += chunk.toString();
      const lines = lineBuf.split('\n');
      lineBuf = lines.pop() ?? '';
      for (const line of lines) {
        const n = parseDbusMonitorLine(line, state);
        if (n) onNotification(n);
      }
    });

    proc.stderr?.on('data', () => {});

    proc.on('close', () => {
      proc = null;
      if (!stopped) setTimeout(start, 3000);
    });

    proc.on('error', (err: NodeJS.ErrnoException) => {
      proc = null;
      if (err.code === 'ENOENT') {
        // The binary isn't installed — respawning every 5s forever is pointless
        // log spam. Disable the watcher instead (L24).
        stopped = true;
        process.stderr.write(`dark-matrix: ${bin} not found; desktop notifications disabled\n`);
        return;
      }
      if (!stopped) setTimeout(start, 5000);
    });
  }

  start();

  return () => {
    stopped = true;
    proc?.kill('SIGTERM');
    proc = null;
  };
}
