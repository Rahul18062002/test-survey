import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

export const DATA_DIR = process.env.QF_DATA_DIR || path.resolve('data')
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads')
export const OUTPUT_DIR = path.join(DATA_DIR, 'outputs')
for (const dir of [DATA_DIR, UPLOAD_DIR, OUTPUT_DIR]) fs.mkdirSync(dir, { recursive: true })

export const db = new DatabaseSync(path.join(DATA_DIR, 'questionnaireflow.db'))
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;')

db.exec(`
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- The product's own knowledge base: the single source of truth. Sheets and uploads feed it.
CREATE TABLE IF NOT EXISTS kb_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  normalized TEXT NOT NULL,
  source_type TEXT NOT NULL,          -- sheet | manual | review | import | sample
  source_label TEXT NOT NULL,         -- human-readable provenance shown in "details"
  source_ref TEXT,                    -- e.g. kb_sources.id + row number, for re-sync
  source_id INTEGER,
  confidence INTEGER NOT NULL DEFAULT 100,
  last_verified TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS kb_entries_norm ON kb_entries(normalized);

CREATE TABLE IF NOT EXISTS kb_duplicates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id INTEGER NOT NULL REFERENCES kb_entries(id) ON DELETE CASCADE,
  existing_id INTEGER NOT NULL REFERENCES kb_entries(id) ON DELETE CASCADE,
  similarity INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open', -- open | kept_both | resolved
  created_at TEXT NOT NULL
);

-- A connected spreadsheet that feeds the knowledge base (read-only).
CREATE TABLE IF NOT EXISTS kb_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  app TEXT NOT NULL,                  -- google_sheets | excel
  label TEXT NOT NULL,
  config TEXT NOT NULL,               -- JSON: picked ids and their labels
  question_col TEXT,
  answer_col TEXT,
  last_synced_at TEXT,
  last_status TEXT,
  row_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  kind TEXT NOT NULL,                 -- file | paste | single | sheet
  original_filename TEXT,
  original_path TEXT,
  input_format TEXT,                  -- pdf | docx | xlsx | csv | text | sheet
  output_format TEXT,
  status TEXT NOT NULL,               -- reading | confirm | matching | review | completed | failed
  status_message TEXT,
  detection TEXT,                     -- JSON summary of what auto-detection found
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  identifier TEXT,                    -- the document's own numbering, preserved end to end
  question TEXT NOT NULL,
  normalized TEXT NOT NULL,
  section TEXT,
  location TEXT,                      -- JSON: where it sits in the source (sheet/row/col…)
  match_entry_id INTEGER,
  matched_question TEXT,
  suggested_answer TEXT,
  confidence INTEGER NOT NULL DEFAULT 0,
  match_method TEXT,
  classification TEXT,                -- auto | review | not_found
  final_answer TEXT,
  review_status TEXT NOT NULL DEFAULT 'pending', -- pending | approved | fixed | skipped
  locked_by TEXT,
  locked_name TEXT,
  locked_until INTEGER,
  reviewed_by TEXT,
  reviewed_at TEXT,
  kb_offer TEXT                       -- null | offered | added | declined
);
CREATE INDEX IF NOT EXISTS items_job ON items(job_id);

-- One org-wide connection per app, made once in Settings.
CREATE TABLE IF NOT EXISTS connections (
  app TEXT PRIMARY KEY,
  service_id TEXT NOT NULL,
  auth_id TEXT NOT NULL,
  script_id TEXT,                     -- a credential: never sent to the browser
  connected_at TEXT NOT NULL
);

-- Where notifications go, and for which events.
CREATE TABLE IF NOT EXISTS destinations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  app TEXT NOT NULL,                  -- slack | teams | gmail | outlook
  label TEXT NOT NULL,
  config TEXT NOT NULL,               -- JSON: picked ids + labels, or recipients
  events TEXT NOT NULL,               -- JSON array of event names
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS event_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event TEXT NOT NULL,
  summary TEXT NOT NULL,
  deliveries TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);
`)

export const now = () => new Date().toISOString()

export function all(sql, ...params) {
  return db.prepare(sql).all(...params)
}
export function get(sql, ...params) {
  return db.prepare(sql).get(...params)
}
export function run(sql, ...params) {
  return db.prepare(sql).run(...params)
}

export function transaction(fn) {
  db.exec('BEGIN')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

const DEFAULT_SETTINGS = {
  org_name: 'My organization',
  autofill_threshold: '85',    // at or above: filled automatically
  review_floor: '45',          // at or above (but under the threshold): suggested, needs review
  ai_matching: '1',            // ask viaSocket AI to judge borderline matches
  staleness_enabled: '0',
  staleness_days: '90',
  onboarding_dismissed: '0'
}

export function getSetting(key) {
  const row = get('SELECT value FROM settings WHERE key = ?', key)
  return row ? row.value : DEFAULT_SETTINGS[key]
}
export function setSetting(key, value) {
  run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, String(value))
}
export function allSettings() {
  const out = { ...DEFAULT_SETTINGS }
  for (const row of all('SELECT key, value FROM settings')) out[row.key] = row.value
  return out
}

// The organization's stable viaSocket identity. Connect is org-wide, so every connection,
// enabled app and AI thread belongs to this one id. Generated once, never changed.
export function orgIdentifier() {
  let id = get("SELECT value FROM settings WHERE key = 'org_uid'")?.value
  if (!id) {
    id = `org-${crypto.randomUUID()}`
    setSetting('org_uid', id)
  }
  return id
}
