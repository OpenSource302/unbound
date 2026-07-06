import type { NostrEvent } from './types.js';

export interface PostMedia {
  url: string;
  mime: string;
  kind: 'image' | 'video';
  alt?: string;
}

/** NIP-92-style imeta tags for images and videos. */
export function buildPostMediaTags(media: PostMedia[]): string[][] {
  return media.map((m) => {
    const tag = ['imeta', `url ${m.url}`, `m ${m.mime}`];
    if (m.alt) tag.push(`alt ${m.alt}`);
    if (m.kind === 'video') tag.push('streaming');
    return tag;
  });
}

/** Extract attached media from a post event. */
export function parsePostMedia(event: NostrEvent): PostMedia[] {
  const out: PostMedia[] = [];

  for (const tag of event.tags) {
    if (tag[0] !== 'imeta') continue;
    let url = '';
    let mime = '';
    let alt = '';
    for (let i = 1; i < tag.length; i++) {
      const part = tag[i]!;
      if (part.startsWith('url ')) url = part.slice(4);
      else if (part.startsWith('m ')) mime = part.slice(2);
      else if (part.startsWith('alt ')) alt = part.slice(4);
    }
    if (!url || !mime) continue;
    out.push({
      url,
      mime,
      kind: mime.startsWith('video/') ? 'video' : 'image',
      alt: alt || undefined,
    });
  }

  for (const tag of event.tags) {
    if (tag[0] === 'image' && tag[1]) {
      out.push({ url: tag[1], mime: 'image/jpeg', kind: 'image' });
    }
  }

  return out;
}