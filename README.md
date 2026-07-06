# Unbound

**Open Twitter. No censorship. Creators with stake.**

Unbound is a fully open-source decentralized social network — a Twitter clone where nobody can deplatform you, nobody owns your feed, and every creator has real skin in the game.

- **Your keys, your account** — cryptographic identity (Nostr-compatible). No signup form. No ban appeals.
- **No central moderation** — relays store and forward. You choose what you see. Blocks and mutes are personal, not corporate.
- **Creators earn automatically** — ad revenue and engagement split 50/30/15/5 between creators, relay operators, gateways, and the open-source fund. Transparent Merkle payouts. No opaque "creator fund."
- **Nothing hidden** — ranking algorithms, payout math, and pool rules are public AGPL code anyone can audit and fork.

## Why Unbound?

| Twitter | Unbound |
|---------|---------|
| Company owns your account | You own your keys |
| Opaque moderation | Personal filters, open relays |
| Creators get scraps | Creators get 50% of pool revenue |
| Black-box algorithm | Open UnboundRank, computed locally |
| One company, one point of failure | Anyone runs relays |

## Architecture

```
┌─────────────┐     WebSocket (NIP-01)     ┌─────────────┐
│  Web/Mobile │ ◄────────────────────────► │   Relays    │
│   Client    │                            │  (dumb)     │
└──────┬──────┘                            └──────┬──────┘
       │                                          │
       │  ranking, feeds, ads                     │ store & forward
       │  payout verification                     │
       ▼                                          ▼
┌─────────────┐                            ┌─────────────┐
│ @unbound/core│                           │ Aggregator  │
│ crypto/rank │                            │ Merkle trees│
│ payout      │                            └─────────────┘
└─────────────┘
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/PAYOUT.md](docs/PAYOUT.md).

## Monorepo

| Package | Description |
|---------|-------------|
| [`packages/core`](packages/core) | Crypto, trust graph, UnboundRank, payout math, Merkle trees |
| [`packages/relay`](packages/relay) | NIP-01 WebSocket relay |
| [`packages/aggregator`](packages/aggregator) | Epoch receipt validation + payout roots |
| [`apps/web`](apps/web) | Web client — post, feed, trending, earnings |
| [`nips/`](nips/) | Protocol specs (NIP-UNBOUND-*) |

## Quick Start

```bash
git clone https://github.com/opensource302/unbound.git
cd unbound
npm install
npm run build
npm run dev
```

- Relay: `ws://127.0.0.1:7777`
- Web: `http://localhost:3000`

## Revenue Split (default, forkable)

```
50% → Creators (engagement-weighted)
30% → Relay operators (infra + ad served)
15% → Ad gateway
 5% → Open-source dev fund
```

Every rule is in `@unbound/core` — recompute payouts yourself from public receipts.

## License

AGPL-3.0-or-later — fork it, run it, audit it. If you run a modified network service, you share the source.