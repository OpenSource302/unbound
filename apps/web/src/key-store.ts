import { bytesToHex, hexToBytes } from '@unbound/core';

const STORAGE_PREFIX = 'unbound:v1:';
const SESSION_USER = 'unbound:session_user';
const SESSION_KEY = 'unbound:session_key';
const REMEMBER_KEY = 'unbound:remember_key';
const REMEMBER_PREF = 'unbound:remember_login';

async function deriveKey(passcode: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(passcode),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: 250_000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptSecretKey(
  secretKey: Uint8Array,
  passcode: string,
): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passcode, salt);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    secretKey as BufferSource,
  );
  const payload = {
    v: 1,
    salt: bytesToHex(salt),
    iv: bytesToHex(iv),
    ct: bytesToHex(new Uint8Array(ciphertext)),
  };
  return JSON.stringify(payload);
}

export async function decryptSecretKey(
  blob: string,
  passcode: string,
): Promise<Uint8Array> {
  const payload = JSON.parse(blob) as { salt: string; iv: string; ct: string };
  const key = await deriveKey(passcode, hexToBytes(payload.salt));
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: hexToBytes(payload.iv) as BufferSource },
    key,
    hexToBytes(payload.ct) as BufferSource,
  );
  return new Uint8Array(plain);
}

export function accountStorageKey(username: string): string {
  return `${STORAGE_PREFIX}${username.toLowerCase()}`;
}

export async function saveAccount(
  username: string,
  secretKey: Uint8Array,
  passcode: string,
  remember = true,
): Promise<void> {
  const encrypted = await encryptSecretKey(secretKey, passcode);
  localStorage.setItem(accountStorageKey(username), encrypted);
  saveLoginSession(secretKey, username, remember);
}

export async function loadAccount(
  username: string,
  passcode: string,
): Promise<Uint8Array> {
  const blob = localStorage.getItem(accountStorageKey(username.toLowerCase()));
  if (!blob) throw new Error('No account found on this device for that username');
  return decryptSecretKey(blob, passcode);
}

export function getSessionUsername(): string | null {
  return localStorage.getItem(SESSION_USER);
}

export function getRememberLogin(): boolean {
  return localStorage.getItem(REMEMBER_PREF) !== '0';
}

export function saveLoginSession(
  secretKey: Uint8Array,
  username: string,
  remember = true,
): void {
  const normalized = username.toLowerCase();
  const hex = bytesToHex(secretKey);
  localStorage.setItem(SESSION_USER, normalized);
  sessionStorage.setItem(SESSION_KEY, hex);
  localStorage.setItem(REMEMBER_PREF, remember ? '1' : '0');
  if (remember) {
    localStorage.setItem(REMEMBER_KEY, hex);
  } else {
    localStorage.removeItem(REMEMBER_KEY);
  }
}

export interface RestoredSession {
  username: string;
  secretKey: Uint8Array;
}

/** Restore an active login from this browser (refresh or remembered session). */
export function restoreLoginSession(): RestoredSession | null {
  try {
    const username = getSessionUsername();
    if (!username || !hasLocalAccount(username)) return null;

    const hex =
      sessionStorage.getItem(SESSION_KEY) ?? localStorage.getItem(REMEMBER_KEY);
    if (!hex) return null;

    return { username, secretKey: hexToBytes(hex) };
  } catch {
    clearSession();
    return null;
  }
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_USER);
  localStorage.removeItem(REMEMBER_KEY);
  sessionStorage.removeItem(SESSION_KEY);
}

export function hasLocalAccount(username: string): boolean {
  return !!localStorage.getItem(accountStorageKey(username.toLowerCase()));
}