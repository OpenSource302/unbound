import { sha256 } from '@noble/hashes/sha2.js';
import { schnorr } from '@noble/curves/secp256k1';
import type { NostrEvent, UnsignedEvent } from './types.js';

const HEX = /^[0-9a-f]+$/i;

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function hexToBytes(hex: string): Uint8Array {
  if (!HEX.test(hex) || hex.length % 2 !== 0) {
    throw new Error('Invalid hex string');
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** NIP-01 event id: SHA-256 of serialized unsigned event. */
export function computeEventId(event: UnsignedEvent): string {
  const serialized = JSON.stringify([
    0,
    event.pubkey,
    event.created_at,
    event.kind,
    event.tags,
    event.content,
  ]);
  return bytesToHex(sha256(new TextEncoder().encode(serialized)));
}

/** NIP-01 Schnorr sign (BIP-340). */
export async function signEvent(
  event: UnsignedEvent,
  secretKey: Uint8Array,
): Promise<NostrEvent> {
  const id = computeEventId(event);
  const sig = schnorr.sign(hexToBytes(id), secretKey);
  return { ...event, id, sig: bytesToHex(sig) };
}

/** NIP-01 Schnorr verify. */
export async function verifyEvent(event: NostrEvent): Promise<boolean> {
  try {
    const expectedId = computeEventId(event);
    if (expectedId !== event.id) return false;
    if (event.pubkey.length !== 64) return false;
    return schnorr.verify(
      hexToBytes(event.sig),
      hexToBytes(event.id),
      hexToBytes(event.pubkey),
    );
  } catch {
    return false;
  }
}

/** NIP-01 x-only pubkey (32 bytes hex). */
export function getPublicKey(secretKey: Uint8Array): string {
  return bytesToHex(schnorr.getPublicKey(secretKey));
}

export function generateSecretKey(): Uint8Array {
  return schnorr.utils.randomSecretKey();
}

export function sha256Hex(data: string): string {
  return bytesToHex(sha256(new TextEncoder().encode(data)));
}