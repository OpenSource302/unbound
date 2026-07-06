import type { NostrEvent, FeedParams, RankedPost } from './types.js';
import { DEFAULT_FEED_PARAMS, KIND } from './types.js';
import { getSingleTag } from './events.js';
import { sha256Hex } from './crypto.js';
import { buildTrustEdges, computeTrust } from './trust.js';

export interface RankingContext {
  viewer: string;
  events: NostrEvent[];
  follows: Set<string>;
  mutes: Set<string>;
  blocks: Set<string>;
  stakes: Map<string, number>;
  params?: FeedParams;
}

const REACTION_WEIGHTS: Record<string, number> = {
  like: 1.0,
  fire: 1.5,
  skull: 0.8,
  rekt: 2.0,
};

function freshness(createdAt: number, now = Math.floor(Date.now() / 1000)): number {
  const ageHours = (now - createdAt) / 3600;
  return Math.exp(-ageHours / 36);
}

function getPostAuthor(event: NostrEvent): string {
  if (event.kind === KIND.REPOST) {
    const author = getSingleTag(event, 'p');
    if (author) return author;
  }
  return event.pubkey;
}

function getReferencedPostId(event: NostrEvent): string | undefined {
  return getSingleTag(event, 'e');
}

export function computeAlgoHash(params: FeedParams = DEFAULT_FEED_PARAMS): string {
  return sha256Hex(`PitRank-v1-${JSON.stringify(params)}`).slice(0, 16);
}

/** PitRank v1 — deterministic local feed scoring. */
export function rankPosts(ctx: RankingContext): RankedPost[] {
  const params = ctx.params ?? DEFAULT_FEED_PARAMS;
  const w = params.weights;
  const now = Math.floor(Date.now() / 1000);

  const edges = buildTrustEdges(ctx.events);
  const posts = ctx.events.filter((e) => e.kind === KIND.POST || e.kind === KIND.REPOST);

  const reactions = ctx.events.filter((e) => e.kind === KIND.REACTION);
  const replies = ctx.events.filter((e) => e.kind === KIND.POST && getReferencedPostId(e));
  const reposts = ctx.events.filter((e) => e.kind === KIND.REPOST);

  const authorPostCount = new Map<string, number>();
  for (const p of ctx.events.filter((e) => e.kind === KIND.POST)) {
    if (now - p.created_at <= 86400) {
      authorPostCount.set(p.pubkey, (authorPostCount.get(p.pubkey) ?? 0) + 1);
    }
  }

  const scored: { event: NostrEvent; score: number }[] = [];

  for (const post of posts) {
    const author = getPostAuthor(post);
    if (ctx.mutes.has(author) || ctx.blocks.has(author)) continue;

    const postId = post.kind === KIND.REPOST ? getReferencedPostId(post) ?? post.id : post.id;
    const trustAuthor = ctx.follows.has(author)
      ? 1
      : computeTrust(ctx.viewer, author, edges);

    let f0 = 0;
    for (const r of reactions) {
      if (getReferencedPostId(r) !== postId) continue;
      const t = computeTrust(ctx.viewer, r.pubkey, edges);
      const k = getSingleTag(r, 'k') ?? 'like';
      f0 += t * t * (REACTION_WEIGHTS[k] ?? 1);
    }

    let f1 = 0;
    for (const r of reposts) {
      if (getReferencedPostId(r) !== postId) continue;
      const t = computeTrust(ctx.viewer, r.pubkey, edges);
      f1 += t * t * 2;
    }

    let f2 = 0;
    for (const r of replies) {
      if (getReferencedPostId(r) !== postId) continue;
      const t = computeTrust(ctx.viewer, r.pubkey, edges);
      f2 += t;
    }

    const f3 = trustAuthor;
    const stake = ctx.stakes.get(author) ?? 0;
    const f4 = Math.log1p(stake);
    const f5 = freshness(post.created_at, now);
    const f6 = Math.min(1, (authorPostCount.get(author) ?? 0) / 50);
    const f7 = ctx.mutes.has(author) ? 1 : 0;
    const f9 = author === ctx.viewer ? 0.3 : 1;

    let raw =
      w.likes * f0 +
      w.reposts * f1 +
      w.replies * f2 +
      w.proximity * f3 +
      w.stake * f4 +
      w.freshness * f5 +
      w.spam * f6 +
      w.mute * f7;

    if (params.mode === 'chron') raw = f5 * 100;
    if (params.mode === 'friends' && !ctx.follows.has(author) && trustAuthor < 0.3) continue;
    if (params.mode === 'stake') raw = w.stake * f4 * 5 + f0;

    scored.push({ event: post, score: raw * f9 });
  }

  scored.sort((a, b) => b.score - a.score);

  const picked: RankedPost[] = [];
  const authorCounts = new Map<string, number>();

  for (const { event, score } of scored) {
    const author = getPostAuthor(event);
    const count = authorCounts.get(author) ?? 0;
    let diversity = 1;
    if (count >= 2) diversity = 0.4;
    if (count >= 3) diversity = 0.1;

    const finalScore = score * diversity;
    if (finalScore <= 0 && params.mode !== 'chaos') continue;

    picked.push({
      eventId: event.id,
      author,
      score: finalScore,
      position: picked.length + 1,
    });
    authorCounts.set(author, count + 1);
  }

  return picked;
}

/** Median-consensus trending from multiple rank snapshots (kind 30084). */
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
    const sortedPos = [...positions].sort((a, b) => a - b);
    const mid = Math.floor(sortedScores.length / 2);
    const medianScore =
      sortedScores.length % 2 === 0
        ? (sortedScores[mid - 1]! + sortedScores[mid]!) / 2
        : sortedScores[mid]!;
    const medianPos =
      sortedPos.length % 2 === 0
        ? (sortedPos[mid - 1]! + sortedPos[mid]!) / 2
        : sortedPos[mid]!;

    results.push({
      eventId,
      author: '',
      score: medianScore * (positions.length / k),
      position: medianPos,
    });
  }

  results.sort((a, b) => b.score - a.score);
  return results.map((r, i) => ({ ...r, position: i + 1 }));
}

export function snapshotToEventTags(ranked: RankedPost[], algoHash: string, window = '24h'): string[][] {
  const tags: string[][] = [
    ['algo', algoHash],
    ['window', window],
    ['d', 'pit-global'],
  ];
  for (const r of ranked.slice(0, 100)) {
    tags.push(['rank', r.eventId, r.score.toFixed(2), String(r.position)]);
  }
  return tags;
}