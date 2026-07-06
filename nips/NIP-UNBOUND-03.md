# NIP-UNBOUND-03: Revenue Pools & Payout Trees

`draft` `optional`

## Abstract

Transparent revenue pools with deterministic splits and Merkle-committed payouts.

## Kinds

| Kind | Purpose |
|------|---------|
| 30092 | Pool genesis manifest |
| 30079 | Epoch settlement / governance |
| 30080 | Merkle payout root |
| 30081 | Creator payout claim |

## Pool Manifest (30092)

Tags:
- `d` — pool identifier
- `type` — `genesis`
- `escrow` — escrow address
- `rule_hash` — SHA-256 of canonical rules JSON
- `oracle` — oracle pubkey (repeatable)
- `multisig` — `M`, `N` threshold

## Payout Root (30080)

Tags:
- `pool`, `epoch`, `gross`, `receipts`, `rule`, `agg`
- `root` — creator tree root (first)
- `root` — relay tree root (second)

`content` — path or IPFS CID to full breakdown

## Rule Hash

Computed from canonical JSON of `PoolRules` in `@unbound/core`. Default:

```json
{
  "creatorShare": 0.5,
  "relayShare": 0.3,
  "gatewayShare": 0.15,
  "devShare": 0.05
}
```

## Governance

Kind 30079 with `type=governance` proposes new `rule_hash` effective at `effective_epoch`. Requires M-of-N oracle ratification.