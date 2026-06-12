import type { Preview } from '@storybook/react-vite'
import { themes } from 'storybook/theming'
import { TooltipProvider } from '../src/deck/web/components/ui/tooltip.js'
import '../src/deck/web/globals.css'

// The app fetches /api/* from the daemon at runtime. In Storybook there is no
// daemon, so Vite's SPA fallback returns HTML with 200 OK — which makes r.json()
// throw a SyntaxError. Return a proper 503 JSON response instead so that
// components' !r.ok branches fire cleanly and no parse error is thrown.
if (!(globalThis as Record<string, unknown>)['__storybookFetchPatched']) {
  (globalThis as Record<string, unknown>)['__storybookFetchPatched'] = true;
  const _fetch = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input
      : input instanceof URL ? input.href
      : (input instanceof Request ? input.url : '');
    if (url.startsWith('/api/')) {
      return Promise.resolve(new Response(
        JSON.stringify({ ok: false, error: 'storybook: daemon not running' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } },
      ));
    }
    return _fetch(input, init);
  }) as typeof fetch;
}

const preview: Preview = {
  tags: ['!autodocs'],

  globalTypes: {
    modules: {
      name: 'Modules',
      description: 'Number of connected LED matrix modules',
      defaultValue: 'dual',
      toolbar: {
        icon: 'grid',
        items: [
          { value: 'single', title: '1 module' },
          { value: 'dual',   title: '2 modules' },
        ],
        showName: true,
        dynamicTitle: true,
      },
    },
  },

  decorators: [
    (Story, context) => {
      const dualModule = context.globals['modules'] !== 'single';
      const extraArgs = 'dualModule' in context.argTypes ? { dualModule } : {};
      return <TooltipProvider><Story args={{ ...context.args, ...extraArgs }} /></TooltipProvider>;
    },
  ],
  parameters: {
    controls: {
      matchers: {
       color: /(background|color)$/i,
       date: /Date$/i,
      },
    },

    backgrounds: {
      default: 'app',
      values: [{ name: 'app', value: '#000000' }],
    },

    docs: {
      theme: themes.dark,
    },

    a11y: {
      // 'todo' - show a11y violations in the test UI only
      // 'error' - fail CI on a11y violations
      // 'off' - skip a11y checks entirely
      test: 'error',
      config: {
        rules: [
          // stories render without page-level landmark structure — not a component concern
          { id: 'region', enabled: false },
        ],
      },
    },

    options: {
      storySort: {
        method: 'alphabetical',
      },
    },
  },
};

export default preview;