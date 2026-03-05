import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IMAGES_BASE = path.resolve(__dirname, '../../data/images');

// C21: type must be one of avatars/posters/inputs (v1.8 updated, scenes removed)
export type ImageType = 'avatars' | 'posters' | 'inputs';

/**
 * Ensure image storage directories exist.
 * Called at server startup.
 * C21: data/images/{avatars|posters|inputs}/ only.
 */
export function ensureDirectories(): void {
  const dirs = [
    path.join(IMAGES_BASE, 'avatars'),
    path.join(IMAGES_BASE, 'posters'),   // C21 v1.8: permanent poster storage
    path.join(IMAGES_BASE, 'inputs'),    // C21 v1.8: permanent input photo storage
    path.join(IMAGES_BASE, 'scenes'),    // transient session storage (imageGenerator)
  ];
  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
  }
  console.log('[ImageStorage] Directories ready');
}

/**
 * Save base64 image data to disk.
 * C25: Uses UUID for unique filenames.
 * C21: Images stored in data/images/{type}/ only.
 * @returns Relative path like "avatars/abc123.png"
 */
export function saveImage(type: ImageType, base64Data: string, mimeType = 'image/png'): string {
  const ext = mimeType.includes('jpeg') || mimeType.includes('jpg') ? '.jpg' : '.png';
  const filename = `${crypto.randomUUID()}${ext}`;
  const relativePath = `${type}/${filename}`;
  const fullPath = path.join(IMAGES_BASE, relativePath);

  const buffer = Buffer.from(base64Data, 'base64');
  fs.writeFileSync(fullPath, buffer);

  return relativePath;
}

/**
 * Get full disk path for an image.
 */
export function getImageFullPath(relativePath: string): string {
  return path.join(IMAGES_BASE, relativePath);
}

/**
 * Get the base directory for all images.
 */
export function getImagesBase(): string {
  return IMAGES_BASE;
}

/**
 * Delete an image file from disk.
 */
export function deleteImage(relativePath: string): void {
  const fullPath = path.join(IMAGES_BASE, relativePath);
  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
  }
}
