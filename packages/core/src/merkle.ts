import { sha256Hex } from './crypto.js';
import type { PayoutLeaf } from './types.js';

function canonicalLeaf(leaf: PayoutLeaf): string {
  return JSON.stringify({
    pool: leaf.pool,
    epoch: leaf.epoch,
    recipient: leaf.recipient,
    bucket: leaf.bucket,
    amount: leaf.amount,
    currency: leaf.currency,
  });
}

function hashPair(left: string, right: string): string {
  return sha256Hex(left + right);
}

/** Build SHA-256 Merkle tree from payout leaves (sorted canonically). */
export function buildMerkleTree(leaves: PayoutLeaf[]): {
  root: string;
  proofs: Map<string, string[]>;
  leafHashes: string[];
} {
  const sorted = [...leaves].sort((a, b) => {
    if (a.bucket !== b.bucket) return a.bucket.localeCompare(b.bucket);
    return a.recipient.localeCompare(b.recipient);
  });

  const leafHashes = sorted.map((l) => sha256Hex(canonicalLeaf(l)));
  const proofs = new Map<string, string[]>();

  if (leafHashes.length === 0) {
    return { root: sha256Hex(''), proofs, leafHashes };
  }

  let level = leafHashes;
  const layers: string[][] = [level];

  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i]!;
      const right = level[i + 1] ?? left;
      next.push(hashPair(left, right));
    }
    level = next;
    layers.push(level);
  }

  for (let i = 0; i < leafHashes.length; i++) {
    const proof: string[] = [];
    let idx = i;
    for (let layer = 0; layer < layers.length - 1; layer++) {
      const row = layers[layer]!;
      const isRight = idx % 2 === 0;
      const sibling = isRight ? row[idx + 1] ?? row[idx] : row[idx - 1] ?? row[idx];
      proof.push(sibling!);
      idx = Math.floor(idx / 2);
    }
    const key = `${sorted[i]!.bucket}:${sorted[i]!.recipient}`;
    proofs.set(key, proof);
  }

  return { root: level[0]!, proofs, leafHashes };
}

export function verifyMerkleProof(
  leaf: PayoutLeaf,
  proof: string[],
  root: string,
): boolean {
  let hash = sha256Hex(canonicalLeaf(leaf));
  for (const sibling of proof) {
    hash = hashPair(
      hash < sibling ? hash : sibling,
      hash < sibling ? sibling : hash,
    );
  }
  return hash === root;
}