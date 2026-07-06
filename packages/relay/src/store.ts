import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { NostrEvent } from '@unbound/core';
import { isReplaceableKind, KIND, parseUsernameEvent } from '@unbound/core';

export class EventStore {
  private events = new Map<string, NostrEvent>();
  private usernames = new Map<string, string>();
  private path: string;

  constructor(path: string) {
    this.path = path.endsWith('.json') ? path : `${path}/events.json`;
    this.load();
    this.rebuildUsernameIndex();
  }

  private load(): void {
    if (!existsSync(this.path)) return;
    try {
      const data = JSON.parse(readFileSync(this.path, 'utf-8')) as NostrEvent[];
      for (const e of data) this.events.set(e.id, e);
    } catch {
      console.warn('[store] failed to load, starting fresh');
    }
  }

  private rebuildUsernameIndex(): void {
    this.usernames.clear();
    for (const e of this.events.values()) {
      const claim = parseUsernameEvent(e);
      if (claim) this.usernames.set(claim.username, claim.pubkey);
    }
  }

  private persist(): void {
    const dir = dirname(this.path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(this.path, JSON.stringify([...this.events.values()], null, 0));
  }

  /** Returns error message if username claim is invalid. */
  validateUsernameClaim(event: NostrEvent): string | null {
    if (event.kind !== KIND.USERNAME) return null;
    const claim = parseUsernameEvent(event);
    if (!claim) return 'invalid username event';

    const existing = this.usernames.get(claim.username);
    if (existing && existing !== event.pubkey) {
      return `username @${claim.username} already taken`;
    }
    return null;
  }

  insert(event: NostrEvent): boolean {
    if (this.events.has(event.id)) return false;

    const usernameErr = this.validateUsernameClaim(event);
    if (usernameErr) return false;

    if (isReplaceableKind(event.kind)) {
      for (const [id, e] of this.events) {
        if (e.pubkey === event.pubkey && e.kind === event.kind) {
          if (e.kind === KIND.USERNAME) {
            const old = parseUsernameEvent(e);
            if (old) this.usernames.delete(old.username);
          }
          this.events.delete(id);
        }
      }
    }

    this.events.set(event.id, event);

    const claim = parseUsernameEvent(event);
    if (claim) this.usernames.set(claim.username, claim.pubkey);

    this.persist();
    return true;
  }

  getByIds(ids: string[]): NostrEvent[] {
    return ids.map((id) => this.events.get(id)).filter((e): e is NostrEvent => !!e);
  }

  query(filter: {
    ids?: string[];
    authors?: string[];
    kinds?: number[];
    since?: number;
    until?: number;
    limit?: number;
  }): NostrEvent[] {
    let results = [...this.events.values()];

    if (filter.ids?.length) {
      const set = new Set(filter.ids);
      results = results.filter((e) => set.has(e.id));
    }
    if (filter.authors?.length) {
      const set = new Set(filter.authors);
      results = results.filter((e) => set.has(e.pubkey));
    }
    if (filter.kinds?.length) {
      const set = new Set(filter.kinds);
      results = results.filter((e) => set.has(e.kind));
    }
    if (filter.since) {
      results = results.filter((e) => e.created_at >= filter.since!);
    }
    if (filter.until) {
      results = results.filter((e) => e.created_at <= filter.until!);
    }

    results.sort((a, b) => a.created_at - b.created_at);
    const limit = filter.limit ?? 500;
    if (results.length > limit) {
      results = results.slice(results.length - limit);
    }
    return results;
  }

  count(): number {
    return this.events.size;
  }
}