-- v7: a library starts with one plain archive ("아카이브 1") instead of one per kind.
-- Built-in archives that hold no items are removed (archives with items, and renamed ones, stay).
DELETE FROM views WHERE id IN (
  SELECT 'arc:' || a.id FROM archives a
  WHERE a.id IN ('illust','game','anime','webtoon','light_novel','web_novel','music','doujin','catalog','manga','movie','drama','book')
    AND NOT EXISTS (SELECT 1 FROM items i WHERE i.archive_id = a.id)
  UNION ALL
  SELECT 'arc:' || a.id || ':wish' FROM archives a
  WHERE a.id IN ('illust','game','anime','webtoon','light_novel','web_novel','music','doujin','catalog','manga','movie','drama','book')
    AND NOT EXISTS (SELECT 1 FROM items i WHERE i.archive_id = a.id)
);
DELETE FROM archives
WHERE id IN ('illust','game','anime','webtoon','light_novel','web_novel','music','doujin','catalog','manga','movie','drama','book')
  AND NOT EXISTS (SELECT 1 FROM items i WHERE i.archive_id = archives.id);
-- fixed id: every device creates the same row, so syncing never doubles it
INSERT INTO archives (id, name, icon, kind, position, pinned, created_at)
  SELECT 'archive1', '아카이브 1', 'library', 'other', 0, 0, 0
  WHERE NOT EXISTS (SELECT 1 FROM archives);
