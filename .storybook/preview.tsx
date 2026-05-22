import type { Preview } from '@storybook/tanstack-react'
import { themes } from 'storybook/theming'
import { TooltipProvider } from '../src/designer/web/components/ui/tooltip.js'
import '../src/designer/web/globals.css'

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
      return <TooltipProvider><Story args={{ ...context.args, dualModule }} /></TooltipProvider>;
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