import type { NostrEvent, RankedPost } from './types.js';
import { KIND } from './types.js';
import { getSingleTag } from './events.js';
import { sha256Hex } from './crypto.js';

export interface RankingContext {
  viewer: string;
  events: NostrEvent[];
  follows: Set<string>;
  mutes: Set<string>;
  blocks: Set<string>;
}

export interface PostEngagement {
  likes: number;
  reposts: number;
}

function getReferencedPostId(event: NostrEvent): string | undefined {
  return getSingleTag(event, 'e');
}

function isHidden(author: string, ctx: RankingContext): boolean {
  return ctx.mutes.has(author) || ctx.blocks.has(author);
}

/** Community hot score: likes + 2× reposts. No algorithmic tuning. */
export function countEngagement(events: NostrEvent[]): Map<string, PostEngagement> {
  const counts = new Map<string, PostEngagement>();

  const bump = (postId: string, field: 'likes' | 'reposts') => {
    const cur = counts.get(postId) ?? { likes: 0, reposts: 0 };
    cur[field]++;
    counts.set(postId, cur);
  };

  for (const e of events) {
    if (e.kind === KIND.REACTION) {
      const postId = getReferencedPostId(e);
      if (postId) bump(postId, 'likes');
    }
    if (e.kind === KIND.REPOST) {
      const postId = getReferencedPostId(e);
      if (postId) bump(postId, 'reposts');
    }
  }

  return counts;
}

export function engagementScore(eng: PostEngagement): number {
  return eng.likes + eng.reposts * 2;
}

export function computeAlgoHash(): string {
  return sha256Hex('UnboundCommunityHot-v1').slice(0, 16);
}

/**
 * What's hot = what the community likes and reposts the most.
 * Pure counts. No diversity penalty, no trust weights, no stake boosts.
 */
export function rankHotPosts(ctx: RankingContext): RankedPost[] {
  const engagement = countEngagement(ctx.events);
  const posts = ctx.events.filter((e) => e.kind === KIND.POST);

  const scored: RankedPost[] = [];

  for (const post of posts) {
    const author = post.pubkey;
    if (isHidden(author, ctx)) continue;

    const eng = engagement.get(post.id) ?? { likes: 0, reposts: 0 };
    const score = engagementScore(eng);
    if (score === 0) continue;

    scored.push({
      eventId: post.id,
      author,
      score,
      position: 0,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.map((r, i) => ({ ...r, position: i + 1 }));
}

/** Home feed: chronological posts from people you follow (+ yourself). */
export function homeTimeline(ctx: RankingContext): NostrEvent[] {
  const posts = ctx.events.filter((e) => e.kind === KIND.POST);
  return posts
    .filter((p) => {
      if (isHidden(p.pubkey, ctx)) return false;
      return ctx.follows.has(p.pubkey) || p.pubkey === ctx.viewer;
    })
    .sort((a, b) => b.created_at - a.created_at);
}

/** Explore: all posts chronological — you choose who to follow/mute locally. */
export function exploreTimeline(ctx: RankingContext): NostrEvent[] {
  return ctx.events
    .filter((e) => e.kind === KIND.POST && !isHidden(e.pubkey, ctx))
    .sort((a, b) => b.created_at - a.created_at);
}

/** @deprecated Use rankHotPosts — kept for compatibility. */
export function rankPosts(ctx: RankingContext & { stakes?: Map<string, number>; params?: unknown }): RankedPost[] {
  return rankHotPosts(ctx);
}

export function aggregateRankSnapshots(
  snapshots: NostrEvent[],
  minAgreementRatio = 0.4,
): RankedPost[] {
  if (snapshots.length === 0) return [];

  const k = snapshots.length;
  const minCount = Math.ceil(k * minAgreementRatio);
  const byEvent = new Map<string, { scores: number[]; positions: number[] }>();

  for (const snap of snapshots) {
    for (const tag of snap.tags) {
      if (tag[0] !== 'rank' || tag.length < 4) continue;
      const [, eventId, scoreStr, posStr] = tag;
      if (!eventId) continue;
      const entry = byEvent.get(eventId) ?? { scores: [], positions: [] };
      entry.scores.push(parseFloat(scoreStr ?? '0'));
      entry.positions.push(parseInt(posStr ?? '0', 10));
      byEvent.set(eventId, entry);
    }
  }

  const results: RankedPost[] = [];

  for (const [eventId, { scores, positions }] of byEvent) {
    if (positions.length < minCount) continue;
    const sortedScores = [...scores].sort((a, b) => a - b);
    const mid = Math.floor(sortedScores.length / 2);
    const medianScore =
      sortedScores.length % 2 === 0
        ? (sortedScores[mid - 1]! + sortedScores[mid]!) / 2
        : sortedScores[mid]!;

    results.push({
      eventId,
      author: '',
      score: medianScore * (positions.length / k),
      position: 0,
    });
  }

  results.sort((a, b) => b.score - a.score);
  return results.map((r, i) => ({ ...r, position: i + 1 }));
}

export function snapshotToEventTags(ranked: RankedPost[], algoHash: string, window = '24h'): string[][] {
  const tags: string[][] = [
    ['algo', algoHash],
    ['window', window],
    ['d', 'unbound-global'],
  ];
  for (const r of ranked.slice(0, 100)) {
    tags.push(['rank', r.eventId, r.score.toFixed(2), String(r.position)]);
  }
  return tags;
}