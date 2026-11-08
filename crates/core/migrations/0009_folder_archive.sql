-- v9: every folder belongs to an archive (the archive's folder panel shows only its own folders).
ALTER TABLE categories ADD COLUMN archive_id TEXT;

-- a top folder goes to the archive most of its items (sub-folders included) are in …
WITH RECURSIVE tree(root, id) AS (
  SELECT id, id FROM categories WHERE parent_id IS NULL
  UNION ALL SELECT tree.root, c.id FROM categories c JOIN tree ON c.parent_id = tree.id
)
UPDATE categories SET archive_id = (
  SELECT i.archive_id FROM tree
    JOIN item_categories ic ON ic.category_id = tree.id
    JOIN items i ON i.id = ic.item_id
  WHERE tree.root = categories.id AND i.archive_id IS NOT NULL
  GROUP BY i.archive_id ORDER BY COUNT(*) DESC, i.archive_id LIMIT 1
) WHERE parent_id IS NULL;

-- … or, when it is empty, to the first archive
UPDATE categories SET archive_id = (SELECT id FROM archives WHERE deleted_at IS NULL ORDER BY pinned DESC, position, name LIMIT 1)
WHERE parent_id IS NULL AND archive_id IS NULL;

-- sub-folders follow their top folder
WITH RECURSIVE tree(root, id) AS (
  SELECT id, id FROM categories WHERE parent_id IS NULL
  UNION ALL SELECT tree.root, c.id FROM categories c JOIN tree ON c.parent_id = tree.id
)
UPDATE categories SET archive_id = (SELECT r.archive_id FROM tree JOIN categories r ON r.id = tree.root WHERE tree.id = categories.id)
WHERE parent_id IS NOT NULL;
