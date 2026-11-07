-- v5: archive formats (user-editable templates), folder colors. Trash uses items.deleted_at (already there).
ALTER TABLE archives ADD COLUMN format TEXT;      -- custom format id (NULL = built-in format of `kind`)
ALTER TABLE categories ADD COLUMN color TEXT;     -- tone key (amber, blue, …); NULL = default
CREATE INDEX idx_items_deleted ON items(deleted_at) WHERE deleted_at IS NOT NULL;
