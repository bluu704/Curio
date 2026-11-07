-- v2: archives + wishlist, richer metadata, folder-like categories, full-text search, watched folders.

ALTER TABLE items ADD COLUMN list       TEXT NOT NULL DEFAULT 'archive'; -- archive | wishlist
ALTER TABLE items ADD COLUMN banner_uri TEXT;
ALTER TABLE items ADD COLUMN summary    TEXT;
ALTER TABLE items ADD COLUMN year       INTEGER;
ALTER TABLE items ADD COLUMN url        TEXT;    -- main external link (YouTube, store page...)
ALTER TABLE items ADD COLUMN code       TEXT;    -- product code / 품번 (normalized)
ALTER TABLE items ADD COLUMN source     TEXT;    -- JSON {provider, id, url} of applied metadata

CREATE INDEX idx_items_kind_list ON items(kind, list) WHERE deleted_at IS NULL;
CREATE INDEX idx_items_code      ON items(code)       WHERE code IS NOT NULL;

-- Folder-like tree. kind = NULL → shared by every archive.
CREATE TABLE categories (
  id         TEXT PRIMARY KEY,
  parent_id  TEXT REFERENCES categories(id) ON DELETE CASCADE,
  kind       TEXT,
  name       TEXT NOT NULL,
  position   INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_categories_parent ON categories(parent_id);

CREATE TABLE item_categories (
  item_id     TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (item_id, category_id)
);
CREATE INDEX idx_item_categories_cat ON item_categories(category_id);

-- Trigram FTS: substring search that works for 한국어/日本語 without a tokenizer.
-- rowid = items.rowid; kept in sync from Rust (Library::reindex) because it includes tag names.
CREATE VIRTUAL TABLE items_fts USING fts5(title, summary, code, people, tokenize = 'trigram');
INSERT INTO items_fts (rowid, title, summary, code, people)
  SELECT i.rowid, i.title, '', '',
         COALESCE((SELECT group_concat(t.name, ' ') FROM item_tags it JOIN tags t ON t.id = it.tag_id WHERE it.item_id = i.id), '')
  FROM items i;

-- Folders whose direct children are auto-imported (one item per child file/folder).
CREATE TABLE watch_folders (
  id         TEXT PRIMARY KEY,
  path       TEXT NOT NULL UNIQUE,
  kind       TEXT NOT NULL DEFAULT 'other',
  list       TEXT NOT NULL DEFAULT 'archive',
  created_at INTEGER NOT NULL,
  last_scan  INTEGER
);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
