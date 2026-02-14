import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { getDb } from '../db/index.js';
import { deleteImage } from '../services/imageStorage.js';

const router = Router();

// Helper: assemble story with its scenes
function toApiStory(storyRow: any, sceneRows: any[]): any {
  return {
    id: storyRow.id,
    inputSummary: storyRow.input_summary,
    style: storyRow.style,
    aspectRatio: storyRow.aspect_ratio,
    storyOutline: storyRow.story_outline,
    createdAt: storyRow.created_at,
    scenes: sceneRows.map(s => ({
      id: s.id,
      sceneNumber: s.scene_number,
      script: s.script,
      imageUrl: s.image_path ? `/api/images/${s.image_path}` : null,
      emotionalBeat: s.emotional_beat
    }))
  };
}

// GET /api/stories
router.get('/', (_req: Request, res: Response) => {
  try {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM stories ORDER BY created_at DESC').all() as any[];
    const stories = rows.map(row => {
      const scenes = db.prepare('SELECT * FROM scenes WHERE story_id = ? ORDER BY scene_number').all(row.id) as any[];
      return toApiStory(row, scenes);
    });
    res.json({ success: true, data: stories });
  } catch (e: any) {
    console.error('[Stories Route] list failed:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/stories/:id
router.get('/:id', (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const db = getDb();
    const row = db.prepare('SELECT * FROM stories WHERE id = ?').get(id) as any;
    if (!row) {
      return res.status(404).json({ success: false, error: 'Story not found' });
    }
    const scenes = db.prepare('SELECT * FROM scenes WHERE story_id = ? ORDER BY scene_number').all(row.id) as any[];
    res.json({ success: true, data: toApiStory(row, scenes) });
  } catch (e: any) {
    console.error('[Stories Route] get failed:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/stories
router.post('/', (req: Request, res: Response) => {
  try {
    const { inputSummary, style, aspectRatio, storyOutline, scenes } = req.body;
    if (!scenes || !Array.isArray(scenes) || scenes.length === 0) {
      return res.status(400).json({ success: false, error: 'scenes array is required' });
    }

    const db = getDb();
    const storyId = crypto.randomUUID();
    const now = Date.now();

    db.prepare(`
      INSERT INTO stories (id, user_id, input_summary, style, aspect_ratio, story_outline, created_at)
      VALUES (?, NULL, ?, ?, ?, ?, ?)
    `).run(storyId, inputSummary || '', style || '', aspectRatio || '', storyOutline || '', now);

    // Insert scenes
    const insertScene = db.prepare(`
      INSERT INTO scenes (id, story_id, scene_number, script, image_path, emotional_beat, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (const scene of scenes) {
      // image_path: strip /api/images/ prefix if provided as URL
      let imagePath = scene.imagePath || scene.image_path || null;
      if (imagePath && imagePath.startsWith('/api/images/')) {
        imagePath = imagePath.replace('/api/images/', '');
      }
      insertScene.run(
        crypto.randomUUID(),
        storyId,
        scene.sceneNumber || scene.scene_number,
        scene.script || scene.description || '',
        imagePath,
        scene.emotionalBeat || scene.emotional_beat || '',
        now
      );
    }

    // Return the created story
    const storyRow = db.prepare('SELECT * FROM stories WHERE id = ?').get(storyId) as any;
    const sceneRows = db.prepare('SELECT * FROM scenes WHERE story_id = ? ORDER BY scene_number').all(storyId) as any[];
    res.json({ success: true, data: toApiStory(storyRow, sceneRows) });
  } catch (e: any) {
    console.error('[Stories Route] create failed:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// DELETE /api/stories/:id
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const db = getDb();
    const row = db.prepare('SELECT * FROM stories WHERE id = ?').get(id);
    if (!row) {
      return res.status(404).json({ success: false, error: 'Story not found' });
    }

    // Delete scene image files
    const scenes = db.prepare('SELECT image_path FROM scenes WHERE story_id = ?').all(id) as any[];
    for (const scene of scenes) {
      if (scene.image_path) {
        try { deleteImage(scene.image_path); } catch { /* ignore */ }
      }
    }

    // Delete story (scenes cascade)
    db.prepare('DELETE FROM stories WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (e: any) {
    console.error('[Stories Route] delete failed:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

export default router;
