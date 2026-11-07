//! `Library` = the single entry point both hosts (Tauri / server) call.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{params, params_from_iter, Connection, OptionalExtension, Row};
use rusqlite::types::Value as Sql;
use serde_json::{Map, Value};

use crate::metadata::{self, codes};
use crate::models::*;
use crate::storage::{self, StorageProvider};
use crate::{db, media, scan, Error, Result};

pub struct Library {
    conn: Mutex<Connection>,
    cache_dir: PathBuf,
    /// Last opened archive for the reader (page turns must not re-open a 2 GB zip).
    reader: Mutex<Option<media::PageSource>>,
}

pub(crate) fn now() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}
fn new_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

const ITEM_COLS: &str = "i.id, i.title, i.kind, i.list, i.status, i.rating, i.favorite, i.cover_uri, i.banner_uri, \
                         i.summary, i.year, i.url, i.code, i.source, i.props, i.created_at, i.updated_at, i.archive_id, i.pinned";

fn row_to_item(r: &Row) -> rusqlite::Result<Item> {
    let source: Option<String> = r.get(13)?;
    let props: String = r.get(14)?;
    Ok(Item {
        id: r.get(0)?,
        title: r.get(1)?,
        kind: r.get(2)?,
        list: r.get(3)?,
        status: r.get(4)?,
        rating: r.get(5)?,
        favorite: r.get::<_, i64>(6)? != 0,
        cover_uri: r.get(7)?,
        banner_uri: r.get(8)?,
        summary: r.get(9)?,
        year: r.get(10)?,
        url: r.get(11)?,
        code: r.get(12)?,
        source: source.and_then(|s| serde_json::from_str(&s).ok()),
        props: serde_json::from_str(&props).unwrap_or_default(),
        category_ids: vec![],
        tags: vec![],
        files: vec![],
        blocks: None,
        created_at: r.get(15)?,
        updated_at: r.get(16)?,
        archive_id: r.get(17)?,
        pinned: r.get::<_, i64>(18)? != 0,
    })
}

fn row_to_file(r: &Row) -> rusqlite::Result<FileRef> {
    Ok(FileRef {
        id: r.get(0)?,
        item_id: r.get(1)?,
        provider: r.get(2)?,
        uri: r.get(3)?,
        name: r.get(4)?,
        kind: r.get(5)?,
        size: r.get(6)?,
        mtime: r.get(7)?,
        created_at: r.get(8)?,
    })
}
const FILE_COLS: &str = "id, item_id, provider, uri, name, kind, size, mtime, created_at";

fn opt_text(v: Option<String>) -> Sql {
    v.map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).map(Sql::Text).unwrap_or(Sql::Null)
}

/// Catalog / doujin codes are stored normalised so "abc123" and "ABC-123" match.
fn norm_code(code: Option<String>) -> Option<String> {
    code.map(|c| codes::normalize(&c).unwrap_or_else(|| c.trim().to_uppercase())).filter(|c| !c.is_empty())
}

impl Library {
    /// Open (or create) a library at `db_path`. Thumbnails/images go to `cache_dir`.
    pub fn open(db_path: &Path, cache_dir: &Path) -> Result<Self> {
        Ok(Self { conn: Mutex::new(db::open(db_path)?), cache_dir: cache_dir.to_path_buf(), reader: Mutex::new(None) })
    }

    pub fn open_in_memory(cache_dir: &Path) -> Result<Self> {
        Ok(Self { conn: Mutex::new(db::open_in_memory()?), cache_dir: cache_dir.to_path_buf(), reader: Mutex::new(None) })
    }

    pub fn cache_dir(&self) -> &Path {
        &self.cache_dir
    }

    fn conn(&self) -> MutexGuard<'_, Connection> {
        // A panic while holding the lock must not brick the app; the connection itself is still valid.
        self.conn.lock().unwrap_or_else(|e| e.into_inner())
    }

    // ------------------------------------------------------------------ items

    pub fn list_items(&self, q: &ItemQuery) -> Result<Vec<Item>> {
        let c = self.conn();
        let mut sql = format!("SELECT {ITEM_COLS} FROM items i WHERE i.deleted_at IS NULL");
        let mut args: Vec<Sql> = vec![];

        if let Some(kinds) = q.kinds.as_ref().filter(|k| !k.is_empty()) {
            sql += &format!(" AND i.kind IN ({})", placeholders(kinds.len()));
            args.extend(kinds.iter().map(|k| Sql::Text(k.as_str().into())));
        }
        if let Some(a) = &q.archive_id {
            sql += " AND i.archive_id = ?";
            args.push(Sql::Text(a.clone()));
        }
        if let Some(l) = q.list {
            sql += " AND i.list = ?";
            args.push(Sql::Text(l.as_str().into()));
        }
        if let Some(sts) = q.statuses.as_ref().filter(|s| !s.is_empty()) {
            sql += &format!(" AND i.status IN ({})", placeholders(sts.len()));
            args.extend(sts.iter().map(|s| Sql::Text(s.as_str().into())));
        }
        if q.favorite == Some(true) {
            sql += " AND i.favorite = 1";
        }
        if let Some(r) = q.min_rating.filter(|r| *r > 0.0) {
            sql += " AND i.rating >= ?";
            args.push(Sql::Real(r));
        }
        for t in q.tag_ids.iter().flatten() {
            sql += " AND EXISTS (SELECT 1 FROM item_tags it WHERE it.item_id = i.id AND it.tag_id = ?)";
            args.push(Sql::Text(t.clone()));
        }
        if let Some(cat) = &q.category_id {
            sql += " AND EXISTS (WITH RECURSIVE sub(id) AS (SELECT ? UNION ALL SELECT c.id FROM categories c JOIN sub ON c.parent_id = sub.id) \
                    SELECT 1 FROM item_categories ic WHERE ic.item_id = i.id AND ic.category_id IN (SELECT id FROM sub))";
            args.push(Sql::Text(cat.clone()));
        }
        if let Some(s) = q.search.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
            if s.chars().count() >= 3 {
                // Trigram FTS: fast substring match over title, summary, code and people/tags.
                sql += " AND i.rowid IN (SELECT rowid FROM items_fts WHERE items_fts MATCH ?)";
                args.push(Sql::Text(format!("\"{}\"", s.replace('"', "\"\""))));
            } else {
                let like = format!("%{}%", s.replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_"));
                sql += " AND (i.title LIKE ?1x ESCAPE '\\' OR i.code LIKE ?1x ESCAPE '\\' OR EXISTS (SELECT 1 FROM item_tags it JOIN tags t ON t.id = it.tag_id \
                        WHERE it.item_id = i.id AND t.name LIKE ?1x ESCAPE '\\'))"
                    .replace("?1x", "?")
                    .as_str();
                args.extend([Sql::Text(like.clone()), Sql::Text(like.clone()), Sql::Text(like)]);
            }
        }

        let sort = q.sort.clone().unwrap_or_default();
        let col = match sort.field {
            SortField::UpdatedAt => "i.updated_at",
            SortField::CreatedAt => "i.created_at",
            SortField::Title => "i.title COLLATE NOCASE",
            SortField::Rating => "COALESCE(i.rating, -1)",
        };
        let dir = match sort.dir { SortDir::Asc => "ASC", SortDir::Desc => "DESC" };
        sql += &format!(" ORDER BY i.pinned DESC, {col} {dir}, i.id");

        let mut items: Vec<Item> = c.prepare(&sql)?.query_map(params_from_iter(args), row_to_item)?.collect::<rusqlite::Result<_>>()?;
        hydrate(&c, &mut items)?;
        Ok(items)
    }

    /// Item counts per (archive, list) — drives the sidebar (wishlist entries hide at 0).
    pub fn counts(&self) -> Result<Vec<ArchiveCount>> {
        let c = self.conn();
        let mut st = c.prepare("SELECT archive_id, list, COUNT(*) FROM items WHERE deleted_at IS NULL GROUP BY archive_id, list")?;
        let rows = st.query_map([], |r| Ok(ArchiveCount { archive_id: r.get(0)?, list: r.get(1)?, count: r.get(2)? }))?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    }

    // ------------------------------------------------------------------ archives

    pub fn list_archives(&self) -> Result<Vec<Archive>> {
        let c = self.conn();
        let mut st = c.prepare("SELECT id, name, icon, kind, position, pinned FROM archives ORDER BY pinned DESC, position, name")?;
        let rows = st.query_map([], |r| {
            Ok(Archive { id: r.get(0)?, name: r.get(1)?, icon: r.get(2)?, kind: r.get(3)?, position: r.get(4)?, pinned: r.get::<_, i64>(5)? != 0 })
        })?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    }

    pub fn save_archive(&self, a: Archive) -> Result<Archive> {
        if a.name.trim().is_empty() {
            return Err(Error::Invalid("archive name is empty".into()));
        }
        self.conn().execute(
            "INSERT INTO archives (id, name, icon, kind, position, pinned, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
             ON CONFLICT(id) DO UPDATE SET name = excluded.name, icon = excluded.icon, kind = excluded.kind, position = excluded.position, pinned = excluded.pinned",
            params![a.id, a.name.trim(), a.icon, a.kind, a.position, a.pinned as i64, now()],
        )?;
        Ok(a)
    }

    /// Removes the archive and (soft-)deletes its items. Linked files on disk are never touched.
    pub fn delete_archive(&self, id: &str) -> Result<usize> {
        let mut c = self.conn();
        let tx = c.transaction()?;
        let t = now();
        tx.execute("DELETE FROM items_fts WHERE rowid IN (SELECT rowid FROM items WHERE archive_id = ?)", [id])?;
        let n = tx.execute("UPDATE items SET deleted_at = ?1, updated_at = ?1 WHERE archive_id = ?2 AND deleted_at IS NULL", params![t, id])?;
        tx.execute("UPDATE items SET archive_id = NULL WHERE archive_id = ?", [id])?;
        tx.execute("DELETE FROM archives WHERE id = ?", [id])?;
        tx.execute("DELETE FROM views WHERE id = ?1 OR id = ?1 || ':wish'", [format!("arc:{id}")])?;
        tx.commit()?;
        Ok(n)
    }

    pub fn get_item(&self, id: &str) -> Result<Item> {
        let c = self.conn();
        get_item_full(&c, id)
    }

    pub fn create_item(&self, input: NewItem) -> Result<Item> {
        let id = {
            let mut c = self.conn();
            let tx = c.transaction()?;
            let id = insert_item(&tx, input)?;
            tx.commit()?;
            id
        };
        self.get_item(&id)
    }

    /// Insert many records in one transaction (text import). Returns created ids.
    pub fn bulk_create(&self, inputs: Vec<NewItem>) -> Result<Vec<String>> {
        let mut c = self.conn();
        let tx = c.transaction()?;
        let ids = inputs.into_iter().map(|i| insert_item(&tx, i)).collect::<Result<Vec<_>>>()?;
        tx.commit()?;
        Ok(ids)
    }

    pub fn update_item(&self, id: &str, p: ItemPatch) -> Result<Item> {
        let mut c = self.conn();
        let tx = c.transaction()?;
        let mut sets: Vec<&str> = vec![];
        let mut args: Vec<Sql> = vec![];

        if let Some(v) = p.title { sets.push("title = ?"); args.push(Sql::Text(v.trim().to_string())); }
        if let Some(v) = p.kind { sets.push("kind = ?"); args.push(Sql::Text(v.as_str().into())); }
        if let Some(v) = p.list { sets.push("list = ?"); args.push(Sql::Text(v.as_str().into())); }
        if let Some(v) = p.archive_id { sets.push("archive_id = ?"); args.push(Sql::Text(v)); }
        if let Some(v) = p.pinned { sets.push("pinned = ?"); args.push(Sql::Integer(v as i64)); }
        if let Some(v) = p.status { sets.push("status = ?"); args.push(Sql::Text(v.as_str().into())); }
        if let Some(v) = p.rating {
            if let Some(r) = v { if !(0.0..=5.0).contains(&r) { return Err(Error::Invalid("rating must be 0..=5".into())); } }
            sets.push("rating = ?");
            args.push(v.map(Sql::Real).unwrap_or(Sql::Null));
        }
        if let Some(v) = p.favorite { sets.push("favorite = ?"); args.push(Sql::Integer(v as i64)); }
        if let Some(v) = p.cover_uri { sets.push("cover_uri = ?"); args.push(opt_text(v)); }
        if let Some(v) = p.banner_uri { sets.push("banner_uri = ?"); args.push(opt_text(v)); }
        if let Some(v) = p.summary { sets.push("summary = ?"); args.push(opt_text(v)); }
        if let Some(v) = p.year { sets.push("year = ?"); args.push(v.map(Sql::Integer).unwrap_or(Sql::Null)); }
        if let Some(v) = p.url { sets.push("url = ?"); args.push(opt_text(v)); }
        if let Some(v) = p.code { sets.push("code = ?"); args.push(opt_text(norm_code(v))); }
        if let Some(v) = p.props { sets.push("props = ?"); args.push(Sql::Text(serde_json::to_string(&v)?)); }
        if let Some(v) = p.blocks { sets.push("blocks = ?"); args.push(Sql::Text(serde_json::to_string(&v)?)); }
        sets.push("updated_at = ?");
        args.push(Sql::Integer(now()));
        args.push(Sql::Text(id.to_string()));

        let n = tx.execute(&format!("UPDATE items SET {} WHERE id = ? AND deleted_at IS NULL", sets.join(", ")), params_from_iter(args))?;
        if n == 0 {
            return Err(Error::NotFound(format!("item {id}")));
        }
        if let Some(tag_ids) = p.tag_ids {
            set_tags(&tx, id, &tag_ids)?;
        }
        if let Some(cats) = p.category_ids {
            set_categories(&tx, id, &cats)?;
        }
        reindex(&tx, id)?;
        tx.commit()?;
        get_item_full(&c, id)
    }

    /// Soft delete (keeps a tombstone for sync). Linked files on disk are never touched.
    pub fn delete_item(&self, id: &str) -> Result<()> {
        let t = now();
        let c = self.conn();
        c.execute("UPDATE items SET deleted_at = ?1, updated_at = ?1 WHERE id = ?2", params![t, id])?;
        c.execute("DELETE FROM items_fts WHERE rowid = (SELECT rowid FROM items WHERE id = ?)", [id])?;
        Ok(())
    }

    // ------------------------------------------------------------------ tags

    pub fn list_tags(&self) -> Result<Vec<Tag>> {
        let c = self.conn();
        let mut st = c.prepare("SELECT id, name, category, color FROM tags ORDER BY category, name COLLATE NOCASE")?;
        let rows = st.query_map([], |r| Ok(Tag { id: r.get(0)?, name: r.get(1)?, category: r.get(2)?, color: r.get(3)? }))?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    }

    pub fn upsert_tag(&self, name: &str, category: TagCategory) -> Result<Tag> {
        upsert_tag(&self.conn(), name, category)
    }

    // ------------------------------------------------------------------ categories (folder tree)

    pub fn list_categories(&self) -> Result<Vec<Category>> {
        let c = self.conn();
        let mut st = c.prepare("SELECT id, parent_id, kind, name, position FROM categories ORDER BY position, name COLLATE NOCASE")?;
        let rows = st.query_map([], |r| Ok(Category { id: r.get(0)?, parent_id: r.get(1)?, kind: r.get(2)?, name: r.get(3)?, position: r.get(4)? }))?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    }

    pub fn save_category(&self, cat: Category) -> Result<Category> {
        let c = self.conn();
        // Refuse cycles: the new parent must not be the category itself or one of its descendants.
        if let Some(parent) = &cat.parent_id {
            let cyclic: bool = c.query_row(
                "WITH RECURSIVE sub(id) AS (SELECT ?1 UNION ALL SELECT c.id FROM categories c JOIN sub ON c.parent_id = sub.id)
                 SELECT EXISTS (SELECT 1 FROM sub WHERE id = ?2)",
                params![cat.id, parent],
                |r| r.get(0),
            )?;
            if cyclic {
                return Err(Error::Invalid("category cannot be moved into itself".into()));
            }
        }
        c.execute(
            "INSERT INTO categories (id, parent_id, kind, name, position, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(id) DO UPDATE SET parent_id = excluded.parent_id, kind = excluded.kind, name = excluded.name, position = excluded.position",
            params![cat.id, cat.parent_id, cat.kind, cat.name.trim(), cat.position, now()],
        )?;
        Ok(cat)
    }

    /// Deletes the category and its sub-categories. Items stay (only unlinked).
    pub fn delete_category(&self, id: &str) -> Result<()> {
        self.conn().execute("DELETE FROM categories WHERE id = ?", [id])?;
        Ok(())
    }

    /// Add (not replace) a category to many items — used by drag & drop onto the tree.
    pub fn add_to_category(&self, item_ids: &[String], category_id: &str) -> Result<()> {
        let mut c = self.conn();
        let tx = c.transaction()?;
        for id in item_ids {
            tx.execute("INSERT OR IGNORE INTO item_categories (item_id, category_id) VALUES (?, ?)", params![id, category_id])?;
        }
        tx.commit()?;
        Ok(())
    }

    // ------------------------------------------------------------------ statuses

    pub fn list_statuses(&self) -> Result<Vec<StatusDef>> {
        let c = self.conn();
        let mut st = c.prepare("SELECT id, label, icon, color, position FROM statuses ORDER BY position, label")?;
        let rows = st.query_map([], |r| Ok(StatusDef { id: r.get(0)?, label: r.get(1)?, icon: r.get(2)?, color: r.get(3)?, position: r.get(4)? }))?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    }

    pub fn save_status(&self, d: StatusDef) -> Result<StatusDef> {
        if d.id.trim().is_empty() || d.label.trim().is_empty() {
            return Err(Error::Invalid("status needs an id and a label".into()));
        }
        self.conn().execute(
            "INSERT INTO statuses (id, label, icon, color, position) VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(id) DO UPDATE SET label = excluded.label, icon = excluded.icon, color = excluded.color, position = excluded.position",
            params![d.id, d.label.trim(), d.icon, d.color, d.position],
        )?;
        Ok(d)
    }

    /// Deletes a status; items that had it move to `fallback`. The last status cannot be deleted.
    pub fn delete_status(&self, id: &str, fallback: &str) -> Result<usize> {
        let mut c = self.conn();
        let tx = c.transaction()?;
        let n: i64 = tx.query_row("SELECT COUNT(*) FROM statuses", [], |r| r.get(0))?;
        if n <= 1 || id == fallback {
            return Err(Error::Invalid("keep at least one status".into()));
        }
        let moved = tx.execute("UPDATE items SET status = ?1 WHERE status = ?2", params![fallback, id])?;
        tx.execute("DELETE FROM statuses WHERE id = ?", [id])?;
        tx.commit()?;
        Ok(moved)
    }

    // ------------------------------------------------------------------ fields

    pub fn list_fields(&self) -> Result<Vec<FieldDef>> {
        let c = self.conn();
        let mut st = c.prepare("SELECT id, name, type, options, position FROM field_defs ORDER BY position")?;
        let rows = st.query_map([], |r| {
            let opts: String = r.get(3)?;
            Ok(FieldDef { id: r.get(0)?, name: r.get(1)?, field_type: r.get(2)?, options: serde_json::from_str(&opts).unwrap_or_default(), position: r.get(4)? })
        })?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    }

    pub fn save_field(&self, f: FieldDef) -> Result<FieldDef> {
        self.conn().execute(
            "INSERT INTO field_defs (id, name, type, options, position) VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(id) DO UPDATE SET name = excluded.name, type = excluded.type, options = excluded.options, position = excluded.position",
            params![f.id, f.name, f.field_type, serde_json::to_string(&f.options)?, f.position],
        )?;
        Ok(f)
    }

    pub fn delete_field(&self, id: &str) -> Result<()> {
        let mut c = self.conn();
        let tx = c.transaction()?;
        tx.execute("DELETE FROM field_defs WHERE id = ?", [id])?;
        tx.execute("UPDATE items SET props = json_remove(props, '$.\"' || ?1 || '\"') WHERE json_extract(props, '$.\"' || ?1 || '\"') IS NOT NULL", [id])?;
        tx.commit()?;
        Ok(())
    }

    // ------------------------------------------------------------------ views

    pub fn list_views(&self) -> Result<Vec<View>> {
        let c = self.conn();
        let mut st = c.prepare("SELECT id, name, icon, position, config FROM views ORDER BY position")?;
        let rows = st.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, i64>(3)?, r.get::<_, String>(4)?)))?;
        let mut out = vec![];
        for row in rows {
            let (id, name, icon, position, config) = row?;
            let mut cfg: Map<String, Value> = serde_json::from_str(&config).unwrap_or_default();
            out.push(View {
                id,
                name,
                icon,
                position,
                layout: cfg.remove("layout").and_then(|v| v.as_str().map(String::from)).unwrap_or_else(|| "gallery".into()),
                query: cfg.remove("query").and_then(|v| serde_json::from_value(v).ok()).unwrap_or_default(),
                card: cfg.remove("card").unwrap_or(Value::Null),
                columns: cfg.remove("columns").and_then(|v| serde_json::from_value(v).ok()).unwrap_or_default(),
            });
        }
        Ok(out)
    }

    pub fn save_view(&self, v: View) -> Result<View> {
        let config = serde_json::json!({ "layout": v.layout, "query": v.query, "card": v.card, "columns": v.columns });
        self.conn().execute(
            "INSERT INTO views (id, name, icon, position, config) VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(id) DO UPDATE SET name = excluded.name, icon = excluded.icon, position = excluded.position, config = excluded.config",
            params![v.id, v.name, v.icon, v.position, config.to_string()],
        )?;
        Ok(v)
    }

    pub fn delete_view(&self, id: &str) -> Result<()> {
        if id.starts_with("sys:") {
            return Err(Error::Invalid("built-in views cannot be deleted".into()));
        }
        self.conn().execute("DELETE FROM views WHERE id = ?", [id])?;
        Ok(())
    }

    // ------------------------------------------------------------------ files

    /// Link local paths to an item. Nothing is copied; only metadata is read.
    pub fn attach_paths(&self, item_id: &str, paths: &[String]) -> Result<Vec<FileRef>> {
        let local = storage::LocalProvider;
        let t = now();
        let mut out = vec![];
        let c = self.conn();
        for p in paths {
            let st = local.stat(p)?;
            let f = FileRef {
                id: new_id(),
                item_id: item_id.into(),
                provider: Provider::Local,
                uri: p.clone(),
                name: st.name,
                kind: scan::file_kind(Path::new(p)),
                size: st.size,
                mtime: st.mtime,
                created_at: t,
            };
            let n = c.execute(
                &format!("INSERT OR IGNORE INTO files ({FILE_COLS}) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)"),
                params![f.id, f.item_id, f.provider, f.uri, f.name, f.kind, f.size, f.mtime, f.created_at],
            )?;
            if n > 0 {
                out.push(f);
            }
        }
        c.execute("UPDATE items SET updated_at = ? WHERE id = ?", params![t, item_id])?;
        Ok(out)
    }

    pub fn detach_file(&self, file_id: &str) -> Result<()> {
        self.conn().execute("DELETE FROM files WHERE id = ?", [file_id])?;
        Ok(())
    }

    pub fn get_file(&self, file_id: &str) -> Result<FileRef> {
        self.conn()
            .query_row(&format!("SELECT {FILE_COLS} FROM files WHERE id = ?"), [file_id], row_to_file)
            .optional()?
            .ok_or_else(|| Error::NotFound(format!("file {file_id}")))
    }

    /// One new item per path: guess kind, link the path, generate a cover thumbnail.
    pub fn import_paths(&self, paths: &[String]) -> Result<Vec<Item>> {
        self.import_paths_as(paths, None, None, None)
    }

    pub fn import_paths_as(&self, paths: &[String], kind: Option<Kind>, list: Option<ListKind>, archive_id: Option<String>) -> Result<Vec<Item>> {
        let mut out = vec![];
        for p in paths {
            let path = Path::new(p);
            if !path.exists() {
                continue;
            }
            let title = scan::title_from_path(path);
            let code = codes::dlsite_code(&title);
            let item = self.create_item(NewItem {
                title,
                kind: Some(kind.unwrap_or_else(|| scan::guess_kind(path))),
                archive_id: archive_id.clone(),
                list,
                code,
                ..Default::default()
            })?;
            self.attach_paths(&item.id, std::slice::from_ref(p))?;
            // Cover failure is not fatal — the card falls back to a kind icon.
            if let Ok(Some(thumb)) = media::make_cover(path, &self.cache_dir, &item.id) {
                let patch = ItemPatch { cover_uri: Some(Some(thumb.to_string_lossy().into_owned())), ..Default::default() };
                self.update_item(&item.id, patch)?;
            }
            out.push(self.get_item(&item.id)?);
        }
        Ok(out)
    }

    // ------------------------------------------------------------------ text files / export

    /// Read a linked text file (txt, md…) for the built-in viewer. Max 5 MB.
    pub fn read_text(&self, file_id: &str) -> Result<String> {
        let f = self.get_file(file_id)?;
        if f.kind != FileKind::Text {
            return Err(Error::Unsupported(format!("not a text file: {}", f.name)));
        }
        let len = std::fs::metadata(&f.uri)?.len();
        if len > 5 * 1024 * 1024 {
            return Err(Error::Invalid("text file is larger than 5 MB".into()));
        }
        let bytes = std::fs::read(&f.uri)?;
        Ok(String::from_utf8_lossy(&bytes).into_owned())
    }

    /// Save edits back to the original text file (atomic: write a temp file, then rename).
    pub fn write_text(&self, file_id: &str, content: &str) -> Result<FileRef> {
        let f = self.get_file(file_id)?;
        if f.kind != FileKind::Text {
            return Err(Error::Unsupported(format!("not a text file: {}", f.name)));
        }
        let path = Path::new(&f.uri);
        let tmp = path.with_extension(format!("{}.curio-tmp", scan::ext_of(path)));
        std::fs::write(&tmp, content)?;
        std::fs::rename(&tmp, path)?;
        let st = scan::stat(path)?;
        self.conn().execute("UPDATE files SET size = ?1, mtime = ?2 WHERE id = ?3", params![st.size, st.mtime, file_id])?;
        self.get_file(file_id)
    }

    /// Copy a linked file (or folder) to `dest` — "download" / save-as in the desktop app.
    pub fn export_file(&self, file_id: &str, dest: &str) -> Result<()> {
        let f = self.get_file(file_id)?;
        let src = Path::new(&f.uri);
        if src.is_dir() {
            for e in walkdir::WalkDir::new(src).into_iter().flatten() {
                let rel = e.path().strip_prefix(src).unwrap_or(e.path());
                let to = Path::new(dest).join(rel);
                if e.file_type().is_dir() { std::fs::create_dir_all(&to)?; } else { std::fs::copy(e.path(), &to)?; }
            }
        } else {
            std::fs::copy(src, dest)?;
        }
        Ok(())
    }

    // ------------------------------------------------------------------ reader

    /// Pages of a readable file (zip/cbz, image folder, single image). PDFs are rendered client-side.
    pub fn list_pages(&self, file_id: &str) -> Result<Vec<String>> {
        let f = self.get_file(file_id)?;
        let mut guard = self.reader.lock().unwrap_or_else(|e| e.into_inner());
        if guard.as_ref().map(|s| s.file_id != file_id).unwrap_or(true) {
            *guard = Some(media::PageSource::open(file_id, Path::new(&f.uri))?);
        }
        Ok(guard.as_ref().unwrap().names.clone())
    }

    /// Bytes + mime of page `index`.
    pub fn read_page(&self, file_id: &str, index: usize) -> Result<(Vec<u8>, &'static str)> {
        let f = self.get_file(file_id)?;
        let mut guard = self.reader.lock().unwrap_or_else(|e| e.into_inner());
        if guard.as_ref().map(|s| s.file_id != file_id).unwrap_or(true) {
            *guard = Some(media::PageSource::open(file_id, Path::new(&f.uri))?);
        }
        guard.as_mut().unwrap().read(index)
    }

    // ------------------------------------------------------------------ metadata

    pub fn search_metadata(&self, kind: Kind, query: &str) -> Result<Vec<Candidate>> {
        metadata::search(kind, query)
    }

    /// Fetch full details, download hi-res cover/banner locally, link people/genres as tags.
    /// Network work happens *before* taking the DB lock.
    pub fn apply_metadata(&self, item_id: &str, provider: &str, id: &str, overwrite_title: bool) -> Result<Item> {
        let cand = metadata::fetch(provider, id)?;
        self.apply_candidate(item_id, cand, overwrite_title)
    }

    pub fn apply_candidate(&self, item_id: &str, cand: Candidate, overwrite_title: bool) -> Result<Item> {
        let cover = cand.cover_url.as_deref().and_then(|u| metadata::download_image(u, &self.cache_dir).ok());
        let banner = cand.banner_url.as_deref().and_then(|u| metadata::download_image(u, &self.cache_dir).ok());
        let current = self.get_item(item_id)?;

        let mut tag_ids: Vec<String> = current.tags.iter().map(|t| t.id.clone()).collect();
        {
            let c = self.conn();
            let mut add = |name: &str, cat: TagCategory| -> Result<()> {
                let t = upsert_tag(&c, name, cat)?;
                if !tag_ids.contains(&t.id) {
                    tag_ids.push(t.id);
                }
                Ok(())
            };
            for p in &cand.people {
                add(&p.name, p.category)?;
            }
            for g in &cand.genres {
                add(g, TagCategory::Genre)?;
            }
            if let Some(s) = &cand.series {
                add(s, TagCategory::Series)?;
            }
        }
        let path = |p: Option<PathBuf>| p.map(|p| p.to_string_lossy().into_owned());
        let empty_title = current.title.trim().is_empty() || current.title == "제목 없음";
        let patch = ItemPatch {
            title: (overwrite_title || empty_title).then(|| cand.title.clone()).filter(|t| !t.is_empty()),
            cover_uri: path(cover).map(Some),
            banner_uri: path(banner).map(Some),
            summary: cand.summary.clone().map(Some),
            year: cand.year.map(Some),
            url: cand.url.clone().filter(|_| current.url.is_none()).map(Some),
            code: cand.code.clone().map(Some),
            tag_ids: Some(tag_ids),
            ..Default::default()
        };
        self.update_item(item_id, patch)?;
        let source = serde_json::json!({ "provider": cand.provider, "id": cand.id, "url": cand.url, "altTitles": cand.alt_titles });
        self.conn().execute("UPDATE items SET source = ? WHERE id = ?", params![source.to_string(), item_id])?;
        self.get_item(item_id)
    }

    /// Search by url / code / title and apply the first confident match. Returns false when unsure.
    pub fn autofill(&self, item_id: &str) -> Result<bool> {
        let it = self.get_item(item_id)?;
        let query = it.url.clone().or(it.code.clone()).unwrap_or(it.title.clone());
        let hits = metadata::search(it.kind, &query)?;
        let by_link = it.url.is_some() || it.code.is_some();
        let best = hits.into_iter().find(|h| by_link || metadata::title_matches(&h.title, &it.title) || h.alt_titles.iter().any(|a| metadata::title_matches(a, &it.title)));
        match best {
            Some(h) => {
                let full = metadata::fetch(&h.provider, &h.id).unwrap_or(h);
                self.apply_candidate(item_id, full, false)?;
                Ok(true)
            }
            None => Ok(false),
        }
    }

    // ------------------------------------------------------------------ watched folders

    pub fn list_watch_folders(&self) -> Result<Vec<WatchFolder>> {
        let c = self.conn();
        let mut st = c.prepare("SELECT id, path, kind, list, last_scan FROM watch_folders ORDER BY path")?;
        let rows = st.query_map([], |r| Ok(WatchFolder { id: r.get(0)?, path: r.get(1)?, kind: r.get(2)?, list: r.get(3)?, last_scan: r.get(4)? }))?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    }

    pub fn add_watch_folder(&self, path: &str, kind: Kind, list: ListKind) -> Result<WatchFolder> {
        if !Path::new(path).is_dir() {
            return Err(Error::Invalid(format!("not a folder: {path}")));
        }
        let w = WatchFolder { id: new_id(), path: path.into(), kind, list, last_scan: None };
        self.conn().execute(
            "INSERT INTO watch_folders (id, path, kind, list, created_at) VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(path) DO UPDATE SET kind = excluded.kind, list = excluded.list",
            params![w.id, w.path, w.kind, w.list, now()],
        )?;
        Ok(w)
    }

    pub fn remove_watch_folder(&self, id: &str) -> Result<()> {
        self.conn().execute("DELETE FROM watch_folders WHERE id = ?", [id])?;
        Ok(())
    }

    /// Import every direct child of each watched folder that is not linked yet. Returns new item count.
    pub fn rescan_watch_folders(&self) -> Result<usize> {
        let mut total = 0;
        for w in self.list_watch_folders()? {
            let Ok(rd) = std::fs::read_dir(&w.path) else { continue };
            let mut fresh = vec![];
            for e in rd.flatten() {
                let name = e.file_name().to_string_lossy().into_owned();
                if name.starts_with('.') || name.starts_with('~') || name.eq_ignore_ascii_case("desktop.ini") || name.eq_ignore_ascii_case("thumbs.db") {
                    continue;
                }
                let p = e.path().to_string_lossy().into_owned();
                let known: bool = self.conn().query_row(
                    "SELECT EXISTS (SELECT 1 FROM files f JOIN items i ON i.id = f.item_id WHERE f.uri = ? AND i.deleted_at IS NULL)",
                    [&p],
                    |r| r.get(0),
                )?;
                if !known {
                    fresh.push(p);
                }
            }
            fresh.sort();
            total += self.import_paths_as(&fresh, Some(w.kind), Some(w.list), None)?.len();
            self.conn().execute("UPDATE watch_folders SET last_scan = ? WHERE id = ?", params![now(), w.id])?;
        }
        Ok(total)
    }

    // ------------------------------------------------------------------ misc

    /// Server guard: only serve paths the library itself references (or its cache).
    pub fn is_known_media(&self, uri: &str) -> bool {
        if Path::new(uri).starts_with(&self.cache_dir) {
            return true;
        }
        self.conn()
            .query_row(
                "SELECT EXISTS (SELECT 1 FROM items WHERE cover_uri = ?1 OR banner_uri = ?1) OR EXISTS (SELECT 1 FROM files WHERE uri = ?1)",
                [uri],
                |r| r.get(0),
            )
            .unwrap_or(false)
    }

    pub fn get_setting(&self, key: &str) -> Result<Option<String>> {
        Ok(self.conn().query_row("SELECT value FROM settings WHERE key = ?", [key], |r| r.get(0)).optional()?)
    }

    pub fn set_setting(&self, key: &str, value: &str) -> Result<()> {
        self.conn().execute("INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value", params![key, value])?;
        Ok(())
    }
}

// ---------------------------------------------------------------------- helpers

fn placeholders(n: usize) -> String {
    vec!["?"; n].join(", ")
}

fn upsert_tag(c: &Connection, name: &str, category: TagCategory) -> Result<Tag> {
    let name = name.trim();
    if name.is_empty() {
        return Err(Error::Invalid("empty tag name".into()));
    }
    let found = c
        .query_row(
            "SELECT id, name, category, color FROM tags WHERE category = ?1 AND name = ?2 COLLATE NOCASE",
            params![category, name],
            |r| Ok(Tag { id: r.get(0)?, name: r.get(1)?, category: r.get(2)?, color: r.get(3)? }),
        )
        .optional()?;
    if let Some(t) = found {
        return Ok(t);
    }
    let t = Tag { id: new_id(), name: name.into(), category, color: None };
    c.execute("INSERT INTO tags (id, name, category, created_at) VALUES (?1, ?2, ?3, ?4)", params![t.id, t.name, t.category, now()])?;
    Ok(t)
}

fn insert_item(c: &Connection, input: NewItem) -> Result<String> {
    let id = new_id();
    let t = now();
    let title = input.title.trim();
    c.execute(
        "INSERT INTO items (id, title, kind, list, status, rating, cover_uri, url, code, year, summary, created_at, updated_at, archive_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?12,
                 COALESCE((SELECT id FROM archives WHERE id = ?13), (SELECT id FROM archives WHERE id = ?3)))",
        params![
            id,
            if title.is_empty() { "제목 없음" } else { title },
            input.kind.unwrap_or(Kind::Other),
            input.list.unwrap_or(ListKind::Archive),
            input.status.unwrap_or_else(|| "planned".into()),
            input.rating.filter(|r| (0.0..=5.0).contains(r)),
            input.cover_uri,
            opt_text(input.url),
            opt_text(norm_code(input.code)),
            input.year,
            opt_text(input.summary),
            t,
            input.archive_id
        ],
    )?;
    let tag_ids = input.tags.iter().map(|nt| upsert_tag(c, &nt.name, nt.category).map(|t| t.id)).collect::<Result<Vec<_>>>()?;
    set_tags(c, &id, &tag_ids)?;
    set_categories(c, &id, &input.category_ids)?;
    reindex(c, &id)?;
    Ok(id)
}

fn set_tags(c: &Connection, item_id: &str, tag_ids: &[String]) -> Result<()> {
    c.execute("DELETE FROM item_tags WHERE item_id = ?", [item_id])?;
    let mut st = c.prepare("INSERT OR IGNORE INTO item_tags (item_id, tag_id, position) VALUES (?, ?, ?)")?;
    for (i, t) in tag_ids.iter().enumerate() {
        st.execute(params![item_id, t, i as i64])?;
    }
    Ok(())
}

fn set_categories(c: &Connection, item_id: &str, ids: &[String]) -> Result<()> {
    c.execute("DELETE FROM item_categories WHERE item_id = ?", [item_id])?;
    let mut st = c.prepare("INSERT OR IGNORE INTO item_categories (item_id, category_id) VALUES (?, ?)")?;
    for cid in ids {
        st.execute(params![item_id, cid])?;
    }
    Ok(())
}

/// Refresh the FTS row of one item (title, summary, code, tag/people names).
fn reindex(c: &Connection, item_id: &str) -> Result<()> {
    c.execute("DELETE FROM items_fts WHERE rowid = (SELECT rowid FROM items WHERE id = ?)", [item_id])?;
    c.execute(
        "INSERT INTO items_fts (rowid, title, summary, code, people)
         SELECT i.rowid, i.title, COALESCE(i.summary, ''), COALESCE(i.code, ''),
                COALESCE((SELECT group_concat(t.name, ' ') FROM item_tags it JOIN tags t ON t.id = it.tag_id WHERE it.item_id = i.id), '')
         FROM items i WHERE i.id = ? AND i.deleted_at IS NULL",
        [item_id],
    )?;
    Ok(())
}

fn get_item_full(c: &Connection, id: &str) -> Result<Item> {
    let mut item = c
        .query_row(&format!("SELECT {ITEM_COLS}, i.blocks FROM items i WHERE i.id = ? AND i.deleted_at IS NULL"), [id], |r| {
            let mut it = row_to_item(r)?;
            let blocks: String = r.get(19)?;
            it.blocks = Some(serde_json::from_str(&blocks).unwrap_or_default());
            Ok(it)
        })
        .optional()?
        .ok_or_else(|| Error::NotFound(format!("item {id}")))?;
    hydrate(c, std::slice::from_mut(&mut item))?;
    Ok(item)
}

/// Batch-load tags, categories and files for a set of items (3 queries total, not N+1).
fn hydrate(c: &Connection, items: &mut [Item]) -> Result<()> {
    if items.is_empty() {
        return Ok(());
    }
    let ids: Vec<&str> = items.iter().map(|i| i.id.as_str()).collect();
    let ids_json = serde_json::to_string(&ids)?;
    let idx: HashMap<String, usize> = items.iter().enumerate().map(|(i, it)| (it.id.clone(), i)).collect();

    let mut st = c.prepare(
        "SELECT it.item_id, t.id, t.name, t.category, t.color FROM item_tags it JOIN tags t ON t.id = it.tag_id
         WHERE it.item_id IN (SELECT value FROM json_each(?)) ORDER BY it.position",
    )?;
    for row in st.query_map([&ids_json], |r| Ok((r.get::<_, String>(0)?, Tag { id: r.get(1)?, name: r.get(2)?, category: r.get(3)?, color: r.get(4)? })))? {
        let (item_id, tag) = row?;
        if let Some(&i) = idx.get(&item_id) {
            items[i].tags.push(tag);
        }
    }

    let mut st = c.prepare("SELECT item_id, category_id FROM item_categories WHERE item_id IN (SELECT value FROM json_each(?))")?;
    for row in st.query_map([&ids_json], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))? {
        let (item_id, cid) = row?;
        if let Some(&i) = idx.get(&item_id) {
            items[i].category_ids.push(cid);
        }
    }

    let mut st = c.prepare(&format!("SELECT {FILE_COLS} FROM files WHERE item_id IN (SELECT value FROM json_each(?)) ORDER BY created_at, name"))?;
    for f in st.query_map([&ids_json], row_to_file)? {
        let f = f?;
        if let Some(&i) = idx.get(&f.item_id) {
            items[i].files.push(f);
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests;
