import type { NostrEvent, UnsignedEvent } from './types.js';
import { verifyEvent } from './crypto.js';

export function getTag(event: NostrEvent, name: string): string[] | undefined {
  return event.tags.find((t) => t[0] === name);
}

export function getTagValues(event: NostrEvent, name: string): string[] {
  return event.tags.filter((t) => t[0] === name).map((t) => t[1]).filter(Boolean) as string[];
}

export function getSingleTag(event: NostrEvent, name: string): string | undefined {
  return getTag(event, name)?.[1];
}

export function isReplaceableKind(kind: number): boolean {
  return kind === 0 || (kind >= 10000 && kind < 20000) || (kind >= 30000 && kind < 40000);
}

export function validateEventShape(event: NostrEvent): string | null {
  if (!event.id || !event.pubkey || !event.sig) return 'missing id/pubkey/sig';
  if (typeof event.created_at !== 'number') return 'invalid created_at';
  if (typeof event.kind !== 'number') return 'invalid kind';
  if (!Array.isArray(event.tags)) return 'invalid tags';
  if (typeof event.content !== 'string') return 'invalid content';
  if (event.content.length > 100_000) return 'content too large';
  return null;
}

export async function validateEvent(event: NostrEvent): Promise<string | null> {
  const shape = validateEventShape(event);
  if (shape) return shape;
  if (!(await verifyEvent(event))) return 'invalid signature';
  return null;
}

export function createUnsignedEvent(
  partial: Partial<UnsignedEvent> & Pick<UnsignedEvent, 'kind' | 'pubkey' | 'content'>,
): UnsignedEvent {
  return {
    created_at: Math.floor(Date.now() / 1000),
    tags: [],
    ...partial,
  };
}