/** Nostr-compatible event structure (NIP-01). */
export interface NostrEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

export type UnsignedEvent = Omit<NostrEvent, 'id' | 'sig'>;

/** Standard Nostr kinds used by Unbound. */
export const KIND = {
  METADATA: 0,
  POST: 1,
  FOLLOW: 3,
  MUTE: 5,
  REPOST: 6,
  REACTION: 7,
  /** Trust attestation (web of trust edge). */
  TRUST: 30082,
  /** Stake deposit lock. */
  STAKE: 30083,
  /** Ranking snapshot for discovery consensus. */
  RANK_SNAPSHOT: 30084,
  /** Fraud accusation / dispute. */
  FRAUD: 30085,
  /** Stake slash event. */
  SLASH: 30086,
  /** Governance / epoch settlement. */
  REVENUE: 30079,
  /** Engagement receipt (payout unit). */
  ENGAGEMENT: 30078,
  /** Merkle payout root. */
  PAYOUT_ROOT: 30080,
  /** Creator payout claim. */
  PAYOUT_CLAIM: 30081,
  /** Relay storage attestation. */
  RELAY_ATTEST: 30088,
  /** Ad campaign definition. */
  CAMPAIGN: 30091,
  /** Pool genesis manifest. */
  POOL_MANIFEST: 30092,
  /** Username claim (unique, tied to pubkey). */
  USERNAME: 30095,
} as const;

export type UnboundKind = (typeof KIND)[keyof typeof KIND];

/** Revenue split buckets — all percentages must sum to 1.0. */
export interface PoolRules {
  version: string;
  creatorShare: number;
  relayShare: number;
  gatewayShare: number;
  devShare: number;
  relayAdSubshare: number;
  relayWorkSubshare: number;
  minStakeSats: number;
  maxReceiptsPerViewer: number;
  epochHours: number;
  disputeHours: number;
}

export const DEFAULT_POOL_RULES: PoolRules = {
  version: 'unbound-pool-rules-v1',
  creatorShare: 0.5,
  relayShare: 0.3,
  gatewayShare: 0.15,
  devShare: 0.05,
  relayAdSubshare: 0.7,
  relayWorkSubshare: 0.3,
  minStakeSats: 10_000,
  maxReceiptsPerViewer: 200,
  epochHours: 24,
  disputeHours: 72,
};

export interface PayoutLeaf {
  pool: string;
  epoch: number;
  recipient: string;
  bucket: 'creator' | 'relay' | 'gateway' | 'dev';
  amount: number;
  currency: 'sats';
}

export interface MerkleTreeResult {
  root: string;
  leaves: PayoutLeaf[];
  proofs: Map<string, string[]>;
}

export interface RankedPost {
  eventId: string;
  author: string;
  score: number;
  position: number;
}

export interface FeedParams {
  mode: 'chron' | 'friends' | 'open' | 'stake' | 'chaos';
  weights: Record<string, number>;
}

export const DEFAULT_FEED_PARAMS: FeedParams = {
  mode: 'open',
  weights: {
    likes: 3,
    reposts: 5,
    replies: 4,
    proximity: 8,
    stake: 2,
    freshness: 6,
    spam: -10,
    mute: -1000,
  },
};