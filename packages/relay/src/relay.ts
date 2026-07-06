import { WebSocketServer, WebSocket } from 'ws';
import type { NostrEvent } from '@unbound/core';
import { validateEvent, KIND } from '@unbound/core';
import { EventStore } from './store.js';

interface Subscription {
  id: string;
  filter: Filter;
}

interface Filter {
  ids?: string[];
  authors?: string[];
  kinds?: number[];
  since?: number;
  until?: number;
  limit?: number;
}

const ALLOWED_KINDS = new Set([
  0, 1, 3, 5, 6, 7,
  KIND.TRUST,
  KIND.STAKE,
  KIND.RANK_SNAPSHOT,
  KIND.FRAUD,
  KIND.SLASH,
  KIND.REVENUE,
  KIND.ENGAGEMENT,
  KIND.PAYOUT_ROOT,
  KIND.PAYOUT_CLAIM,
  KIND.RELAY_ATTEST,
  KIND.CAMPAIGN,
  KIND.POOL_MANIFEST,
  KIND.USERNAME,
]);

export interface RelayOptions {
  host?: string;
  port?: number;
  dbPath?: string;
  name?: string;
}

export class UnboundRelay {
  private store: EventStore;
  private wss: WebSocketServer | null = null;
  private subs = new Map<WebSocket, Subscription[]>();
  private name: string;

  constructor(private opts: RelayOptions = {}) {
    this.store = new EventStore(opts.dbPath ?? './data/relay');
    this.name = opts.name ?? 'unbound-relay';
  }

  start(): void {
    const port = this.opts.port ?? 7777;
    const host = this.opts.host ?? '0.0.0.0';

    this.wss = new WebSocketServer({ host, port });
    this.wss.on('connection', (ws) => this.onConnection(ws));
    console.log(`[${this.name}] listening on ws://${host}:${port}`);
    console.log(`[${this.name}] events stored: ${this.store.count()}`);
  }

  private onConnection(ws: WebSocket): void {
    this.subs.set(ws, []);
    ws.send(JSON.stringify(['NOTICE', `Welcome to ${this.name} — Unbound relay`]));

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString()) as unknown[];
        this.handleMessage(ws, msg);
      } catch {
        ws.send(JSON.stringify(['NOTICE', 'Invalid JSON']));
      }
    });

    ws.on('close', () => this.subs.delete(ws));
  }

  private handleMessage(ws: WebSocket, msg: unknown[]): void {
    const type = msg[0];
    if (type === 'EVENT') {
      void this.handleEvent(ws, msg[1] as NostrEvent);
    } else if (type === 'REQ') {
      this.handleReq(ws, msg[1] as string, ...(msg.slice(2) as Filter[]));
    } else if (type === 'CLOSE') {
      const id = msg[1] as string;
      const subs = this.subs.get(ws) ?? [];
      this.subs.set(ws, subs.filter((s) => s.id !== id));
    }
  }

  private async handleEvent(ws: WebSocket, event: NostrEvent): Promise<void> {
    const err = await validateEvent(event);
    if (err) {
      ws.send(JSON.stringify(['OK', event.id ?? '', false, err]));
      return;
    }

    if (!ALLOWED_KINDS.has(event.kind)) {
      ws.send(JSON.stringify(['OK', event.id, false, 'kind not allowed']));
      return;
    }

    const usernameErr = this.store.validateUsernameClaim(event);
    if (usernameErr) {
      ws.send(JSON.stringify(['OK', event.id, false, usernameErr]));
      return;
    }

    const ok = this.store.insert(event);
    ws.send(JSON.stringify(['OK', event.id, ok, ok ? '' : 'duplicate']));

    if (ok) this.broadcastEvent(event);
  }

  private handleReq(ws: WebSocket, subId: string, ...filters: Filter[]): void {
    const subs = this.subs.get(ws) ?? [];
    subs.push({ id: subId, filter: filters[0] ?? {} });
    this.subs.set(ws, subs);

    const events = this.store.query(filters[0] ?? {});
    for (const event of events) {
      ws.send(JSON.stringify(['EVENT', subId, event]));
    }
    ws.send(JSON.stringify(['EOSE', subId]));
  }

  private broadcastEvent(event: NostrEvent): void {
    for (const [ws, subs] of this.subs) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      for (const sub of subs) {
        if (this.matchesFilter(event, sub.filter)) {
          ws.send(JSON.stringify(['EVENT', sub.id, event]));
        }
      }
    }
  }

  private matchesFilter(event: NostrEvent, filter: Filter): boolean {
    if (filter.ids?.length && !filter.ids.includes(event.id)) return false;
    if (filter.authors?.length && !filter.authors.includes(event.pubkey)) return false;
    if (filter.kinds?.length && !filter.kinds.includes(event.kind)) return false;
    if (filter.since && event.created_at < filter.since) return false;
    if (filter.until && event.created_at > filter.until) return false;
    return true;
  }
}