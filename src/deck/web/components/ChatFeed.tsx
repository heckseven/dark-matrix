import { useEffect, useRef, useState } from 'react';
import type { CastColumn } from '../types/config-types.js';
import { subscribeCastChat, type ChatMessage, type Token } from '../twitch-chat.js';

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

function TwitchFeed({ channel }: { channel: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Subscribe to the module-level manager. The buffer and IRC connection live
  // outside this component, so they survive unmount/remount across mode flips.
  useEffect(() => subscribeCastChat(channel, setMessages), [channel]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div
      role="log"
      aria-label={`${channel} chat`}
      className="flex-1 overflow-y-auto font-mono text-xs px-4 py-2 flex flex-col gap-0.5 min-h-0"
    >
      <ChatMessageList messages={messages} />
      <div ref={bottomRef} />
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
