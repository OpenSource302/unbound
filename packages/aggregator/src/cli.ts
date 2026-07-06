#!/usr/bin/env node
import { EpochAggregator } from './aggregator.js';
import { generateSecretKey, getPublicKey, hexToBytes } from '@unbound/core';

const relayUrl = process.env.UNBOUND_RELAY_URL ?? 'ws://127.0.0.1:7777';
const poolPubkey = process.env.UNBOUND_POOL_PUBKEY ?? getPublicKey(generateSecretKey());
const grossSats = parseInt(process.env.UNBOUND_EPOCH_GROSS ?? '1000000', 10);
const outputDir = process.env.UNBOUND_AGG_OUTPUT ?? './data/epochs';

const secretHex = process.env.UNBOUND_AGG_SECRET;
const secret = secretHex ? hexToBytes(secretHex) : generateSecretKey();
const pubkey = getPublicKey(secret);

console.log(`[aggregator] pubkey: ${pubkey}`);
console.log(`[aggregator] connecting to ${relayUrl}`);

const agg = new EpochAggregator({
  relayUrl,
  poolPubkey,
  grossSats,
  aggregatorPubkey: pubkey,
  aggregatorSecret: secret,
  outputDir,
  devRecipients: [{ pubkey, weight: 1 }],
});

await agg.connect();
const rootEvent = await agg.processEpoch();
agg.publishEvent(rootEvent);
console.log(`[aggregator] published payout root for epoch, event id: ${rootEvent.id}`);