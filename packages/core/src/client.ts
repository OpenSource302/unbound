import type { NostrEvent, UnsignedEvent } from './types.js';

export interface RelayPoolOptions {
  relays: string[];
}

type MessageHandler = (msg: unknown[]) => void;

export class RelayPool {
  private sockets = new Map<string, WebSocket>();
  private handlers: MessageHandler[] = [];
  constructor(private relays: string[]) {}

  connect(): void {
    for (const url of this.relays) {
      if (this.sockets.has(url)) continue;
      try {
        const ws = new WebSocket(url);
        ws.onopen = () => console.log(`[pool] connected ${url}`);
        ws.onmessage = (ev) => {
          const msg = JSON.parse(ev.data as string) as unknown[];
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

  onMessage(handler: MessageHandler): void {
    this.handlers.push(handler);
  }

  publish(event: NostrEvent): void {
    for (const ws of this.sockets.values()) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(['EVENT', event]));
      }
    }
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

  /** Dedupe events by id across relays. */
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