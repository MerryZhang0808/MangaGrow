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
      title TEXT,
      input_summary TEXT,
      style TEXT,
      aspect_ratio TEXT,
      story_outline TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS scenes (
      id TEXT PRIMARY KEY,
      story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
      scene_number INTEGER NOT NULL,
      script TEXT,
      caption TEXT,
      image_path TEXT,
      emotional_beat TEXT,
      created_at INTEGER NOT NULL
    );
  `);

  // Migration: add title and updated_at to existing stories table
  const storyColumns = db.prepare("PRAGMA table_info(stories)").all() as any[];
  const columnNames = storyColumns.map((c: any) => c.name);

  if (!columnNames.includes('title')) {
    db.exec('ALTER TABLE stories ADD COLUMN title TEXT');
    console.log('[DB] Migration: added title column to stories');
  }
  if (!columnNames.includes('updated_at')) {
    db.exec('ALTER TABLE stories ADD COLUMN updated_at INTEGER');
    console.log('[DB] Migration: added updated_at column to stories');
  }

  // Migration: add caption column to scenes table
  const sceneColumns = db.prepare("PRAGMA table_info(scenes)").all() as any[];
  const sceneColumnNames = sceneColumns.map((c: any) => c.name);
  if (!sceneColumnNames.includes('caption')) {
    db.exec('ALTER TABLE scenes ADD COLUMN caption TEXT');
    console.log('[DB] Migration: added caption column to scenes');
  }

  console.log('[DB] Tables initialized');
}
