# NIP-PIT-04: Ranking Snapshots

`draft` `optional`

## Abstract

Clients publish ranked post lists for decentralized trending consensus.

## Kind

`30084` — Rank Snapshot

## Tags

- `algo` — SHA-256 fingerprint of ranking algorithm + weights
- `window` — time window (`24h`, `7d`)
- `d` — dimension identifier (`pit-global`, `pit-regional`, etc.)
- `rank` — `event_id`, `score`, `position` (repeatable)

## Consensus

Clients aggregate snapshots from trusted publishers:

1. Event must appear in ≥ 40% of snapshots
2. Score = median(scores) × (agreement_count / total_publishers)
3. Sort descending

## Algorithm

Default: PitRank v1 in `packages/core/src/ranking.ts`. Algorithm hash:

```
SHA256("PitRank-v1-" + canonical_json(feed_params))
```

Publishers SHOULD include `algo` tag so consumers can filter by algorithm version.