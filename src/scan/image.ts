// Miniature d'étiquette (~240 px, JPEG q0,6) — voir research.md §7.
import { PHOTO_SEGMENTS, PHOTO_SEGMENT_SIZE } from '../data/schema';

export interface Thumbnail {
  /** Image JPEG encodée en base64, sans préfixe `data:`. */
  data: string;
  mime: 'image/jpeg';
  width: number;
  height: number;
}

export const THUMB_MAX = 240;
export const THUMB_QUALITY = 0.6;
const MAX_BASE64 = PHOTO_SEGMENTS * PHOTO_SEGMENT_SIZE;

/** Dimensions ramenées à `max` sur le plus grand côté (jamais agrandies). */
export function fitSize(width: number, height: number, max = THUMB_MAX): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function dataUrlToBase64(dataUrl: string): string {
  const i = dataUrl.indexOf(',');
  return i >= 0 ? dataUrl.slice(i + 1) : dataUrl;
}

export const toDataUrl = (t: { data: string; mime: string }): string => `data:${t.mime};base64,${t.data}`;

/**
 * Génère la miniature d'une photo. Réduit la qualité puis la taille jusqu'à tenir dans les cellules
 * de la feuille (3 × 40 000 caractères).
 */
export async function makeThumbnail(file: Blob, max = THUMB_MAX, quality = THUMB_QUALITY): Promise<Thumbnail> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => createImageBitmap(file));
  try {
    let size = fitSize(bitmap.width, bitmap.height, max);
    let q = quality;
    for (let attempt = 0; attempt < 8; attempt++) {
      const canvas = document.createElement('canvas');
      canvas.width = size.width;
      canvas.height = size.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas indisponible');
      ctx.drawImage(bitmap, 0, 0, size.width, size.height);
      const data = dataUrlToBase64(canvas.toDataURL('image/jpeg', q));
      if (data.length <= MAX_BASE64) return { data, mime: 'image/jpeg', ...size };
      if (q > 0.35) q -= 0.1;
      else size = fitSize(size.width, size.height, Math.round(Math.max(size.width, size.height) * 0.8));
    }
    throw new Error('Impossible de réduire suffisamment la photo');
  } finally {
    bitmap.close();
  }
}
