import WebSocket from 'ws';
import type { NostrEvent } from '@thepit/core';
import {
  KIND,
  computeEpochPayout,
  currentEpoch,
  filterValidReceipts,
  parseEngagementReceipts,
  signEvent,
  createUnsignedEvent,
  getSingleTag,
} from '@thepit/core';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export interface AggregatorConfig {
  relayUrl: string;
  poolPubkey: string;
  grossSats: number;
  aggregatorPubkey: string;
  aggregatorSecret: Uint8Array;
  outputDir: string;
  devRecipients: { pubkey: string; weight: number }[];
}

export class EpochAggregator {
  private events: NostrEvent[] = [];
  private ws: WebSocket | null = null;

  constructor(private config: AggregatorConfig) {}

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.config.relayUrl);
      this.ws.on('open', () => {
        const subId = 'agg-sync';
        this.ws!.send(JSON.stringify([
          'REQ',
          subId,
          { kinds: [KIND.ENGAGEMENT, KIND.STAKE, KIND.RELAY_ATTEST, KIND.REVENUE] },
        ]));
        resolve();
      });
      this.ws.on('message', (data) => {
        const msg = JSON.parse(data.toString()) as unknown[];
        if (msg[0] === 'EVENT') {
          this.events.push(msg[2] as NostrEvent);
        }
      });
      this.ws.on('error', reject);
      setTimeout(resolve, 3000);
    });
  }

  async processEpoch(epoch = currentEpoch()): Promise<NostrEvent> {
    const receipts = parseEngagementReceipts(this.events);
    const stakes = new Map<string, number>();

    for (const e of this.events) {
      if (e.kind !== KIND.STAKE) continue;
      const amt = parseInt(getSingleTag(e, 'amt') ?? '0', 10);
      stakes.set(e.pubkey, (stakes.get(e.pubkey) ?? 0) + amt);
    }

    const relayWork = this.events
      .filter((e) => e.kind === KIND.RELAY_ATTEST)
      .map((e) => ({
        relay: e.pubkey,
        eventsStored: parseInt(getSingleTag(e, 'events') ?? '0', 10),
        bandwidthServed: parseInt(getSingleTag(e, 'bandwidth') ?? '0', 10),
        uptime: parseFloat(getSingleTag(e, 'uptime') ?? '0'),
        uniqueClients: parseInt(getSingleTag(e, 'clients') ?? '0', 10),
      }));

    const { valid, rejected } = filterValidReceipts(receipts, epoch, stakes);

    const payout = computeEpochPayout({
      grossSats: this.config.grossSats,
      receipts: valid,
      relayWork,
      gatewaySpend: new Map([[this.config.poolPubkey, this.config.grossSats * 0.15]]),
      devRecipients: this.config.devRecipients,
      poolPubkey: this.config.poolPubkey,
      epoch,
    });

    const breakdown = {
      epoch,
      pool: this.config.poolPubkey,
      grossSats: this.config.grossSats,
      ruleHash: payout.ruleHash,
      creatorRoot: payout.creatorRoot,
      relayRoot: payout.relayRoot,
      gatewayRoot: payout.gatewayRoot,
      devRoot: payout.devRoot,
      validReceipts: valid.length,
      rejectedReceipts: rejected,
      creatorPayouts: Object.fromEntries(payout.creatorPayouts),
      relayPayouts: Object.fromEntries(payout.relayPayouts),
      leaves: payout.leaves,
    };

    if (!existsSync(this.config.outputDir)) {
      mkdirSync(this.config.outputDir, { recursive: true });
    }
    const path = join(this.config.outputDir, `epoch-${epoch}.json`);
    writeFileSync(path, JSON.stringify(breakdown, null, 2));

    const unsigned = createUnsignedEvent({
      kind: KIND.PAYOUT_ROOT,
      pubkey: this.config.aggregatorPubkey,
      content: path,
      tags: [
        ['pool', this.config.poolPubkey],
        ['epoch', String(epoch)],
        ['root', payout.creatorRoot],
        ['root', payout.relayRoot],
        ['gross', String(this.config.grossSats)],
        ['receipts', String(valid.length)],
        ['rule', payout.ruleHash],
        ['agg', 'v1'],
      ],
    });

    return signEvent(unsigned, this.config.aggregatorSecret);
  }

  publishEvent(event: NostrEvent): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(['EVENT', event]));
    }
  }
}