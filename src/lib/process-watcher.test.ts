import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readProcessCmdlines } from './process-watcher.js';

let root: string;

async function writeProc(pid: string, argv: string[]): Promise<void> {
  const dir = path.join(root, pid);
  await fs.mkdir(dir, { recursive: true });
  // /proc/<pid>/cmdline is NUL-separated with a trailing NUL.
  await fs.writeFile(path.join(dir, 'cmdline'), argv.join('\0') + (argv.length ? '\0' : ''));
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'proc-watch-'));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe('readProcessCmdlines', () => {
  it('joins NUL-separated argv into a single command line', async () => {
    await writeProc('101', ['/usr/lib/jvm/java', '-cp', 'bitwig.jar', 'com.bitwig.Main']);
    const lines = await readProcessCmdlines(root);
    expect(lines).toContain('/usr/lib/jvm/java -cp bitwig.jar com.bitwig.Main');
  });

  it('ignores non-numeric entries and kernel threads (empty cmdline)', async () => {
    await writeProc('202', ['/usr/bin/foo']);
    await writeProc('303', []); // kernel thread — empty cmdline
    await fs.mkdir(path.join(root, 'self'), { recursive: true }); // non-numeric dir
    const lines = await readProcessCmdlines(root);
    expect(lines).toEqual(['/usr/bin/foo']);
  });

  it('returns an empty list when the proc root is unreadable', async () => {
    expect(await readProcessCmdlines(path.join(root, 'does-not-exist'))).toEqual([]);
  });
});
