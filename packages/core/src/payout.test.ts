import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeEpochPayout, filterValidReceipts } from './payout.js';
import type { EngagementReceipt } from './payout.js';
import { verifyMerkleProof } from './merkle.js';
import { buildMerkleTree } from './merkle.js';

describe('payout', () => {
  it('splits revenue deterministically', () => {
    const receipts: EngagementReceipt[] = [
      {
        viewer: 'v1',
        creator: 'alice',
        postId: 'p1',
        relay: 'r1',
        campaign: 'c1',
        pool: 'pool1',
        epoch: 100,
        rate: 4,
        slot: 'feed',
        eventId: 'e1',
      },
      {
        viewer: 'v2',
        creator: 'bob',
        postId: 'p2',
        relay: 'r1',
        campaign: 'c1',
        pool: 'pool1',
        epoch: 100,
        rate: 4,
        slot: 'feed',
        eventId: 'e2',
      },
    ];

    const result = computeEpochPayout({
      grossSats: 1_000_000,
      receipts,
      relayWork: [{ relay: 'r1', eventsStored: 100, bandwidthServed: 50, uptime: 0.99, uniqueClients: 10 }],
      gatewaySpend: new Map([['gw1', 100]]),
      devRecipients: [{ pubkey: 'dev1', weight: 1 }],
      poolPubkey: 'pool1',
      epoch: 100,
    });

    assert.equal(result.creatorPayouts.get('alice'), 250_000);
    assert.equal(result.creatorPayouts.get('bob'), 250_000);
    assert.ok(result.relayPayouts.get('r1')! > 0);
    assert.ok(result.creatorRoot.length === 64);
  });

  it('rejects duplicate receipts', () => {
    const receipts: EngagementReceipt[] = [
      {
        viewer: 'v1',
        creator: 'alice',
        postId: 'p1',
        relay: 'r1',
        campaign: 'c1',
        pool: 'pool1',
        epoch: 100,
        rate: 4,
        slot: 'feed',
        eventId: 'e1',
      },
      {
        viewer: 'v1',
        creator: 'alice',
        postId: 'p1',
        relay: 'r1',
        campaign: 'c1',
        pool: 'pool1',
        epoch: 100,
        rate: 4,
        slot: 'feed',
        eventId: 'e1dup',
      },
    ];

    const { valid, rejected } = filterValidReceipts(
      receipts,
      100,
      new Map([['v1', 50_000]]),
    );
    assert.equal(valid.length, 1);
    assert.equal(rejected.length, 1);
    assert.equal(rejected[0]!.reason, 'duplicate');
  });

  it('merkle proofs verify', () => {
    const leaves = [
      { pool: 'p', epoch: 1, recipient: 'alice', bucket: 'creator' as const, amount: 100, currency: 'sats' as const },
      { pool: 'p', epoch: 1, recipient: 'bob', bucket: 'creator' as const, amount: 200, currency: 'sats' as const },
    ];
    const tree = buildMerkleTree(leaves);
    const proof = tree.proofs.get('creator:alice')!;
    assert.ok(verifyMerkleProof(leaves[0]!, proof, tree.root));
  });
});