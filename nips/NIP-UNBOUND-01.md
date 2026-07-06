# NIP-UNBOUND-01: Relay Manifest

`draft` `optional`

## Abstract

Relays publish signed manifest events describing their policies, supported pools, and infrastructure metadata.

## Kind

`30077` — Relay Manifest (replaceable per pubkey)

## Tags

- `name` — human-readable relay name
- `description` — short description
- `pool` — revenue pool pubkey this relay supports (repeatable)
- `retention` — days to retain ephemeral kinds
- `contact` — contact pubkey or email
- `fee` — optional admission fee in sats

## Example

```json
{
  "kind": 30077,
  "tags": [
    ["name", "unbound-relay-east"],
    ["pool", "pool_pubkey_hex"],
    ["retention", "90"]
  ],
  "content": "Open relay for Unbound network"
}
```

## Client Behavior

Clients use manifest data to:

- Score relay quality in ranking (f8 feature)
- Route engagement receipts to endorsed pools
- Display pool split rules to users before opt-in