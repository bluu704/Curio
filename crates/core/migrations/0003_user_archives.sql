-- v3: archives become user-editable entities (rename, icon, pin, add, delete) + pinned items.
-- `kind` on an archive is its template: default kind of new items, metadata sources, card layout.

CREATE TABLE archives (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  icon       TEXT NOT NULL,
  kind       TEXT NOT NULL,
  position   INTEGER NOT NULL DEFAULT 0,
  pinned     INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT 0
);
INSERT INTO archives (id, name, icon, kind, position) VALUES
  ('illust', '일러스트', 'illust', 'illust', 0),
  ('game', '게임', 'game', 'game', 1),
  ('anime', '애니메이션', 'anime', 'anime', 2),
  ('webtoon', '웹툰', 'webtoon', 'webtoon', 3),
  ('light_novel', '라이트노벨', 'light_novel', 'light_novel', 4),
  ('web_novel', '웹소설', 'web_novel', 'web_novel', 5),
  ('music', '노래', 'music', 'music', 6),
  ('doujin', '동인지', 'doujin', 'doujin', 7),
  ('catalog', '품번', 'catalog', 'catalog', 8),
  ('manga', '만화', 'manga', 'manga', 9),
  ('movie', '영화', 'movie', 'movie', 10);

ALTER TABLE items ADD COLUMN archive_id TEXT REFERENCES archives(id) ON DELETE SET NULL;
ALTER TABLE items ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;
UPDATE items SET archive_id = kind WHERE kind IN (SELECT id FROM archives);
CREATE INDEX idx_items_archive ON items(archive_id, list) WHERE deleted_at IS NULL;
