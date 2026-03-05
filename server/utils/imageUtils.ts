import fs from 'fs';
import path from 'path';

/**
 * Parse a Data URI into mimeType and base64 data.
 * Also handles raw base64 strings (without data: prefix).
 */
export function parseDataUri(dataUri: string): { mimeType: string; data: string } {
  const matches = dataUri.match(/^data:([^;]+);base64,(.+)$/);
  if (matches && matches.length === 3) {
    return {
      mimeType: matches[1].split(';')[0],
      data: matches[2]
    };
  }
  // Raw base64 passed
  return {
    mimeType: 'image/jpeg',
    data: dataUri
  };
}

/**
 * Read an image file from disk and return as base64 data.
 */
export function readImageAsBase64(filePath: string): { mimeType: string; data: string } {
  const buffer = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mimeType = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
  return {
    mimeType,
    data: buffer.toString('base64')
  };
}
