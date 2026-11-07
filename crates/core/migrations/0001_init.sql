-- Curio schema v1
-- Design notes:
--  * TEXT UUID primary keys  → rows can be created offline on any device and merged later (sync / server).
--  * created_at / updated_at (unix ms) + deleted_at (soft delete) → last-write-wins sync is possible.
--  * Fixed core columns for what every item has (fast to filter/sort, indexed);
--    flexible JSON (`props`, `blocks`) for user-defined fields and page body.
--  * Files are *references* (provider + uri). The DB never stores media bytes.

CREATE TABLE items (
  id          TEXT PRIMARY KEY,
  title       TEXT    NOT NULL,
  kind        TEXT    NOT NULL DEFAULT 'other',
  status      TEXT    NOT NULL DEFAULT 'planned',
  rating      REAL,
  favorite    INTEGER NOT NULL DEFAULT 0,
  cover_uri   TEXT,
  props       TEXT    NOT NULL DEFAULT '{}',
  blocks      TEXT    NOT NULL DEFAULT '[]',
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  deleted_at  INTEGER
);
CREATE INDEX idx_items_kind    ON items(kind)       WHERE deleted_at IS NULL;
CREATE INDEX idx_items_status  ON items(status)     WHERE deleted_at IS NULL;
CREATE INDEX idx_items_updated ON items(updated_at) WHERE deleted_at IS NULL;

-- Tags, authors, genres, series, circles share one table (category column).
CREATE TABLE tags (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  category   TEXT NOT NULL DEFAULT 'tag',
  color      TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE (category, name COLLATE NOCASE)
);

CREATE TABLE item_tags (
  item_id  TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  tag_id   TEXT NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (item_id, tag_id)
);
CREATE INDEX idx_item_tags_tag ON item_tags(tag_id);

CREATE TABLE files (
  id         TEXT PRIMARY KEY,
  item_id    TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  provider   TEXT NOT NULL DEFAULT 'local',  -- local | gdrive | http
  uri        TEXT NOT NULL,                  -- absolute path / drive file id / url
  name       TEXT NOT NULL,
  kind       TEXT NOT NULL,                  -- video | archive | image | folder | document | other
  size       INTEGER,
  mtime      INTEGER,
  created_at INTEGER NOT NULL,
  UNIQUE (item_id, provider, uri)
);
CREATE INDEX idx_files_item ON files(item_id);

CREATE TABLE field_defs (
  id       TEXT PRIMARY KEY,
  name     TEXT NOT NULL,
  type     TEXT NOT NULL,
  options  TEXT NOT NULL DEFAULT '[]',
  position INTEGER NOT NULL DEFAULT 0
);

-- Saved views: query + presentation, stored as JSON so the UI can evolve freely.
CREATE TABLE views (
  id       TEXT PRIMARY KEY,
  name     TEXT NOT NULL,
  icon     TEXT NOT NULL DEFAULT 'bookmark',
  position INTEGER NOT NULL DEFAULT 0,
  config   TEXT NOT NULL DEFAULT '{}'
);
