import type { PostMedia } from '@unbound/core';

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const VIDEO_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

export interface UploadResult {
  url: string;
  mime: string;
  kind: 'image' | 'video';
}

export function mediaKind(file: File): 'image' | 'video' | null {
  if (IMAGE_TYPES.has(file.type)) return 'image';
  if (VIDEO_TYPES.has(file.type)) return 'video';
  return null;
}

export function validateMediaFile(
  file: File,
  existing: { kind: 'image' | 'video' }[],
): string | null {
  const kind = mediaKind(file);
  if (!kind) return 'Only JPEG, PNG, GIF, WebP images and MP4/WebM videos are supported';

  const hasVideo = existing.some((m) => m.kind === 'video');
  if (kind === 'video' && (hasVideo || existing.length > 0)) {
    return 'Posts can have one video or up to 4 images — not both';
  }
  if (kind === 'image' && hasVideo) return 'Remove the video before adding images';
  if (kind === 'image' && existing.filter((m) => m.kind === 'image').length >= MAX_IMAGES) {
    return `Maximum ${MAX_IMAGES} images per post`;
  }

  const max = kind === 'video' ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (file.size > max) {
    const mb = Math.round(max / (1024 * 1024));
    return `File too large (max ${mb} MB for ${kind}s)`;
  }

  return null;
}

export async function uploadMediaFile(file: File): Promise<UploadResult> {
  const form = new FormData();
  form.append('file', file, file.name);

  const res = await fetch('/api/upload', { method: 'POST', body: form });
  const data = (await res.json()) as UploadResult & { error?: string };
  if (!res.ok) throw new Error(data.error ?? 'Upload failed');
  return data;
}

/** Use same-origin proxy URL in the browser when possible. */
export function displayMediaUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.pathname.startsWith('/media/')) return parsed.pathname;
    if (parsed.port === '7778' && parsed.pathname.startsWith('/media/')) {
      return parsed.pathname;
    }
  } catch {
    /* keep original */
  }
  return url;
}

export function toPostMedia(upload: UploadResult): PostMedia {
  return {
    url: upload.url,
    mime: upload.mime,
    kind: upload.kind,
  };
}