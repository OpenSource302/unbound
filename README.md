# The Pit

**Decentralized social network. Nostr-style architecture. Creator revenue sharing. Zero corporate overlords.**

The Pit is a fully open-source Twitter alternative where:

- **Identity = cryptographic keys** (no signup, no passwords)
- **Relays are dumb** — store, validate signatures, forward events
- **Clients are smart** — ranking, filtering, payout verification run locally
- **Revenue splits automatically** — 50% creators, 30% relays, 15% gateway, 5% dev fund
- **Nothing is hidden** — every algorithm, split rule, and payout tree is public and auditable

Licensed under **AGPL-3.0** — fork it, run it, audit it, improve it.

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
│ @thepit/core│                            │ Aggregator  │
│ crypto/rank │                            │ Merkle trees│
│ payout      │                            └─────────────┘
└─────────────┘
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/PAYOUT.md](docs/PAYOUT.md) for full details.

## Monorepo Structure

| Package | Description |
|---------|-------------|
| [`packages/core`](packages/core) | Crypto, events, trust graph, PitRank, payout math, Merkle trees |
| [`packages/relay`](packages/relay) | NIP-01 WebSocket relay with SQLite storage |
| [`packages/aggregator`](packages/aggregator) | Epoch receipt validation + Merkle root publisher |
| [`apps/web`](apps/web) | React web client — post, feed, trending, payout dashboard |
| [`nips/`](nips/) | Protocol specifications (NIP-PIT-*) |
| [`docs/`](docs/) | Architecture and payout documentation |

## Quick Start

### Prerequisites

- Node.js 20+
- npm 10+

### Install

```bash
git clone https://github.com/YOUR_USERNAME/the-pit.git
cd the-pit
npm install
npm run build
```

### Run locally

**Terminal 1 — Relay:**
```bash
npm run dev:relay
# ws://127.0.0.1:7777
```

**Terminal 2 — Web client:**
```bash
npm run dev:web
# http://localhost:3000
```

**Terminal 3 — Aggregator (optional):**
```bash
npm run dev:aggregator
```

Or run everything:
```bash
npm run dev
```

### Environment variables

Copy `.env.example` to `.env`:

| Variable | Default | Description |
|----------|---------|-------------|
| `PIT_RELAY_PORT` | `7777` | Relay WebSocket port |
| `PIT_RELAY_DB` | `./data/relay.db` | Relay SQLite path |
| `PIT_RELAY_URL` | `ws://127.0.0.1:7777` | Aggregator relay connection |
| `PIT_EPOCH_GROSS` | `1000000` | Simulated epoch gross (sats) |
| `PIT_AGG_OUTPUT` | `./data/epochs` | Payout breakdown output dir |

## How Payouts Work (No Central Control)

1. **Pool rules** are published as signed events before money enters
2. **Engagement receipts** (kind 30078) are signed by viewers after ad impressions
3. **Aggregators** independently validate receipts and build Merkle trees
4. **Oracles** (3-of-5 multisig) co-sign only if their recomputation matches
5. **Disbursement** via Lightning keysend or Merkle-verified claims

Anyone can recompute payouts from public data. No admin panel. No "creator fund."

Default split (defined in `@thepit/core`):

```
50% → Creators (engagement-weighted)
30% → Relays (70% ad served + 30% infrastructure work)
15% → Ad gateway
 5% → Dev fund
```

## Ranking

**PitRank v1** runs entirely on the client:

- Trust-weighted engagement (web of trust + follows)
- Stake-weighted creator signal
- Freshness decay
- Diversity penalty (no single author dominates)
- Pluggable feed modes: chron, friends, pit, stake, chaos

Global trending = median consensus across rank snapshot publishers (kind 30084).

## Protocol Specs

- [NIP-PIT-01](nips/NIP-PIT-01.md) — Relay manifest & policies
- [NIP-PIT-02](nips/NIP-PIT-02.md) — Engagement receipts
- [NIP-PIT-03](nips/NIP-PIT-03.md) — Revenue pools & payout trees
- [NIP-PIT-04](nips/NIP-PIT-04.md) — Ranking snapshots

## Testing

```bash
npm test
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). All code, specs, and payout logic must remain open source.

## License

AGPL-3.0-or-later — see [LICENSE](LICENSE). Network services must provide source to users.