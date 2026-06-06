import { build } from 'esbuild';
import { mkdirSync, cpSync, readFileSync, writeFileSync } from 'node:fs';

mkdirSync('dist/bundles', { recursive: true });

// Ship the curated starter designs alongside the deck web assets. The deck
// server resolves them at dist/deck/builtins (sibling of dist/deck/web).
cpSync('src/deck/builtins', 'dist/deck/builtins', { recursive: true });

// Single source of truth for runtime node_modules.
//
// These packages are intentionally NOT bundled — they are loaded from
// node_modules at runtime (serialport/sharp via ESM `import`; ws/fft.js via
// `createRequire(...)` because esbuild leaves createRequire calls as runtime
// requires). The release tarball must therefore ship them. `runtime-deps.json`
// is consumed by .github/workflows/release.yml to build the runtime
// package.json, so this list and the shipped node_modules can never drift.
const runtimeDeps = ['serialport', 'sharp', 'ws', 'fft.js'];

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const runtimeVersions = Object.fromEntries(
  runtimeDeps.map((name) => {
    const version = pkg.dependencies?.[name];
    if (!version) throw new Error(`runtime dep "${name}" missing from package.json dependencies`);
    return [name, version];
  }),
);
writeFileSync('dist/bundles/runtime-deps.json', JSON.stringify(runtimeVersions, null, 2) + '\n');

const shared = {
  bundle: true,
  platform: 'node',
  format: 'esm',
  // Keep runtime deps (and their native sub-packages) out of the bundle.
  external: [...runtimeDeps, '@serialport/*', '@img/sharp-*'],
};

await build({ ...shared, entryPoints: ['dist/daemon/index.js'], outfile: 'dist/bundles/daemon.js' });
await build({ ...shared, entryPoints: ['dist/cli/index.js'],    outfile: 'dist/bundles/cli.js' });

console.log('Bundles written to dist/bundles/');
