import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const dirname = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));

// More info at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/lib/**'],
      exclude: ['src/**/*.test.ts']
    },
    projects: [{
      extends: true,
      test: {
        include: ['src/**/*.test.ts']
      }
    }, {
      extends: true,
      plugins: [
        react(),
        tailwindcss(),
        storybookTest({
          configDir: path.join(dirname, '.storybook')
        })
      ],
      resolve: {
        alias: { '@': path.resolve(dirname, 'src') },
      },
      test: {
        name: 'storybook',
        browser: {
          enabled: true,
          headless: true,
          provider: 'playwright',
          instances: [{
            browser: 'chromium'
          }]
        }
      }
    }]
  }
});
