import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { startDeckServer } from './server.js';
import type { DeckServer } from './server.js';
import net from 'node:net';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// Minimal raw WebSocket client using node:net (ws package doesn't work in vitest workers)
class RawWs {
  private sock: net.Socket;
  private pending: Array<(s: string) => void> = [];
  private frameQueue: string[] = [];

  constructor(sock: net.Socket) {
    this.sock = sock;
  }

  static connect(host: string, port: number, wsPath: string): Promise<RawWs> {
    return new Promise((resolve, reject) => {
      const key = crypto.randomBytes(16).toString('base64');
      const sock = net.createConnection(port, host);
      let handshakeDone = false;
      const rws = new RawWs(sock);

      sock.once('connect', () => {
        sock.write(
          `GET ${wsPath} HTTP/1.1\r\nHost: ${host}:${port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`,
        );
      });

      let recvBuf = Buffer.alloc(0);

      sock.on('data', (chunk: Buffer) => {
        if (!handshakeDone) {
          const combined = Buffer.concat([recvBuf, chunk]);
          const sep = combined.indexOf('\r\n\r\n');
          if (sep !== -1) {
            handshakeDone = true;
            const afterHeaders = combined.subarray(sep + 4);
            recvBuf = Buffer.alloc(0);
            if (afterHeaders.length > 0) rws.consumeFrames(afterHeaders);
            resolve(rws);
          } else {
            recvBuf = combined;
          }
        } else {
          rws.consumeFrames(chunk);
        }
      });
      sock.once('error', reject);
    });
  }

  private frameBuf = Buffer.alloc(0);

  private consumeFrames(chunk: Buffer): void {
    this.frameBuf = Buffer.concat([this.frameBuf, chunk]);
    while (this.frameBuf.length >= 2) {
      const byte2 = this.frameBuf[1]!;
      const masked = (byte2 & 0x80) !== 0;
      let payLen = byte2 & 0x7f;
      let headerLen = 2;
      if (payLen === 126) { if (this.frameBuf.length < 4) break; payLen = this.frameBuf.readUInt16BE(2); headerLen = 4; }
      const maskLen = masked ? 4 : 0;
      const frameEnd = headerLen + maskLen + payLen;
      if (this.frameBuf.length < frameEnd) break;
      let payload = this.frameBuf.subarray(headerLen + maskLen, frameEnd);
      if (masked) {
        const mask = this.frameBuf.subarray(headerLen, headerLen + 4);
        payload = Buffer.from(payload.map((b, i) => b ^ mask[i % 4]!));
      }
      this.frameBuf = this.frameBuf.subarray(frameEnd);
      const text = payload.toString();
      const r = this.pending.shift();
      if (r) r(text); else this.frameQueue.push(text);
    }
  }

  receive(): Promise<string> {
    if (this.frameQueue.length > 0) return Promise.resolve(this.frameQueue.shift()!);
    return new Promise<string>(r => this.pending.push(r));
  }

  send(data: string): void {
    const payload = Buffer.from(data);
    const mask = crypto.randomBytes(4);
    let headerLen: number;
    let frame: Buffer;
    if (payload.length <= 125) {
      frame = Buffer.alloc(2 + 4 + payload.length);
      frame[0] = 0x81; frame[1] = 0x80 | payload.length;
      headerLen = 2;
    } else {
      frame = Buffer.alloc(4 + 4 + payload.length);
      frame[0] = 0x81; frame[1] = 0x80 | 126;
      frame.writeUInt16BE(payload.length, 2);
      headerLen = 4;
    }
    mask.copy(frame, headerLen);
    for (let i = 0; i < payload.length; i++) frame[headerLen + 4 + i] = payload[i]! ^ mask[i % 4]!;
    this.sock.write(frame);
  }

  close(): void { this.sock.end(); }
}

describe('deck WebSocket preview bridge', () => {
  let server: DeckServer;
  let configDir: string;

  beforeEach(async () => {
    configDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dm-pb-test-'));
    // Point daemon socket to a non-existent path so preview always gets an error
    process.env['DARK_MATRIX_SOCKET'] = path.join(configDir, 'no-daemon.sock');
    server = await startDeckServer({ port: 0, configDir });
  });

  afterEach(async () => {
    delete process.env['DARK_MATRIX_SOCKET'];
    await server.stop();
    await fs.rm(configDir, { recursive: true, force: true });
  });

  it('sends connected on open', async () => {
    const ws = await RawWs.connect('127.0.0.1', server.port, '/ws');
    const msg = await ws.receive();
    ws.close();
    expect(JSON.parse(msg)).toEqual({ type: 'connected' });
  });

  it('ping → pong', async () => {
    const ws = await RawWs.connect('127.0.0.1', server.port, '/ws');
    await ws.receive(); // consume 'connected'
    ws.send(JSON.stringify({ type: 'ping' }));
    const msg = await ws.receive();
    ws.close();
    expect(JSON.parse(msg)).toEqual({ type: 'pong' });
  });

  it('preview with daemon unreachable → preview-ack (fire-and-forget)', async () => {
    const ws = await RawWs.connect('127.0.0.1', server.port, '/ws');
    await ws.receive(); // consume 'connected'
    const frame = Buffer.alloc(306).toString('base64');
    ws.send(JSON.stringify({ type: 'preview', frame }));
    const msg = await ws.receive();
    ws.close();
    expect(JSON.parse(msg)).toEqual({ type: 'preview-ack' });
  });

  it('preview-stop does not crash the connection', async () => {
    const ws = await RawWs.connect('127.0.0.1', server.port, '/ws');
    await ws.receive(); // consume 'connected'
    ws.send(JSON.stringify({ type: 'preview-stop' }));
    // Confirm connection still alive
    ws.send(JSON.stringify({ type: 'ping' }));
    const msg = await ws.receive();
    ws.close();
    expect(JSON.parse(msg)).toEqual({ type: 'pong' });
  });

  it('unknown message type does not crash the connection', async () => {
    const ws = await RawWs.connect('127.0.0.1', server.port, '/ws');
    await ws.receive(); // consume 'connected'
    ws.send(JSON.stringify({ type: 'totally-unknown' }));
    ws.send(JSON.stringify({ type: 'ping' }));
    const msg = await ws.receive();
    ws.close();
    expect(JSON.parse(msg)).toEqual({ type: 'pong' });
  });
});
