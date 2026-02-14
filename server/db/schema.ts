import { getDb } from './index.js';

/**
 * Initialize database tables.
 * C22: All tables include user_id field (NULL for now, multi-user ready).
 */
export function initDb(): void {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS characters (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      name TEXT NOT NULL,
      avatar_path TEXT,
      description TEXT,
      original_photo_paths TEXT,
      reference_sheet_path TEXT,
      gender TEXT,
      age_group TEXT,
      specific_age TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS stories (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      input_summary TEXT,
      style TEXT,
      aspect_ratio TEXT,
      story_outline TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS scenes (
      id TEXT PRIMARY KEY,
      story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
      scene_number INTEGER NOT NULL,
      script TEXT,
      image_path TEXT,
      emotional_beat TEXT,
      created_at INTEGER NOT NULL
    );
  `);

  console.log('[DB] Tables initialized');
}
