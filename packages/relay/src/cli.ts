#!/usr/bin/env node
import { UnboundRelay } from './relay.js';
import { MediaServer } from './media-server.js';

const port = parseInt(process.env.UNBOUND_RELAY_PORT ?? '7777', 10);
const mediaPort = parseInt(process.env.UNBOUND_MEDIA_PORT ?? '7778', 10);
const dbPath = process.env.UNBOUND_RELAY_DB ?? './data/relay';
const mediaDir = process.env.UNBOUND_MEDIA_DIR ?? './data/media';
const name = process.env.UNBOUND_RELAY_NAME ?? 'unbound-relay';
const mediaBaseUrl = process.env.UNBOUND_MEDIA_URL ?? `http://127.0.0.1:${mediaPort}`;

const relay = new UnboundRelay({ port, dbPath, name });
relay.start();

const media = new MediaServer({
  port: mediaPort,
  mediaDir,
  publicBaseUrl: mediaBaseUrl,
});
media.start();