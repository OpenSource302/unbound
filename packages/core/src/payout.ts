import type { NostrEvent, PoolRules, PayoutLeaf } from './types.js';
import { DEFAULT_POOL_RULES, KIND } from './types.js';
import { getSingleTag } from './events.js';
import { buildMerkleTree } from './merkle.js';
import { sha256Hex } from './crypto.js';

export interface EngagementReceipt {
  viewer: string;
  creator: string;
  postId: string;
  relay: string;
  campaign: string;
  pool: string;
  epoch: number;
  rate: number;
  slot: string;
  eventId: string;
}

export interface RelayWorkAttestation {
  relay: string;
  eventsStored: number;
  bandwidthServed: number;
  uptime: number;
  uniqueClients: number;
}

export interface EpochPayoutInput {
  grossSats: number;
  receipts: EngagementReceipt[];
  relayWork: RelayWorkAttestation[];
  gatewaySpend: Map<string, number>;
  devRecipients: { pubkey: string; weight: number }[];
  poolPubkey: string;
  epoch: number;
  rules?: PoolRules;
}

export interface EpochPayoutResult {
  creatorRoot: string;
  relayRoot: string;
  gatewayRoot: string;
  devRoot: string;
  leaves: PayoutLeaf[];
  creatorPayouts: Map<string, number>;
  relayPayouts: Map<string, number>;
  ruleHash: string;
}

const SLOT_MULTIPLIER: Record<string, number> = {
  feed: 1.0,
  thread: 0.7,
  sidebar: 0.4,
};

export function computeRuleHash(rules: PoolRules = DEFAULT_POOL_RULES): string {
  return sha256Hex(JSON.stringify(rules));
}

function normalizeScores(values: Map<string, number>): Map<string, number> {
  const total = [...values.values()].reduce((a, b) => a + b, 0);
  if (total === 0) return new Map();
  const out = new Map<string, number>();
  for (const [k, v] of values) out.set(k, v / total);
  return out;
}

/** Parse kind-30078 engagement receipts from events. */
export function parseEngagementReceipts(events: NostrEvent[]): EngagementReceipt[] {
  const out: EngagementReceipt[] = [];
  for (const e of events) {
    if (e.kind !== KIND.ENGAGEMENT) continue;
    const creator = getSingleTag(e, 'p');
    const postId = getSingleTag(e, 'e');
    const pool = getSingleTag(e, 'pool');
    const epochStr = getSingleTag(e, 'epoch');
    const rateStr = getSingleTag(e, 'rate');
    const relay = getSingleTag(e, 'relay') ?? '';
    const campaign = getSingleTag(e, 'campaign') ?? '';
    const slot = getSingleTag(e, 'slot') ?? 'feed';
    if (!creator || !postId || !pool || !epochStr) continue;

    out.push({
      viewer: e.pubkey,
      creator,
      postId,
      relay,
      campaign,
      pool,
      epoch: parseInt(epochStr, 10),
      rate: parseFloat(rateStr ?? '0'),
      slot,
      eventId: e.id,
    });
  }
  return out;
}

/** Validate receipts: dedupe, rate caps, epoch filter. */
export function filterValidReceipts(
  receipts: EngagementReceipt[],
  epoch: number,
  viewerStakes: Map<string, number>,
  rules: PoolRules = DEFAULT_POOL_RULES,
): { valid: EngagementReceipt[]; rejected: { receipt: EngagementReceipt; reason: string }[] } {
  const valid: EngagementReceipt[] = [];
  const rejected: { receipt: EngagementReceipt; reason: string }[] = [];
  const seen = new Set<string>();
  const viewerCounts = new Map<string, number>();

  for (const r of receipts) {
    if (r.epoch !== epoch) {
      rejected.push({ receipt: r, reason: 'wrong epoch' });
      continue;
    }

    const dedupeKey = `${r.viewer}:${r.postId}:${r.campaign}:${r.slot}`;
    if (seen.has(dedupeKey)) {
      rejected.push({ receipt: r, reason: 'duplicate' });
      continue;
    }
    seen.add(dedupeKey);

    const count = (viewerCounts.get(r.viewer) ?? 0) + 1;
    viewerCounts.set(r.viewer, count);
    if (count > rules.maxReceiptsPerViewer) {
      rejected.push({ receipt: r, reason: 'viewer rate cap' });
      continue;
    }

    const stake = viewerStakes.get(r.viewer) ?? 0;
    if (stake < rules.minStakeSats) {
      rejected.push({ receipt: r, reason: 'insufficient stake' });
      continue;
    }

    valid.push(r);
  }

  return { valid, rejected };
}

function receiptValue(r: EngagementReceipt): number {
  const mult = SLOT_MULTIPLIER[r.slot] ?? 1;
  return r.rate * mult;
}

/** Deterministic epoch payout — anyone can recompute from published inputs. */
export function computeEpochPayout(input: EpochPayoutInput): EpochPayoutResult {
  const rules = input.rules ?? DEFAULT_POOL_RULES;
  const ruleHash = computeRuleHash(rules);
  const R = input.grossSats;

  const creatorPool = Math.floor(R * rules.creatorShare);
  const relayPool = Math.floor(R * rules.relayShare);
  const gatewayPool = Math.floor(R * rules.gatewayShare);
  const devPool = R - creatorPool - relayPool - gatewayPool;

  const creatorRaw = new Map<string, number>();
  const relayAdRaw = new Map<string, number>();

  for (const r of input.receipts) {
    const v = receiptValue(r);
    creatorRaw.set(r.creator, (creatorRaw.get(r.creator) ?? 0) + v);
    if (r.relay) {
      relayAdRaw.set(r.relay, (relayAdRaw.get(r.relay) ?? 0) + 1);
    }
  }

  const creatorNorm = normalizeScores(creatorRaw);
  const relayAdNorm = normalizeScores(relayAdRaw);

  const relayWorkScores = new Map<string, number>();
  for (const w of input.relayWork) {
    const score =
      0.35 * w.eventsStored +
      0.25 * w.bandwidthServed +
      0.25 * w.uptime +
      0.15 * w.uniqueClients;
    relayWorkScores.set(w.relay, score);
  }
  const relayWorkNorm = normalizeScores(relayWorkScores);

  const gatewayNorm = normalizeScores(input.gatewaySpend);

  const devWeightTotal = input.devRecipients.reduce((a, d) => a + d.weight, 0);

  const leaves: PayoutLeaf[] = [];
  const creatorPayouts = new Map<string, number>();
  const relayPayouts = new Map<string, number>();

  const creatorRawTotal = [...creatorRaw.values()].reduce((a, b) => a + b, 0);
  const effectiveCreatorPool = creatorRawTotal === 0 ? 0 : creatorPool;
  const rollover = creatorRawTotal === 0 ? creatorPool : 0;
  const effectiveRelayPool = relayPool + rollover;

  for (const [pubkey, share] of creatorNorm) {
    const amount = Math.floor(share * effectiveCreatorPool);
    if (amount > 0) {
      leaves.push({
        pool: input.poolPubkey,
        epoch: input.epoch,
        recipient: pubkey,
        bucket: 'creator',
        amount,
        currency: 'sats',
      });
      creatorPayouts.set(pubkey, amount);
    }
  }

  const relayAdSubpool = Math.floor(effectiveRelayPool * rules.relayAdSubshare);
  const relayWorkSubpool = effectiveRelayPool - relayAdSubpool;

  for (const [pubkey, share] of relayAdNorm) {
    const amount = Math.floor(share * relayAdSubpool);
    if (amount > 0) {
      leaves.push({
        pool: input.poolPubkey,
        epoch: input.epoch,
        recipient: pubkey,
        bucket: 'relay',
        amount,
        currency: 'sats',
      });
      relayPayouts.set(pubkey, (relayPayouts.get(pubkey) ?? 0) + amount);
    }
  }

  for (const [pubkey, share] of relayWorkNorm) {
    const amount = Math.floor(share * relayWorkSubpool);
    if (amount > 0) {
      leaves.push({
        pool: input.poolPubkey,
        epoch: input.epoch,
        recipient: pubkey,
        bucket: 'relay',
        amount,
        currency: 'sats',
      });
      relayPayouts.set(pubkey, (relayPayouts.get(pubkey) ?? 0) + amount);
    }
  }

  for (const [pubkey, share] of gatewayNorm) {
    const amount = Math.floor(share * gatewayPool);
    if (amount > 0) {
      leaves.push({
        pool: input.poolPubkey,
        epoch: input.epoch,
        recipient: pubkey,
        bucket: 'gateway',
        amount,
        currency: 'sats',
      });
    }
  }

  for (const dev of input.devRecipients) {
    const amount = devWeightTotal > 0 ? Math.floor((dev.weight / devWeightTotal) * devPool) : 0;
    if (amount > 0) {
      leaves.push({
        pool: input.poolPubkey,
        epoch: input.epoch,
        recipient: dev.pubkey,
        bucket: 'dev',
        amount,
        currency: 'sats',
      });
    }
  }

  const creatorLeaves = leaves.filter((l) => l.bucket === 'creator');
  const relayLeaves = leaves.filter((l) => l.bucket === 'relay');
  const gatewayLeaves = leaves.filter((l) => l.bucket === 'gateway');
  const devLeaves = leaves.filter((l) => l.bucket === 'dev');

  const creatorTree = buildMerkleTree(creatorLeaves);
  const relayTree = buildMerkleTree(relayLeaves);
  const gatewayTree = buildMerkleTree(gatewayLeaves);
  const devTree = buildMerkleTree(devLeaves);

  const leafSum = leaves.reduce((a, l) => a + l.amount, 0);
  if (leafSum > R) {
    throw new Error(`Payout overflow: ${leafSum} > ${R}`);
  }

  return {
    creatorRoot: creatorTree.root,
    relayRoot: relayTree.root,
    gatewayRoot: gatewayTree.root,
    devRoot: devTree.root,
    leaves,
    creatorPayouts,
    relayPayouts,
    ruleHash,
  };
}

export function currentEpoch(unix = Math.floor(Date.now() / 1000)): number {
  return Math.floor(unix / 86400);
}