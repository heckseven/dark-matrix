import type { Meta, StoryObj } from '@storybook/tanstack-react';
import { ChatMessageList, type ChatMessage } from './ChatFeed.js';

let _id = 0;
function msg(overrides: Partial<ChatMessage>): ChatMessage {
  return { id: `s${++_id}`, type: 'chat', username: '', tokens: [], ...overrides };
}
function text(value: string) { return [{ type: 'text' as const, value }]; }

const SAMPLE_CHAT: ChatMessage[] = [
  msg({ username: 'moonbeam', color: '#FF6B6B', tokens: text('hello everyone!') }),
  msg({ username: 'codecraft', tokens: text('PogChamp that was sick') }),
  msg({ username: 'zephyr_x', color: '#4ECDC4', tokens: text('how long have you been streaming?') }),
  msg({ type: 'event', symbol: '+',  tokens: text('moonbeam followed') }),
  msg({ username: 'velvet',   color: '#A8E063', tokens: text('lol nice') }),
  msg({ type: 'event', symbol: '++', tokens: text('codecraft subscribed') }),
  msg({ username: 'pixel9',   tokens: text('gg') }),
  msg({ type: 'event', symbol: '$',  tokens: text('velvet cheered 100 bits') }),
  msg({ username: 'nightowl', color: '#F7DC6F', tokens: text('this is amazing') }),
  msg({ type: 'event', symbol: '>>', tokens: text('streampal raided with 42 viewers') }),
  msg({ username: 'zephyr_x', color: '#4ECDC4', tokens: text('welcome raiders!!') }),
  msg({ username: 'moonbeam', color: '#FF6B6B', tokens: text('PogChamp') }),
];

const EVENTS_ONLY: ChatMessage[] = [
  msg({ type: 'event', symbol: '+',  tokens: text('alice followed') }),
  msg({ type: 'event', symbol: '++', tokens: text('bob subscribed') }),
  msg({ type: 'event', symbol: '$',  tokens: text('carol cheered 500 bits') }),
  msg({ type: 'event', symbol: '>>', tokens: text('davestream raided with 250 viewers') }),
];

const meta = {
  title: 'Cast/ChatMessageList',
  component: ChatMessageList,
  decorators: [
    (Story) => (
      <div className="bg-background text-foreground font-mono text-xs p-2 w-[40ch] h-[400px] overflow-y-auto flex flex-col gap-0.5">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ChatMessageList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Mixed: Story = {
  args: { messages: SAMPLE_CHAT },
};

export const EventsOnly: Story = {
  args: { messages: EVENTS_ONLY },
};

export const ChatOnly: Story = {
  args: {
    messages: SAMPLE_CHAT.filter(m => m.type === 'chat'),
  },
};
