#!/usr/bin/env node
import { PitRelay } from './relay.js';

const port = parseInt(process.env.PIT_RELAY_PORT ?? '7777', 10);
const dbPath = process.env.PIT_RELAY_DB ?? './data/relay';
const name = process.env.PIT_RELAY_NAME ?? 'the-pit-relay';

const relay = new PitRelay({ port, dbPath, name });
relay.start();