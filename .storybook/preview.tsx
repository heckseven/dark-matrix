import type { Preview } from '@storybook/tanstack-react'
import { themes } from 'storybook/theming'
import '../src/designer/web/globals.css'

const preview: Preview = {
  tags: ['!autodocs'],
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
      test: 'todo'
    }
  },
};

export default preview;