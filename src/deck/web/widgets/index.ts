import type { HudWidget } from '../types/hud-preset.js';
import type { BrowserWidgetDescriptor } from './types.js';
import { clockDescriptor } from './clock.js';
import { timerDescriptor } from './timer.js';
import { dataDescriptor } from './data.js';
import { audioDescriptor } from './audio.js';
import { imageDescriptor } from './image.js';
import { lifeDescriptor } from './life.js';
import { claudeDescriptor } from './claude.js';
import { zenWidget } from './zen.js';
import { textDescriptor } from './text.js';

export type BrowserWidgetRegistry = {
  [K in HudWidget['widget']]: BrowserWidgetDescriptor<Extract<HudWidget, { widget: K }>>;
};

export const BROWSER_WIDGET_REGISTRY: BrowserWidgetRegistry = {
  clock: clockDescriptor,
  timer: timerDescriptor,
  data: dataDescriptor,
  audio: audioDescriptor,
  image: imageDescriptor,
  life: lifeDescriptor,
  claude: claudeDescriptor,
  zen: zenWidget,
  text: textDescriptor,
};
