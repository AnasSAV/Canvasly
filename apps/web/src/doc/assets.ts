import { MAX_ASSET_BYTES, type DocumentObject } from '@canvasly/shared';
import { useEffect, useState } from 'react';
import { ApiError } from '../lib/api';
import { useUI } from '../state/ui';

/**
 * Images are stored in the board's Durable Object SQLite (no R2: it needs a card on file). To keep that
 * cheap we downscale to 1600px and re-encode as WebP under 1 MB in the browser before uploading.
 */
export const MAX_IMAGE_SIDE = 1600;
export const MAX_INPUT_BYTES = 25 * 1024 * 1024;

async function decode(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(blob);
  } catch {
    // SVG and some formats can't go through createImageBitmap in every browser.
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

/** Downscale to MAX_IMAGE_SIDE and re-encode as WebP, lowering quality/size until under MAX_ASSET_BYTES. */
export async function compressImage(file: Blob): Promise<{ blob: Blob; width: number; height: number }> {
  if (file.size > MAX_INPUT_BYTES) throw new Error('Image is larger than 25 MB');
  return compressBitmap(await decode(file), MAX_IMAGE_SIDE);
}

export async function compressBitmap(
  src: ImageBitmap | HTMLImageElement | HTMLCanvasElement,
  maxSide: number,
): Promise<{ blob: Blob; width: number; height: number }> {
  const srcW = src.width;
  const srcH = src.height;
  let scale = Math.min(1, maxSide / Math.max(srcW, srcH));
  for (let attempt = 0; attempt < 6; attempt++) {
    const width = Math.max(1, Math.round(srcW * scale));
    const height = Math.max(1, Math.round(srcH * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d')!.drawImage(src, 0, 0, width, height);
    for (const quality of [0.85, 0.7, 0.55]) {
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/webp', quality));
      if (blob && blob.size <= MAX_ASSET_BYTES) return { blob, width, height };
    }
    scale *= 0.75;
  }
  throw new Error('Could not compress image under 1 MB');
}

/** `base` is the board's API root: /api/boards/:id, or /api/public/:token for public links. */
export const assetUrl = (base: string, assetId: string) => `${base}/assets/${assetId}`;

export async function uploadAsset(boardId: string, blob: Blob): Promise<string> {
  const res = await fetch(`/api/boards/${boardId}/assets`, {
    method: 'POST',
    body: blob,
    headers: { 'content-type': blob.type },
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
  if (!res.ok || !body.id) throw new ApiError(res.status, body.error ?? 'Upload failed');
  return body.id;
}

const images = new Map<string, Promise<HTMLImageElement | null>>();
const loaded = new Map<string, HTMLImageElement>();

export function loadImage(url: string): Promise<HTMLImageElement | null> {
  let p = images.get(url);
  if (!p) {
    const img = new Image();
    img.src = url;
    p = img
      .decode()
      .then(() => {
        loaded.set(url, img);
        return img;
      })
      .catch(() => {
        images.delete(url); // allow a retry later (e.g. after reconnecting)
        return null;
      });
    images.set(url, p);
  }
  return p;
}

/** Already-decoded image for synchronous drawing (thumbnails), or null. */
export const getLoadedImage = (url: string) => loaded.get(url) ?? null;

/**
 * The page of a document on show here. Anyone who can change it sees the saved page, so that others turning it move
 * them along too. Viewers, and anyone looking at a locked document, can't save theirs, so it stays their own.
 */
export function useDocumentPage(o: DocumentObject): number {
  const own = useUI((s) => s.documentPages[o.id]);
  const readOnly = useUI((s) => s.readOnly);
  const page = readOnly || o.locked ? (own ?? o.page) : o.page;
  return Math.max(0, Math.min(o.pages.length - 1, page));
}

export function useAssetImage(base: string, assetId: string): HTMLImageElement | null {
  const url = assetUrl(base, assetId);
  const [img, setImg] = useState<HTMLImageElement | null>(() => getLoadedImage(url));
  useEffect(() => {
    let alive = true;
    void loadImage(url).then((i) => alive && setImg(i));
    return () => {
      alive = false;
    };
  }, [url]);
  return img;
}
