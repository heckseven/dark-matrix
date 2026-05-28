import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';

mkdirSync('dist/bundles', { recursive: true });

const shared = {
  bundle: true,
  platform: 'node',
  format: 'esm',
  external: ['serialport', '@serialport/*', 'sharp', '@img/sharp-*'],
};

await build({ ...shared, entryPoints: ['dist/daemon/index.js'], outfile: 'dist/bundles/daemon.js' });
await build({ ...shared, entryPoints: ['dist/cli/index.js'],    outfile: 'dist/bundles/cli.js' });

console.log('Bundles written to dist/bundles/');
