import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { getDb } from '../db/index.js';
import { saveImage, deleteImage } from '../services/imageStorage.js';
import type { StorySummary, StoryDetail } from '../types.js';

const router = Router();

// Helper: build StorySummary from a DB row
function toSummary(row: any): StorySummary {
  return {
    id: row.id,
    title: row.title || null,
    createdAt: row.created_at,
    posterUrl: row.poster_url ? `/api/images/${row.poster_url}` : null,
    inputText: row.input_text || null,
  };
}

// Helper: build StoryDetail from a DB row
function toDetail(row: any): StoryDetail {
  let inputPhotos: string[] = [];
  if (row.input_photos) {
    try {
      const paths: string[] = JSON.parse(row.input_photos);
      inputPhotos = paths.map((p: string) => `/api/images/${p}`);
    } catch { /* ignore parse errors */ }
  }
  return {
    id: row.id,
    title: row.title || null,
    createdAt: row.created_at,
    posterUrl: row.poster_url ? `/api/images/${row.poster_url}` : null,
    inputText: row.input_text || null,
    inputPhotos,
    style: row.style || null,
  };
}

// GET /api/stories — return list of StorySummary (C24)
router.get('/', (_req: Request, res: Response) => {
  try {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM stories ORDER BY created_at DESC').all() as any[];
    res.json({ success: true, data: rows.map(toSummary) });
  } catch (e: any) {
    console.error('[Stories Route] list failed:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/stories/:id — return StoryDetail (C24)
router.get('/:id', (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const db = getDb();
    const row = db.prepare('SELECT * FROM stories WHERE id = ?').get(id) as any;
    if (!row) {
      return res.status(404).json({ success: false, error: 'Story not found' });
    }
    res.json({ success: true, data: toDetail(row) });
  } catch (e: any) {
    console.error('[Stories Route] get failed:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/stories — save poster + input photos + story record (C42, C24)
// Body: { title, input_text, input_photos: string[] (base64), poster_base64: string, style }
// C42: frontend calls this after ①posterGenerator.generatePoster() and ②base64 prep
router.post('/', (req: Request, res: Response) => {
  try {
    const { title, input_text, input_photos, poster_base64, style } = req.body;
    if (!poster_base64) {
      return res.status(400).json({ success: false, error: 'poster_base64 is required' });
    }

    // Save poster image to data/images/posters/ (C21)
    const posterPath = saveImage('posters', poster_base64);

    // Save each input photo to data/images/inputs/ (C21)
    const photoPaths: string[] = [];
    if (input_photos && Array.isArray(input_photos)) {
      for (const photoBase64 of input_photos) {
        if (photoBase64) {
          photoPaths.push(saveImage('inputs', photoBase64));
        }
      }
    }

    // Insert story record into DB
    const db = getDb();
    const storyId = crypto.randomUUID();
    const now = Date.now();

    db.prepare(`
      INSERT INTO stories (id, user_id, title, input_text, input_photos, poster_url, style, created_at)
      VALUES (?, NULL, ?, ?, ?, ?, ?, ?)
    `).run(
      storyId,
      title || null,
      input_text || null,
      JSON.stringify(photoPaths),
      posterPath,
      style || null,
      now
    );

    const row = db.prepare('SELECT * FROM stories WHERE id = ?').get(storyId) as any;
    res.json({ success: true, data: toSummary(row) });
  } catch (e: any) {
    console.error('[Stories Route] create failed:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// DELETE /api/stories/:id — cascade delete poster + input photo files then DB record (C24)
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const db = getDb();
    const row = db.prepare('SELECT poster_url, input_photos FROM stories WHERE id = ?').get(id) as any;
    if (!row) {
      return res.status(404).json({ success: false, error: 'Story not found' });
    }

    // Delete poster file
    if (row.poster_url) {
      try { deleteImage(row.poster_url); } catch { /* ignore */ }
    }

    // Delete input photo files
    if (row.input_photos) {
      try {
        const paths: string[] = JSON.parse(row.input_photos);
        for (const p of paths) {
          try { deleteImage(p); } catch { /* ignore */ }
        }
      } catch { /* ignore parse errors */ }
    }

    // Delete DB record
    db.prepare('DELETE FROM stories WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (e: any) {
    console.error('[Stories Route] delete failed:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

export default router;
