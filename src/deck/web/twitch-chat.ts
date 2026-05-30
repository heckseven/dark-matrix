import { subscribeTwitchEvents } from './twitch-events.js';

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

const MAX_BUFFER = 200;

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
    if (!/^\w+$/.test(id)) continue; // emote IDs are alphanumeric — reject anything that could break the CDN URL
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

// --- Per-channel connection manager -----------------------------------------
//
// The IRC socket and message ring buffer live here at module scope, not inside
// any component, so chat keeps accumulating while the cast UI is unmounted
// (e.g. when the user flips to another mode). Connections are driven by the set
// of configured channels via syncCastChannels — never by component mount — so
// navigating away does not drop them. Everything dies with the page on tab
// close, which is the desired boundary (no server-side persistence).

type ChannelHandler = (messages: ChatMessage[]) => void;

type ChannelState = {
  socket: WebSocket | null;
  buffer: ChatMessage[];
  subscribers: Set<ChannelHandler>;
  stopped: boolean;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  eventUnsub: (() => void) | null;
};

const channels = new Map<string, ChannelState>(); // key: normalized channel

// Mirror the server-side Zod constraint (/^[a-zA-Z0-9_]{1,25}$/) so a channel
// name can never carry IRC control bytes into the JOIN frame, regardless of
// where the caller got it from.
function normalizeChannel(c: string): string {
  return c.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 25);
}

function push(state: ChannelState, msg: ChatMessage) {
  state.buffer = [...state.buffer.slice(-(MAX_BUFFER - 1)), msg];
  for (const h of state.subscribers) h(state.buffer);
}

function connect(channel: string, state: ChannelState) {
  if (state.stopped) return; // a queued reconnect timer may fire after teardown
  const ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443');
  state.socket = ws;
  let reconnecting = false;

  ws.onopen = () => {
    ws.send(`PASS SCHMOOPIIE\r\n`);
    ws.send(`NICK justinfan${10000 + Math.floor(Math.random() * 89999)}\r\n`);
    ws.send(`CAP REQ :twitch.tv/tags twitch.tv/commands\r\n`);
    ws.send(`JOIN #${channel}\r\n`);
  };

  ws.onmessage = (e) => {
    const lines = (typeof e.data === 'string' ? e.data : '').split('\r\n');
    for (const line of lines) {
      if (!line) continue;
      if (line.startsWith('PING')) { ws.send('PONG :tmi.twitch.tv\r\n'); continue; }
      // Server-initiated reconnect is its own IRC command (":tmi.twitch.tv RECONNECT").
      // Match on the command field, not a substring — else a chat message containing
      // the word "RECONNECT" would close the socket and trigger a reconnect loop.
      const body = line.startsWith('@') ? line.slice(line.indexOf(' ') + 1) : line;
      if (body.split(' ')[1] === 'RECONNECT') { reconnecting = true; ws.close(); continue; }
      const msg = parsePrivmsg(line);
      if (msg) push(state, msg);
    }
  };

  ws.onclose = () => {
    if (state.socket !== ws) return;
    state.socket = null;
    if (state.stopped) return;
    state.reconnectTimer = setTimeout(() => connect(channel, state), reconnecting ? 1000 : 3000);
  };
}

function makeChannel(channel: string): ChannelState {
  const state: ChannelState = {
    socket: null,
    buffer: [],
    subscribers: new Set(),
    stopped: false,
    reconnectTimer: null,
    eventUnsub: null,
  };

  // Merge EventSub stream events into the same buffer so they survive too.
  state.eventUnsub = subscribeTwitchEvents((msg) => {
    if (msg.channel && msg.channel.toLowerCase() !== channel) return;
    let text = '';
    let symbol = '';
    const p = msg.payload ?? {};
    switch (msg.eventType) {
      case 'channel.follow':    symbol = '+++'; text = `${p['user_name'] ?? ''} followed`; break;
      case 'channel.subscribe': symbol = '++++++'; text = `${p['user_name'] ?? ''} subscribed`; break;
      case 'channel.cheer':     symbol = '$$$'; text = `${p['user_name'] ?? ''} cheered ${p['bits'] ?? ''} bits`; break;
      case 'channel.raid':      symbol = '>>>>>>'; text = `${p['from_broadcaster_user_name'] ?? ''} raided with ${p['viewers'] ?? ''} viewers`; break;
      default: return;
    }
    push(state, {
      id: nextId(), type: 'event', username: '', symbol,
      tokens: [{ type: 'text', value: text }],
    });
  });

  connect(channel, state);
  return state;
}

function teardown(channel: string) {
  const state = channels.get(channel);
  if (!state) return;
  state.stopped = true;
  if (state.reconnectTimer !== null) { clearTimeout(state.reconnectTimer); state.reconnectTimer = null; }
  state.eventUnsub?.();
  state.eventUnsub = null;
  const ws = state.socket;
  // Null out state.socket BEFORE closing so the onclose handler sees
  // state.socket !== ws and does not reschedule a reconnect. Load-bearing order.
  state.socket = null;
  ws?.close();
  channels.delete(channel);
}

/**
 * Declare the set of channels that should have live connections. Opens sockets
 * for newly added channels and tears down ones no longer present. Idempotent,
 * but O(n) — the cast UI calls it from a dep-keyed effect rather than on every
 * render. Call this whenever the configured columns change; do NOT call it on
 * unmount, so connections persist across mode navigation.
 */
export function syncCastChannels(list: string[]) {
  const desired = new Set(list.map(normalizeChannel).filter(Boolean));
  for (const ch of desired) {
    if (!channels.has(ch)) channels.set(ch, makeChannel(ch));
  }
  for (const ch of [...channels.keys()]) {
    if (!desired.has(ch)) teardown(ch);
  }
}

/**
 * Subscribe to a channel's message buffer. The handler is invoked immediately
 * with the current buffer and again on every new message. Auto-creates the
 * channel connection if it does not exist yet (e.g. a feed mounts before
 * syncCastChannels runs); lifetime is still governed by syncCastChannels.
 */
export function subscribeCastChat(channel: string, handler: ChannelHandler): () => void {
  const key = normalizeChannel(channel);
  if (!key) return () => {};
  let state = channels.get(key);
  if (!state) { state = makeChannel(key); channels.set(key, state); }
  state.subscribers.add(handler);
  handler(state.buffer);
  return () => { state!.subscribers.delete(handler); };
}
