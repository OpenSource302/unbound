import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import Busboy from 'busboy';

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const VIDEO_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
};

export interface MediaServerOptions {
  port?: number;
  host?: string;
  mediaDir?: string;
  publicBaseUrl?: string;
}

export class MediaServer {
  private port: number;
  private host: string;
  private mediaDir: string;
  private publicBaseUrl: string;

  constructor(opts: MediaServerOptions = {}) {
    this.port = opts.port ?? 7778;
    this.host = opts.host ?? '0.0.0.0';
    this.mediaDir = opts.mediaDir ?? './data/media';
    this.publicBaseUrl = opts.publicBaseUrl ?? `http://127.0.0.1:${this.port}`;
  }

  start(): void {
    fs.mkdirSync(this.mediaDir, { recursive: true });
    const server = http.createServer((req, res) => {
      void this.handle(req, res);
    });
    server.listen(this.port, this.host, () => {
      console.log(`[unbound-media] http://${this.host}:${this.port}`);
      console.log(`[unbound-media] storage: ${path.resolve(this.mediaDir)}`);
    });
  }

  private setCors(res: http.ServerResponse): void {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    this.setCors(res);

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

    if (req.method === 'POST' && url.pathname === '/api/upload') {
      await this.handleUpload(req, res);
      return;
    }

    if (req.method === 'GET' && url.pathname.startsWith('/media/')) {
      this.serveFile(url.pathname.slice('/media/'.length), res);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  }

  private handleUpload(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    return new Promise((resolve) => {
      const chunks: Buffer[] = [];
      let mime = '';
      let tooLarge = false;
      let maxBytes = MAX_VIDEO_BYTES;

      const bb = Busboy({
        headers: req.headers,
        limits: { files: 1, fileSize: MAX_VIDEO_BYTES },
      });

      bb.on('file', (_name, stream, info) => {
        mime = info.mimeType;
        maxBytes = VIDEO_TYPES.has(mime) ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;

        stream.on('data', (chunk: Buffer) => {
          if (tooLarge) return;
          chunks.push(chunk);
          if (Buffer.concat(chunks).length > maxBytes) {
            tooLarge = true;
          }
        });
      });

      bb.on('error', (err) => {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
        resolve();
      });

      bb.on('finish', () => {
        void (async () => {
          try {
            if (!mime) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'no file provided' }));
              return;
            }

            if (!IMAGE_TYPES.has(mime) && !VIDEO_TYPES.has(mime)) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'unsupported file type' }));
              return;
            }

            const buf = Buffer.concat(chunks);
            if (tooLarge || buf.length > maxBytes) {
              res.writeHead(413, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'file too large' }));
              return;
            }

            if (buf.length === 0) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'empty file' }));
              return;
            }

            const hash = createHash('sha256').update(buf).digest('hex');
            const ext = EXT_BY_MIME[mime] ?? '';
            const filename = `${hash}${ext}`;
            const dest = path.join(this.mediaDir, filename);

            if (!fs.existsSync(dest)) {
              fs.writeFileSync(dest, buf);
            }

            const publicUrl = `${this.publicBaseUrl}/media/${filename}`;
            const kind = VIDEO_TYPES.has(mime) ? 'video' : 'image';

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ url: publicUrl, mime, kind, hash: filename }));
          } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'upload failed' }));
          } finally {
            resolve();
          }
        })();
      });

      req.pipe(bb);
    });
  }

  private serveFile(filename: string, res: http.ServerResponse): void {
    const safe = path.basename(filename);
    if (!safe || safe !== filename) {
      res.writeHead(400);
      res.end();
      return;
    }

    const filePath = path.join(this.mediaDir, safe);
    if (!fs.existsSync(filePath)) {
      res.writeHead(404);
      res.end();
      return;
    }

    const ext = path.extname(safe).toLowerCase();
    const mime =
      ext === '.jpg' || ext === '.jpeg'
        ? 'image/jpeg'
        : ext === '.png'
          ? 'image/png'
          : ext === '.gif'
            ? 'image/gif'
            : ext === '.webp'
              ? 'image/webp'
              : ext === '.mp4'
                ? 'video/mp4'
                : ext === '.webm'
                  ? 'video/webm'
                  : ext === '.mov'
                    ? 'video/quicktime'
                    : 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': mime,
      'Cache-Control': 'public, max-age=31536000, immutable',
    });
    fs.createReadStream(filePath).pipe(res);
  }
}