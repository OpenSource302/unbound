#!/usr/bin/env node
import { UnboundRelay } from './relay.js';

const port = parseInt(process.env.UNBOUND_RELAY_PORT ?? '7777', 10);
const dbPath = process.env.UNBOUND_RELAY_DB ?? './data/relay';
const name = process.env.UNBOUND_RELAY_NAME ?? 'unbound-relay';

const relay = new UnboundRelay({ port, dbPath, name });
relay.start();