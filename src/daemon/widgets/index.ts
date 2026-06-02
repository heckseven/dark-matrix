import type { HudWidget } from '../../deck/web/types/hud-preset.js';
import type { DaemonWidgetDescriptor } from './types.js';
import { clockDaemonDescriptor } from './clock.js';
import { timerDaemonDescriptor } from './timer.js';
import { dataDescriptor as dataDaemonDescriptor } from './data.js';
import { audioDaemonDescriptor } from './audio.js';
import { imageDaemonDescriptor } from './image.js';
import { lifeDaemonDescriptor } from './life.js';
import { claudeDaemonDescriptor } from './claude.js';
import { zenDaemonDescriptor } from './zen.js';
import { textDaemonDescriptor } from './text.js';

export type DaemonWidgetRegistry = {
  [K in HudWidget['widget']]: DaemonWidgetDescriptor<Extract<HudWidget, { widget: K }>>;
};

export const DAEMON_WIDGET_REGISTRY: DaemonWidgetRegistry = {
  clock: clockDaemonDescriptor,
  timer: timerDaemonDescriptor,
  data: dataDaemonDescriptor,
  audio: audioDaemonDescriptor,
  image: imageDaemonDescriptor,
  life: lifeDaemonDescriptor,
  claude: claudeDaemonDescriptor,
  zen: zenDaemonDescriptor,
  text: textDaemonDescriptor,
};
