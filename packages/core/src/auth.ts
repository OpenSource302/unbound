import type { NostrEvent, UnsignedEvent } from './types.js';
import { KIND } from './types.js';
import { getSingleTag } from './events.js';

const USERNAME_RE = /^[a-zA-Z0-9_]{3,15}$/;

export function validateUsername(username: string): string | null {
  const u = username.trim();
  if (u.length < 3) return 'Username must be at least 3 characters';
  if (u.length > 15) return 'Username must be 15 characters or less';
  if (!USERNAME_RE.test(u)) return 'Use letters, numbers, and underscores only';
  return null;
}

export function validatePasscode(passcode: string): string | null {
  if (passcode.length < 6) return 'Passcode must be at least 6 characters';
  if (passcode.length > 128) return 'Passcode too long';
  return null;
}

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

/** Kind 30095 — global username claim tied to pubkey. */
export function buildUsernameEvent(pubkey: string, username: string): UnsignedEvent {
  const u = normalizeUsername(username);
  return {
    kind: KIND.USERNAME,
    pubkey,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['d', u],
      ['u', u],
    ],
    content: '',
  };
}

/** Kind 0 profile metadata (NIP-01). */
export function buildProfileEvent(
  pubkey: string,
  username: string,
  displayName?: string,
): UnsignedEvent {
  const u = normalizeUsername(username);
  const content = JSON.stringify({
    name: displayName?.trim() || u,
    display_name: displayName?.trim() || u,
    username: u,
    nip05: '',
    picture: '',
    about: '',
  });
  return {
    kind: KIND.METADATA,
    pubkey,
    created_at: Math.floor(Date.now() / 1000),
    tags: [['d', u]],
    content,
  };
}

export interface UserProfile {
  pubkey: string;
  username: string;
  displayName: string;
  picture?: string;
  about?: string;
}

export function parseProfileEvent(event: NostrEvent): UserProfile | null {
  if (event.kind !== KIND.METADATA) return null;
  try {
    const meta = JSON.parse(event.content) as Record<string, string>;
    const username =
      meta.username ??
      getSingleTag(event, 'd') ??
      meta.name?.toLowerCase() ??
      event.pubkey.slice(0, 8);
    return {
      pubkey: event.pubkey,
      username: normalizeUsername(username),
      displayName: meta.display_name ?? meta.name ?? username,
      picture: meta.picture,
      about: meta.about,
    };
  } catch {
    return null;
  }
}

export function parseUsernameEvent(event: NostrEvent): { pubkey: string; username: string } | null {
  if (event.kind !== KIND.USERNAME) return null;
  const u = getSingleTag(event, 'u') ?? getSingleTag(event, 'd');
  if (!u) return null;
  return { pubkey: event.pubkey, username: normalizeUsername(u) };
}

export function buildProfilesIndex(events: NostrEvent[]): Map<string, UserProfile> {
  const byPubkey = new Map<string, UserProfile>();
  const usernames = new Map<string, string>();

  for (const e of events) {
    const claim = parseUsernameEvent(e);
    if (claim) usernames.set(claim.username, claim.pubkey);
  }

  for (const e of events) {
    const profile = parseProfileEvent(e);
    if (profile) {
      byPubkey.set(profile.pubkey, profile);
    }
  }

  for (const [username, pubkey] of usernames) {
    if (!byPubkey.has(pubkey)) {
      byPubkey.set(pubkey, {
        pubkey,
        username,
        displayName: username,
      });
    } else {
      const p = byPubkey.get(pubkey)!;
      byPubkey.set(pubkey, { ...p, username });
    }
  }

  return byPubkey;
}

export function lookupPubkeyByUsername(
  username: string,
  events: NostrEvent[],
): string | null {
  const u = normalizeUsername(username);
  for (const e of events) {
    const claim = parseUsernameEvent(e);
    if (claim?.username === u) return claim.pubkey;
  }
  return null;
}