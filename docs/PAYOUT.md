# The Pit — Payout System

## Design Goal

Revenue flows to creators and relay operators proportional to measured value — with no central company controlling disbursement.

## Revenue Pool

A pool is defined by:

- `escrow_pubkey` — where money sits
- `rule_hash` — SHA-256 of canonical split rules
- `oracle_set` — M-of-N multisig signers
- `aggregator_set` — who may publish Merkle roots

All defined in kind 30092 pool manifest events.

## Default Split

```
creator_pool   = gross × 0.50
relay_pool     = gross × 0.30
gateway_pool   = gross × 0.15
dev_pool       = gross × 0.05
```

Within relay pool:
```
relay_ad   = relay_pool × 0.70  (proportional to impressions served)
relay_work = relay_pool × 0.30  (proportional to infrastructure attestations)
```

## Engagement Receipt (kind 30078)

Atomic attribution unit. Signed by viewer.

Required tags: `pool`, `epoch`, `p` (creator), `e` (post), `relay`, `campaign`, `rate`, `slot`, `nonce`

### Validation Rules

| Rule | Enforcement |
|------|-------------|
| Valid signature | secp256k1 verify |
| Epoch open | `created_at` in window |
| Nonce unique | aggregator bloom filter |
| Viewer stake ≥ 10k sats OR trust-degree ≥ 2 | stake index |
| Max 200 receipts/viewer/epoch | counter |
| No duplicate (viewer, post, campaign, slot) | dedupe set |

Rejected receipts go to public rejection log in epoch breakdown JSON.

## Attribution Formula

```
raw_creator[c] = Σ rate(r) × slot_mult(r)  for valid receipts where creator = c

creator_pay[c] = (raw_creator[c] / Σ raw_creator) × creator_pool
```

Slot multipliers: feed=1.0, thread=0.7, sidebar=0.4

## Merkle Trees

Separate trees per bucket: creator, relay, gateway, dev.

Leaf (canonical JSON):
```json
{"pool":"...","epoch":19723,"recipient":"pubkey","bucket":"creator","amount":2625000,"currency":"sats"}
```

Root published in kind 30080. Full breakdown on IPFS/disk.

## Settlement Flow

```
1. Epoch closes (24h)
2. Aggregators publish kind 30080
3. 72h dispute window (kind 30085 fraud proofs)
4. Oracles recompute → verify roots → co-sign kind 30079 status=settled
5. Auto-disburse < 100k sats via keysend; claims via kind 30081 for larger
```

## No Central Control — Guarantees

1. **Rules committed before deposit** — `rule_hash` in manifest
2. **Deterministic recomputation** — `computeEpochPayout()` in open source
3. **M-of-N oracles** — no single signer
4. **Merkle proofs** — creators verify their line item
5. **Forkable pools** — unhappy? New pool, new rules, market choice

## Implementation

See `packages/core/src/payout.ts` and `packages/aggregator/`.