-- v8: deleting an archive / folder moves it to the trash together with its items.
-- trash_group = 'arc:<id>' / 'cat:<id>' marks rows that went to the trash in one go, so they come back together.
ALTER TABLE archives   ADD COLUMN deleted_at INTEGER;
ALTER TABLE categories ADD COLUMN deleted_at INTEGER;
ALTER TABLE categories ADD COLUMN trash_group TEXT;
ALTER TABLE items      ADD COLUMN trash_group TEXT;
