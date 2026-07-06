import type { NostrEvent } from './types.js';
import { KIND } from './types.js';
import { getSingleTag } from './events.js';

export interface TrustEdge {
  from: string;
  to: string;
  score: number;
}

export interface TrustGraphOptions {
  decay?: number;
  maxHops?: number;
  followBootstrap?: number;
}

const DEFAULT_OPTS: Required<TrustGraphOptions> = {
  decay: 0.65,
  maxHops: 4,
  followBootstrap: 0.15,
};

/** Build directed trust edges from kind 30082 and follow list (kind 3). */
export function buildTrustEdges(events: NostrEvent[]): TrustEdge[] {
  const edges: TrustEdge[] = [];

  for (const e of events) {
    if (e.kind === KIND.TRUST) {
      const target = getSingleTag(e, 'p');
      const scoreStr = getSingleTag(e, 'score');
      if (target && scoreStr) {
        const score = Math.min(1, Math.max(0, parseFloat(scoreStr)));
        if (!Number.isNaN(score)) edges.push({ from: e.pubkey, to: target, score });
      }
    }
    if (e.kind === KIND.FOLLOW) {
      const target = getSingleTag(e, 'p');
      if (target) {
        edges.push({ from: e.pubkey, to: target, score: DEFAULT_OPTS.followBootstrap });
      }
    }
  }

  return edges;
}

/** Compute trust from viewer to target via path multiplication with decay. */
export function computeTrust(
  viewer: string,
  target: string,
  edges: TrustEdge[],
  opts: TrustGraphOptions = {},
): number {
  const { decay, maxHops } = { ...DEFAULT_OPTS, ...opts };
  if (viewer === target) return 1;

  const adj = new Map<string, TrustEdge[]>();
  for (const e of edges) {
    const list = adj.get(e.from) ?? [];
    list.push(e);
    adj.set(e.from, list);
  }

  let best = 0;
  const queue: { node: string; trust: number; depth: number }[] = [
    { node: viewer, trust: 1, depth: 0 },
  ];

  while (queue.length > 0) {
    const { node, trust, depth } = queue.shift()!;
    if (depth >= maxHops) continue;

    for (const edge of adj.get(node) ?? []) {
      const nextTrust = trust * edge.score * Math.pow(decay, depth + 1);
      if (edge.to === target) {
        best = Math.max(best, Math.min(0.95, nextTrust));
      } else if (nextTrust > 0.01) {
        queue.push({ node: edge.to, trust: nextTrust, depth: depth + 1 });
      }
    }
  }

  return best;
}

export function buildTrustIndex(
  viewer: string,
  edges: TrustEdge[],
  pubkeys: string[],
  opts?: TrustGraphOptions,
): Map<string, number> {
  const index = new Map<string, number>();
  for (const pk of pubkeys) {
    index.set(pk, computeTrust(viewer, pk, edges, opts));
  }
  return index;
}