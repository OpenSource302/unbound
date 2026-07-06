import type { NostrEvent, UnsignedEvent } from './types.js';

type MessageHandler = (msg: unknown[]) => void;

export interface PublishResult {
  ok: boolean;
  relay: string;
  reason: string;
}

export class RelayPool {
  private sockets = new Map<string, WebSocket>();
  private handlers: MessageHandler[] = [];
  private pendingOk = new Map<string, { resolve: (r: PublishResult) => void; relay: string }[]>();
  private outbox: { event: NostrEvent; relay: string }[] = [];

  constructor(private relays: string[]) {}

  connect(): void {
    for (const url of this.relays) {
      if (this.sockets.has(url)) continue;
      try {
        const ws = new WebSocket(url);
        ws.onopen = () => {
          console.log(`[pool] connected ${url}`);
          this.flushOutbox(url);
        };
        ws.onmessage = (ev) => {
          const msg = JSON.parse(ev.data as string) as unknown[];
          if (msg[0] === 'OK' && typeof msg[1] === 'string') {
            const waiters = this.pendingOk.get(msg[1]);
            if (waiters?.length) {
              const w = waiters.shift()!;
              w.resolve({
                ok: msg[2] === true,
                relay: w.relay,
                reason: String(msg[3] ?? ''),
              });
            }
          }
          for (const h of this.handlers) h(msg);
        };
        ws.onclose = () => {
          this.sockets.delete(url);
          setTimeout(() => this.connect(), 5000);
        };
        this.sockets.set(url, ws);
      } catch (err) {
        console.error(`[pool] failed ${url}`, err);
      }
    }
  }

  private flushOutbox(relay: string): void {
    const ws = this.sockets.get(relay);
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const remaining: typeof this.outbox = [];
    for (const item of this.outbox) {
      if (item.relay === relay) {
        ws.send(JSON.stringify(['EVENT', item.event]));
      } else {
        remaining.push(item);
      }
    }
    this.outbox = remaining;
  }

  onMessage(handler: MessageHandler): void {
    this.handlers.push(handler);
  }

  private waitForOpen(relay: string, timeoutMs: number): Promise<WebSocket | null> {
    return new Promise((resolve) => {
      const deadline = Date.now() + timeoutMs;
      const tick = () => {
        const ws = this.sockets.get(relay);
        if (ws?.readyState === WebSocket.OPEN) return resolve(ws);
        if (Date.now() >= deadline) return resolve(ws ?? null);
        setTimeout(tick, 50);
      };
      tick();
    });
  }

  private sendAndWaitOk(
    relay: string,
    ws: WebSocket,
    event: NostrEvent,
    timeoutMs: number,
  ): Promise<PublishResult> {
    return new Promise<PublishResult>((resolve) => {
      const timer = setTimeout(
        () => resolve({ ok: false, relay, reason: 'timeout' }),
        timeoutMs,
      );

      const waiters = this.pendingOk.get(event.id) ?? [];
      waiters.push({
        relay,
        resolve: (r) => {
          clearTimeout(timer);
          resolve(r);
        },
      });
      this.pendingOk.set(event.id, waiters);

      const send = () => ws.send(JSON.stringify(['EVENT', event]));

      if (ws.readyState === WebSocket.OPEN) {
        send();
        return;
      }

      if (ws.readyState === WebSocket.CONNECTING) {
        ws.addEventListener(
          'open',
          () => {
            send();
          },
          { once: true },
        );
        return;
      }

      this.outbox.push({ event, relay });
      this.connect();
    });
  }

  /** Publish to relays; succeeds if any target relay accepts. */
  async publish(
    event: NostrEvent,
    options: { relays?: string[]; timeoutMs?: number } = {},
  ): Promise<PublishResult> {
    const timeoutMs = options.timeoutMs ?? 8000;
    const targets = options.relays ?? [...this.sockets.keys()];

    if (targets.length === 0) {
      return { ok: false, relay: 'none', reason: 'no relays configured' };
    }

    const attempts: Promise<PublishResult>[] = [];

    for (const relay of targets) {
      const ws = await this.waitForOpen(relay, Math.min(timeoutMs, 3000));
      if (!ws) {
        attempts.push(Promise.resolve({ ok: false, relay, reason: 'not connected' }));
        continue;
      }
      attempts.push(this.sendAndWaitOk(relay, ws, event, timeoutMs));
    }

    const results = await Promise.all(attempts);
    const success = results.find((r) => r.ok);
    return success ?? results[0]!;
  }

  subscribe(subId: string, filter: Record<string, unknown>): void {
    for (const ws of this.sockets.values()) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(['REQ', subId, filter]));
      }
    }
  }

  close(subId: string): void {
    for (const ws of this.sockets.values()) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(['CLOSE', subId]));
      }
    }
  }

  ingest(events: NostrEvent[]): NostrEvent[] {
    const seen = new Set<string>();
    const out: NostrEvent[] = [];
    for (const e of events) {
      if (!seen.has(e.id)) {
        seen.add(e.id);
        out.push(e);
      }
    }
    return out;
  }
}

export function buildPost(content: string, pubkey: string): UnsignedEvent {
  return {
    kind: 1,
    pubkey,
    created_at: Math.floor(Date.now() / 1000),
    tags: [],
    content,
  };
}