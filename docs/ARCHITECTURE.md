# Unbound — Architecture

## Overview

Unbound is a Nostr-compatible decentralized social network with built-in creator revenue sharing. No blockchain. No central company.

## Components

### 1. Identity (Cryptographic Keys)

- secp256k1 keypair (NIP-01)
- Pubkey = account
- Events signed with BIP-340 Schnorr
- Optional: NIP-46 bunker signing, NIP-07 browser extension

### 2. Relays (Dumb Infrastructure)

Relays accept WebSocket connections and implement NIP-01:

- `EVENT` — validate signature, store, broadcast
- `REQ` — query with filters
- `CLOSE` — end subscription

Relays do NOT: rank feeds, serve ads, compute payouts, moderate globally.

Implementation: `@unbound/relay` — Rust-quality design in TypeScript + SQLite for MVP.

### 3. Clients (Smart Layer)

Clients (`@unbound/web`, future mobile/desktop):

- Manage relay pools (5–15 relays)
- Deduplicate events by `id`
- Run UnboundRank locally
- Render ads and sign engagement receipts
- Display payout dashboards with Merkle verification
- Publish rank snapshots (optional)

### 4. Aggregators (Payout Compute)

Independent services that:

1. Collect kind 30078 engagement receipts for an epoch
2. Validate (dedupe, stake gates, rate caps)
3. Run `computeEpochPayout()` from `@unbound/core`
4. Publish kind 30080 Merkle roots
5. Write full breakdown JSON to disk/IPFS

Anyone can run an aggregator. Clients require 2+ matching roots before showing "confirmed."

### 5. Oracles (Settlement)

3-of-5 multisig (Lightning or stablecoin) that:

1. Recomputes payout from public receipt set
2. Verifies Merkle root match
3. Co-signs settlement attestation (kind 30079)
4. Triggers disbursement

## Event Kinds

| Kind | Name |
|------|------|
| 1 | Post |
| 3 | Follow |
| 5 | Mute |
| 6 | Repost |
| 7 | Reaction |
| 30078 | Engagement receipt |
| 30079 | Revenue epoch / governance |
| 30080 | Payout Merkle root |
| 30081 | Payout claim |
| 30082 | Trust attestation |
| 30083 | Stake deposit |
| 30084 | Rank snapshot |
| 30085 | Fraud accusation |
| 30088 | Relay attestation |
| 30091 | Ad campaign |
| 30092 | Pool manifest |

## Data Flow

### Posting

```
User → sign kind 1 → EVENT → [relay1, relay2, relay3] → stored → broadcast to subscribers
```

### Reading

```
Client → REQ (filters) → relays → merge + dedupe → UnboundRank → feed
```

### Monetization

```
Advertiser → pool escrow → gateway campaign → client shows ad → viewer signs kind 30078 → relays → aggregator → Merkle root → oracles → payout
```

## Anti-Fragility

| Failure | Fallback |
|---------|----------|
| Relay down | Client uses other relays in pool |
| Aggregator lies | Cross-check multiple aggregators |
| Oracle offline | 3-of-5 still works |
| Client censored | Static build on IPFS |
| Pool rules unfair | Fork new pool with different split |

## Tech Stack

| Layer | Technology |
|-------|------------|
| Core | TypeScript, @noble/secp256k1 |
| Relay | Node.js, ws, better-sqlite3 |
| Web | React, Vite |
| Storage | SQLite (relay), IndexedDB (web, planned) |
| Settlement | Lightning (LDK, planned), Merkle proofs |