import { getDb } from './index.js';

/**
 * Initialize database tables.
 * C22: All tables include user_id field (NULL for now, multi-user ready).
 * v1.8: scenes table removed; stories table gains input_text/input_photos/poster_url.
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
      input_text TEXT,
      input_photos TEXT,
      poster_url TEXT,
      style TEXT,
      created_at INTEGER NOT NULL
    );
  `);

  // Migration: add v1.8 columns to existing stories table
  const storyColumns = db.prepare("PRAGMA table_info(stories)").all() as any[];
  const columnNames = storyColumns.map((c: any) => c.name);

  if (!columnNames.includes('title')) {
    db.exec('ALTER TABLE stories ADD COLUMN title TEXT');
    console.log('[DB] Migration: added title column to stories');
  }
  if (!columnNames.includes('input_text')) {
    db.exec('ALTER TABLE stories ADD COLUMN input_text TEXT');
    console.log('[DB] Migration: added input_text column to stories');
  }
  if (!columnNames.includes('input_photos')) {
    db.exec('ALTER TABLE stories ADD COLUMN input_photos TEXT');
    console.log('[DB] Migration: added input_photos column to stories');
  }
  if (!columnNames.includes('poster_url')) {
    db.exec('ALTER TABLE stories ADD COLUMN poster_url TEXT');
    console.log('[DB] Migration: added poster_url column to stories');
  }

  console.log('[DB] Tables initialized');
}
