import { newId } from '@canvasly/shared';
import { get, set } from 'idb-keyval';
import { useEffect, useState } from 'react';

/** Phase 1 keeps image blobs in IndexedDB; Phase 2 moves them to the board's Durable Object. */
export const MAX_IMAGE_SIDE = 1600;
export const MAX_IMAGE_BYTES = 1024 * 1024;
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

/** Downscale to MAX_IMAGE_SIDE and re-encode as WebP, lowering quality/size until under MAX_IMAGE_BYTES. */
export async function compressImage(file: Blob): Promise<{ blob: Blob; width: number; height: number }> {
  if (file.size > MAX_INPUT_BYTES) throw new Error('Image is larger than 25 MB');
  const src = await decode(file);
  const srcW = src.width;
  const srcH = src.height;
  let scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(srcW, srcH));
  for (let attempt = 0; attempt < 6; attempt++) {
    const width = Math.max(1, Math.round(srcW * scale));
    const height = Math.max(1, Math.round(srcH * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d')!.drawImage(src, 0, 0, width, height);
    for (const quality of [0.85, 0.7, 0.55]) {
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/webp', quality));
      if (blob && blob.size <= MAX_IMAGE_BYTES) return { blob, width, height };
    }
    scale *= 0.75;
  }
  throw new Error('Could not compress image under 1 MB');
}

export async function putAsset(blob: Blob): Promise<string> {
  const id = newId();
  await set(`asset:${id}`, blob);
  return id;
}

const imageCache = new Map<string, Promise<HTMLImageElement | null>>();

function loadAsset(assetId: string): Promise<HTMLImageElement | null> {
  let p = imageCache.get(assetId);
  if (!p) {
    p = (async () => {
      const blob = await get<Blob>(`asset:${assetId}`);
      if (!blob) return null;
      const img = new Image();
      img.src = URL.createObjectURL(blob);
      await img.decode();
      return img;
    })().catch(() => null);
    imageCache.set(assetId, p);
  }
  return p;
}

export function useAssetImage(assetId: string): HTMLImageElement | null {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    let alive = true;
    void loadAsset(assetId).then((i) => alive && setImg(i));
    return () => {
      alive = false;
    };
  }, [assetId]);
  return img;
}
