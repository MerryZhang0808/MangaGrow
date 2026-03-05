import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, '../../data/manga.db');

let db: DatabaseSync | null = null;

/**
 * Get SQLite database connection (singleton, WAL mode).
 * Uses Node.js built-in node:sqlite (DatabaseSync).
 */
export function getDb(): DatabaseSync {
  if (!db) {
    // Ensure data directory exists
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

    db = new DatabaseSync(DB_PATH);
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA foreign_keys = ON');
  }
  return db;
}
