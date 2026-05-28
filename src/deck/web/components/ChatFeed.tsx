import { useEffect, useRef, useState, useCallback } from 'react';
import type { CastColumn } from '../types/config-types.js';

type EmoteRange = { id: string; start: number; end: number };

export type Token = { type: 'text'; value: string } | { type: 'emote'; id: string; name: string };

export type ChatMessage = {
  id: string;
  type: 'chat' | 'event';
  username: string;
  color?: string;
  tokens: Token[];
  symbol?: string; // event-type indicator rendered separately for non-color differentiation
};

let _seq = 0;
function nextId() { return `msg-${++_seq}`; }

function parseTags(raw: string): Record<string, string> {
  const tags: Record<string, string> = {};
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=');
    if (eq >= 0) tags[part.slice(0, eq)] = part.slice(eq + 1);
  }
  return tags;
}

function parseEmotes(emotesTag: string | undefined, text: string): Token[] {
  if (!emotesTag) return [{ type: 'text', value: text }];

  const ranges: EmoteRange[] = [];
  for (const part of emotesTag.split('/')) {
    const colon = part.indexOf(':');
    if (colon < 0) continue;
    const id = part.slice(0, colon);
    for (const span of part.slice(colon + 1).split(',')) {
      const dash = span.indexOf('-');
      if (dash < 0) continue;
      ranges.push({ id, start: Number(span.slice(0, dash)), end: Number(span.slice(dash + 1)) });
    }
  }

  // Sort descending by start to avoid index shifting during splice
  ranges.sort((a, b) => b.start - a.start);

  // Twitch emote offsets are UTF-16 code unit positions — use string indexing directly
  const tokens: Token[] = [{ type: 'text', value: text }];

  for (const range of ranges) {
    const emoteName = text.slice(range.start, range.end + 1);
    // Find and split the text token containing this range
    let charOffset = 0;
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i]!;
      if (tok.type !== 'text') { continue; }
      const tokLen = tok.value.length;
      if (charOffset <= range.start && range.end < charOffset + tokLen) {
        const before = tok.value.slice(0, range.start - charOffset);
        const after = tok.value.slice(range.end - charOffset + 1);
        const replacement: Token[] = [];
        if (before) replacement.push({ type: 'text', value: before });
        replacement.push({ type: 'emote', id: range.id, name: emoteName });
        if (after) replacement.push({ type: 'text', value: after });
        tokens.splice(i, 1, ...replacement);
        break;
      }
      charOffset += tokLen;
    }
  }

  return tokens;
}

function parsePrivmsg(line: string): ChatMessage | null {
  // Format: @tags :nick!user@host PRIVMSG #channel :message
  let rest = line;
  let rawTags = '';
  if (rest.startsWith('@')) {
    const spaceIdx = rest.indexOf(' ');
    if (spaceIdx < 0) return null;
    rawTags = rest.slice(1, spaceIdx);
    rest = rest.slice(spaceIdx + 1);
  }
  if (!rest.startsWith(':')) return null;
  const parts = rest.split(' ');
  if (parts.length < 4) return null;
  const nick = (parts[0] ?? '').slice(1).split('!')[0] ?? '';
  const cmd = parts[1] ?? '';
  if (cmd !== 'PRIVMSG') return null;
  const msgStart = rest.indexOf(' :', rest.indexOf(' #'));
  const text = msgStart >= 0 ? rest.slice(msgStart + 2) : '';

  const tags = parseTags(rawTags);
  const username = tags['display-name'] || nick;
  const color = tags['color'] || undefined;
  const tokens = parseEmotes(tags['emotes'] || undefined, text);
  const safeColor = color && /^#[0-9a-fA-F]{3,6}$/.test(color) ? color : undefined;

  return { id: nextId(), type: 'chat', username, ...(safeColor ? { color: safeColor } : {}), tokens };
}

export function ChatMessageList({ messages }: { messages: ChatMessage[] }) {
  return (
    <>
      {messages.map(msg => (
        <div key={msg.id} className="flex gap-1 items-baseline">
          {msg.type === 'event' ? (
            <>
              <span className="sr-only">Event: </span>
              <span className="text-accent font-bold select-none w-6 flex-shrink-0" aria-hidden="true">{msg.symbol}</span>
              <span className="text-accent"><Tokens tokens={msg.tokens} /></span>
            </>
          ) : (
            <>
              {msg.username && (
                <span style={msg.color ? { color: msg.color } : undefined} className="font-bold">
                  {msg.username}
                  <span className="text-muted-foreground font-normal">: </span>
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

function TwitchFeed({ channel, globalWsRef }: { channel: string; globalWsRef: React.MutableRefObject<WebSocket | null> }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const ircWsRef = useRef<WebSocket | null>(null);
  const stoppedRef = useRef(false);
  const channelRef = useRef(channel);
  channelRef.current = channel;

  // Receive stream events from the deck WS
  useEffect(() => {
    const ws = globalWsRef.current;
    if (!ws) return;

    function onMessage(e: MessageEvent) {
      try {
        if (typeof e.data !== 'string') return;
        const msg = JSON.parse(e.data) as { type: string; eventType?: string; payload?: Record<string, unknown>; channel?: string };
        if (msg.type !== 'twitch-event') return;
        // Only show events for this column's channel
        if (msg.channel && msg.channel.toLowerCase() !== channelRef.current.toLowerCase()) return;

        let text = '';
        let symbol = '';
        const p = msg.payload ?? {};
        switch (msg.eventType) {
          case 'channel.follow':    symbol = '+'; text = `${p['user_name'] ?? ''} followed`; break;
          case 'channel.subscribe': symbol = '++'; text = `${p['user_name'] ?? ''} subscribed`; break;
          case 'channel.cheer':     symbol = '$'; text = `${p['user_name'] ?? ''} cheered ${p['bits'] ?? ''} bits`; break;
          case 'channel.raid':      symbol = '>>'; text = `${p['from_broadcaster_user_name'] ?? ''} raided with ${p['viewers'] ?? ''} viewers`; break;
          default: return;
        }
        setMessages(prev => [...prev.slice(-199), {
          id: nextId(), type: 'event' as const, username: '', symbol,
          tokens: [{ type: 'text' as const, value: text }],
        }]);
      } catch { /* ignore */ }
    }

    ws.addEventListener('message', onMessage);
    return () => ws.removeEventListener('message', onMessage);
  }, [globalWsRef]);

  // IRC chat connection
  const connect = useCallback(() => {
    const ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443');
    ircWsRef.current = ws;
    let reconnecting = false;

    ws.onopen = () => {
      ws.send(`PASS SCHMOOPIIE\r\n`);
      ws.send(`NICK justinfan${10000 + Math.floor(Math.random() * 89999)}\r\n`);
      ws.send(`CAP REQ :twitch.tv/tags twitch.tv/commands\r\n`);
      ws.send(`JOIN #${channelRef.current.toLowerCase()}\r\n`);
    };

    ws.onmessage = (e) => {
      const lines = (typeof e.data === 'string' ? e.data : '').split('\r\n');
      for (const line of lines) {
        if (!line) continue;
        if (line.startsWith('PING')) { ws.send('PONG :tmi.twitch.tv\r\n'); continue; }
        if (line.includes('RECONNECT')) { reconnecting = true; ws.close(); continue; }
        const msg = parsePrivmsg(line);
        if (msg) setMessages(prev => [...prev.slice(-199), msg]);
      }
    };

    ws.onclose = () => {
      ircWsRef.current = null;
      if (!stoppedRef.current && !reconnecting) setTimeout(connect, 3000);
      else if (!stoppedRef.current && reconnecting) setTimeout(connect, 1000);
    };
  }, []);

  useEffect(() => {
    stoppedRef.current = false;
    connect();
    return () => {
      stoppedRef.current = true;
      const ws = ircWsRef.current;
      ircWsRef.current = null;
      ws?.close();
    };
  }, [connect, channel]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div
      role="log"
      aria-label={`${channel} chat`}
      className="flex-1 overflow-y-auto font-mono text-xs p-2 flex flex-col gap-0.5 min-h-0"
    >
      <ChatMessageList messages={messages} />
      <div ref={bottomRef} />
    </div>
  );
}

export function ChatFeed({ column, globalWsRef }: {
  column: CastColumn;
  globalWsRef: React.MutableRefObject<WebSocket | null>;
}) {
  if (column.provider === 'twitch') {
    return <TwitchFeed channel={column.channel} globalWsRef={globalWsRef} />;
  }
  return (
    <div className="flex-1 flex items-center justify-center font-mono text-xs text-muted-foreground">
      unknown provider
    </div>
  );
}
