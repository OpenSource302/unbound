# NIP-UNBOUND-02: Engagement Receipts

`draft` `optional`

## Abstract

Signed proofs that a viewer engaged with a monetized post. Atomic unit for creator payout attribution.

## Kind

`30078` — Engagement Receipt

## Tags

| Tag | Required | Description |
|-----|----------|-------------|
| `pool` | yes | Revenue pool escrow pubkey |
| `epoch` | yes | Epoch ID (floor(unix/86400)) |
| `p` | yes | Creator pubkey |
| `e` | yes | Post event id |
| `relay` | yes | Relay that served the ad |
| `campaign` | yes | Campaign id |
| `rate` | yes | Nominal attribution value (sats) |
| `slot` | yes | `feed`, `thread`, or `sidebar` |
| `nonce` | yes | Gateway-issued single-use nonce |

## Validation

Aggregators MUST reject receipts that fail any rule in [docs/PAYOUT.md](../docs/PAYOUT.md).

## Privacy

Viewers sign with their pubkey. Clients MAY use derived keys per pool in future revisions.