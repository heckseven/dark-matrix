import { useEffect, useRef, useState } from 'react';
import type { CastColumn } from '../types/config-types.js';
import { subscribeCastChat, type ChatMessage, type Token } from '../twitch-chat.js';
import { Button } from './ui/button.js';
import { useDeckStore } from '../store.js';

// How close to the bottom (px) still counts as "pinned" — within this slack the
// feed auto-scrolls; beyond it the user is considered to have scrolled up.
const BOTTOM_SLACK = 32;

// Re-exported for consumers (e.g. stories) that import these from ChatFeed.
export type { ChatMessage, Token } from '../twitch-chat.js';

export function ChatMessageList({ messages }: { messages: ChatMessage[] }) {
  return (
    <>
      {messages.map(msg => (
        <div key={msg.id} className="flex gap-1 items-baseline">
          {msg.type === 'event' ? (
            <>
              <span className="sr-only">Event: </span>
              <span className="text-primary font-bold select-none flex-shrink-0" aria-hidden="true">{msg.symbol}</span>
              <span className="text-primary"><Tokens tokens={msg.tokens} /></span>
            </>
          ) : (
            <>
              {msg.username && (
                <span style={msg.color ? { color: msg.color } : undefined} className="font-bold">
                  {msg.username}
                  <span className="text-primary font-normal">: </span>
                </span>
              )}
              <Tokens tokens={msg.tokens} />
            </>
          )}
        </div>
      ))}
    </>
  );
}

function Tokens({ tokens }: { tokens: Token[] }) {
  return (
    <>
      {tokens.map((tok, i) =>
        tok.type === 'emote' ? (
          <img
            key={`e:${tok.id}:${i}`}
            src={`https://static-cdn.jtvnw.net/emoticons/v2/${tok.id}/default/dark/1.0`}
            alt={tok.name}
            title={tok.name}
            height={18}
            width={18}
            className="inline-block align-middle"
          />
        ) : (
          <span key={`t:${i}:${tok.value.slice(0, 8)}`}>{tok.value}</span>
        )
      )}
    </>
  );
}

export const CAST_CHAT_FONT_SIZE_DEFAULT = 12;
export const CAST_CHAT_FONT_SIZE_MIN = 10;
export const CAST_CHAT_FONT_SIZE_MAX = 40;

function TwitchFeed({ channel }: { channel: string }) {
  const fontSize = useDeckStore(s => s.configData?.cast_chat_font_size ?? CAST_CHAT_FONT_SIZE_DEFAULT);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasNew, setHasNew] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Mirror of "pinned to bottom" read inside the message effect without re-running
  // it on every scroll. Starts pinned so the feed opens at the latest message.
  const atBottomRef = useRef(true);
  // Track the last message by id, not array length: the buffer is a fixed-size
  // ring, so length stays flat once full even as new messages arrive.
  const prevLastIdRef = useRef<string | null>(null);

  // Subscribe to the module-level manager. The buffer and IRC connection live
  // outside this component, so they survive unmount/remount across mode flips.
  useEffect(() => subscribeCastChat(channel, setMessages), [channel]);

  // On new messages: stick to the bottom if pinned, otherwise flag that there
  // are unseen messages below so the jump-to-latest button appears.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const lastId = messages.length ? messages[messages.length - 1]!.id : null;
    const grew = lastId !== null && lastId !== prevLastIdRef.current;
    prevLastIdRef.current = lastId;
    if (atBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    } else if (grew) {
      setHasNew(true);
    }
  }, [messages]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_SLACK;
    atBottomRef.current = atBottom;
    if (atBottom) setHasNew(false);
  }

  function jumpToLatest() {
    const el = scrollRef.current;
    if (!el) return;
    // Instant snap (not smooth) so the scroll listener can't observe an
    // intermediate position and momentarily re-show the button mid-animation.
    el.scrollTop = el.scrollHeight;
    atBottomRef.current = true;
    setHasNew(false);
    el.focus(); // keep focus in the revealed log rather than dropping to <body>
  }

  return (
    <div className="relative flex-1 flex flex-col min-h-0">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        tabIndex={-1}
        role="log"
        aria-label={`${channel} chat`}
        className="flex-1 overflow-y-auto font-mono px-4 py-2 flex flex-col gap-0.5 min-h-0 focus-visible:outline-none"
        style={{ fontSize: `${fontSize}px` }}
      >
        <ChatMessageList messages={messages} />
      </div>
      {hasNew && (
        <Button
          variant="primary"
          size="sm"
          onClick={jumpToLatest}
          className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 shadow"
        >
          <span aria-hidden="true">↓</span> new messages
        </Button>
      )}
    </div>
  );
}

export function ChatFeed({ column }: { column: CastColumn }) {
  if (column.provider === 'twitch') {
    return <TwitchFeed channel={column.channel} />;
  }
  return (
    <div className="flex-1 flex items-center justify-center font-mono text-xs text-primary">
      unknown provider
    </div>
  );
}
