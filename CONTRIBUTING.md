# Contributing to Unbound

Everything in this project is open source. No hidden algorithms, no closed payout logic.

## Principles

1. **Transparency** — payout formulas, ranking weights, and validation rules live in public code and NIPs
2. **Determinism** — same inputs must always produce same outputs (ranking, payouts)
3. **Decentralization** — avoid single points of control; prefer opt-in and forkability
4. **Nostr compatibility** — extend NIPs, don't reinvent; document new kinds in `nips/`

## Development Setup

```bash
npm install
npm run build
npm test
npm run dev
```

## Pull Request Guidelines

- One logical change per PR
- Include tests for `@unbound/core` changes
- Update NIP docs if adding event kinds or changing validation rules
- Never commit secrets, keys, or `.env` files

## Code Structure

- `packages/core` — pure logic, no I/O; must be fully testable
- `packages/relay` — thin storage + WebSocket layer
- `packages/aggregator` — reads events, writes epoch breakdowns
- `apps/web` — UI only; business logic stays in core

## Reporting Payout or Ranking Bugs

Payout bugs are **critical**. Open an issue with:

- Epoch number
- Expected vs actual Merkle root
- Receipt set (or IPFS CID)
- `rule_hash` in use

## Governance

This repo has no corporate owner. Maintainers are stewards of the open protocol. Pool governance happens on-network via kind 30079 events, not in private Slack channels.