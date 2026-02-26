import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { getDb } from '../db/index.js';
import { createCharacterFull, updateCharacterDescription } from '../services/characterAnalyzer.js';
import { saveImage, deleteImage, getImageFullPath } from '../services/imageStorage.js';
import { CharacterData } from '../types.js';

const router = Router();

// Helper: convert DB row to API response format
function toApiCharacter(row: any): any {
  return {
    id: row.id,
    name: row.name,
    avatarUrl: row.avatar_path ? `/api/images/${row.avatar_path}` : null,
    description: row.description,
    originalPhotoUrls: row.original_photo_paths ? JSON.parse(row.original_photo_paths).map((p: string) => `/api/images/${p}`) : [],
    referenceSheetUrl: row.reference_sheet_path ? `/api/images/${row.reference_sheet_path}` : null,
    gender: row.gender,
    ageGroup: row.age_group,
    specificAge: row.specific_age,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

// GET /api/characters
router.get('/', (_req: Request, res: Response) => {
  try {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM characters ORDER BY created_at DESC').all();
    res.json({ success: true, data: (rows as any[]).map(toApiCharacter) });
  } catch (e: any) {
    console.error('[Characters Route] list failed:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/characters/:id
router.get('/:id', (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const db = getDb();
    const row = db.prepare('SELECT * FROM characters WHERE id = ?').get(id);
    if (!row) {
      return res.status(404).json({ success: false, error: 'Character not found' });
    }
    res.json({ success: true, data: toApiCharacter(row) });
  } catch (e: any) {
    console.error('[Characters Route] get failed:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/characters
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, photoBase64, mimeType } = req.body;
    if (!name || !photoBase64) {
      return res.status(400).json({ success: false, error: 'name and photoBase64 are required' });
    }

    const imgMimeType = mimeType || 'image/jpeg';

    // Full AI pipeline: analyze → avatar → gender/age
    const result = await createCharacterFull(name, photoBase64, imgMimeType);

    // Save avatar to disk
    const avatarPath = saveImage('avatars', result.avatarData, result.avatarMimeType);

    // Save original photo to disk
    const photoPath = saveImage('avatars', photoBase64, imgMimeType);

    // Insert into DB
    const id = crypto.randomUUID();
    const now = Date.now();
    const db = getDb();
    db.prepare(`
      INSERT INTO characters (id, user_id, name, avatar_path, description, original_photo_paths, gender, age_group, created_at)
      VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, name, avatarPath, result.description, JSON.stringify([photoPath]), result.gender, result.ageGroup, now);

    const inserted = db.prepare('SELECT * FROM characters WHERE id = ?').get(id);
    res.json({ success: true, data: toApiCharacter(inserted) });
  } catch (e: any) {
    console.error('[Characters Route] create failed:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// PUT /api/characters/:id
router.put('/:id', (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const db = getDb();
    const existing = db.prepare('SELECT * FROM characters WHERE id = ?').get(id) as any;
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Character not found' });
    }

    const { name, description, gender, ageGroup, specificAge } = req.body;
    const now = Date.now();

    // If gender/age changed, optionally update description
    let newDescription = description;
    if (!newDescription && (gender || ageGroup || specificAge)) {
      newDescription = updateCharacterDescription(
        existing.description || '',
        gender || existing.gender || '未知',
        ageGroup || existing.age_group || '未知',
        specificAge || existing.specific_age
      );
    }

    db.prepare(`
      UPDATE characters SET
        name = COALESCE(?, name),
        description = COALESCE(?, description),
        gender = COALESCE(?, gender),
        age_group = COALESCE(?, age_group),
        specific_age = COALESCE(?, specific_age),
        updated_at = ?
      WHERE id = ?
    `).run(
      name || null,
      newDescription || null,
      gender || null,
      ageGroup || null,
      specificAge !== undefined ? specificAge : null,
      now,
      id
    );

    const updated = db.prepare('SELECT * FROM characters WHERE id = ?').get(id);
    res.json({ success: true, data: toApiCharacter(updated) });
  } catch (e: any) {
    console.error('[Characters Route] update failed:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// DELETE /api/characters/:id
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const db = getDb();
    const existing = db.prepare('SELECT * FROM characters WHERE id = ?').get(id) as any;
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Character not found' });
    }

    // Delete image files
    if (existing.avatar_path) {
      try { deleteImage(existing.avatar_path); } catch { /* ignore */ }
    }
    if (existing.original_photo_paths) {
      try {
        const paths = JSON.parse(existing.original_photo_paths);
        for (const p of paths) { try { deleteImage(p); } catch { /* ignore */ } }
      } catch { /* ignore */ }
    }
    if (existing.reference_sheet_path) {
      try { deleteImage(existing.reference_sheet_path); } catch { /* ignore */ }
    }

    db.prepare('DELETE FROM characters WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (e: any) {
    console.error('[Characters Route] delete failed:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

export default router;
