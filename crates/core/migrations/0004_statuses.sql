-- v4: user-defined watch statuses (label, icon, color, order). items.status holds the id.
CREATE TABLE statuses (
  id       TEXT PRIMARY KEY,
  label    TEXT NOT NULL,
  icon     TEXT NOT NULL,
  color    TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0
);
INSERT INTO statuses (id, label, icon, color, position) VALUES
  ('planned', '볼 예정', 'bookmark', 'slate', 0),
  ('in_progress', '감상 중', 'play', 'blue', 1),
  ('completed', '완료', 'check', 'green', 2),
  ('on_hold', '보류', 'pause', 'amber', 3),
  ('dropped', '중단', 'x', 'red', 4);
