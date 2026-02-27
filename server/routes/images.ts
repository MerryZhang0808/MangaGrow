import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { getImagesBase } from '../services/imageStorage.js';

const router = Router();

// Allowed image types (subdirectories)
// C21 v1.8: posters/inputs added for permanent storage; scenes kept for session images
const ALLOWED_TYPES = ['avatars', 'scenes', 'posters', 'inputs'];

// MIME type mapping
const MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp'
};

// GET /api/images/:type/:filename
router.get('/:type/:filename', (req: Request, res: Response) => {
  const type = req.params.type as string;
  const filename = req.params.filename as string;

  // Validate type
  if (!ALLOWED_TYPES.includes(type)) {
    return res.status(400).json({ success: false, error: 'Invalid image type' });
  }

  // Prevent path traversal
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return res.status(400).json({ success: false, error: 'Invalid filename' });
  }

  const fullPath = path.join(getImagesBase(), type, filename);

  if (!fs.existsSync(fullPath)) {
    return res.status(404).json({ success: false, error: 'Image not found' });
  }

  const ext = path.extname(filename).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  // Cache for 1 hour (images are immutable once created)
  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.sendFile(fullPath);
});

export default router;
