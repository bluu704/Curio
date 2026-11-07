//! Keep one library on several devices through the user's Google Drive.
//!
//! The library is exported as a JSON snapshot (every synced table, row by row) and kept in the
//! Drive's hidden app folder. Syncing is a three-way merge per row between
//! - this device now,
//! - the copy on Drive (what other devices pushed), and
//! - the base: the snapshot both agreed on at this device's last sync.
//!
//! A row changed on one side only takes that side (also deletions); a row changed on both sides
//! keeps the newer `updated_at` (else this device). Local file paths in the cache / data folders are
//! stored as "@cache/…" / "@data/…" so they resolve on every device; covers are uploaded too.
use std::collections::{BTreeMap, BTreeSet};
use std::io::{Read, Write};
use std::path::Path;

use rusqlite::types::{Value as Sql, ValueRef};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use crate::Result;

/// Synced tables, parents before children (foreign keys).
pub const TABLES: [&str; 11] = [
    "archives", "statuses", "field_defs", "views", "tags", "categories", "items", "files", "item_tags", "item_categories", "settings",
];
/// Columns holding local paths that must be made portable.
const PATH_COLS: [(&str, &str); 3] = [("items", "cover_uri"), ("items", "banner_uri"), ("files", "uri")];

pub type Row = Map<String, Value>;

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct Snapshot {
    pub format: u32,
    /// table → primary key (joined with '\u{1f}') → row
    pub tables: BTreeMap<String, BTreeMap<String, Row>>,
}

fn table_cols(c: &Connection, t: &str) -> Result<Vec<(String, i64)>> {
    let mut st = c.prepare(&format!("PRAGMA table_info({t})"))?;
    let rows = st.query_map([], |r| Ok((r.get::<_, String>(1)?, r.get::<_, i64>(5)?)))?;
    Ok(rows.collect::<rusqlite::Result<_>>()?)
}

fn pk_cols(cols: &[(String, i64)]) -> Vec<String> {
    let mut pk: Vec<_> = cols.iter().filter(|(_, p)| *p > 0).collect();
    pk.sort_by_key(|(_, p)| *p);
    pk.into_iter().map(|(n, _)| n.clone()).collect()
}

fn key_of(row: &Row, pk: &[String]) -> String {
    pk.iter().map(|k| match &row[k] { Value::String(s) => s.clone(), v => v.to_string() }).collect::<Vec<_>>().join("\u{1f}")
}

/// "/home/me/.cache/curio/thumbs/a.jpg" → "@cache/thumbs/a.jpg"
fn portable(p: &str, cache: &Path, data: &Path) -> String {
    let path = Path::new(p);
    for (tag, base) in [("@cache", cache), ("@data", data)] {
        if let Ok(rel) = path.strip_prefix(base) {
            return format!("{tag}/{}", rel.to_string_lossy().replace('\\', "/"));
        }
    }
    p.to_string()
}
/// "@cache/thumbs/a.jpg" → this device's cache folder + "thumbs/a.jpg"
pub fn local_path(p: &str, cache: &Path, data: &Path) -> String {
    for (tag, base) in [("@cache/", cache), ("@data/", data)] {
        if let Some(rel) = p.strip_prefix(tag) {
            return base.join(rel).to_string_lossy().into_owned();
        }
    }
    p.to_string()
}

/// Everything that syncs, as a snapshot (sign-in secrets excluded).
pub fn export(c: &Connection, cache: &Path, data: &Path) -> Result<Snapshot> {
    let mut snap = Snapshot { format: 1, tables: BTreeMap::new() };
    for t in TABLES {
        let cols = table_cols(c, t)?;
        let pk = pk_cols(&cols);
        let names: Vec<&str> = cols.iter().map(|(n, _)| n.as_str()).collect();
        let mut st = c.prepare(&format!("SELECT {} FROM {t}", names.join(", ")))?;
        let mut rows = st.query([])?;
        let mut out = BTreeMap::new();
        while let Some(r) = rows.next()? {
            let mut row = Row::new();
            for (i, n) in names.iter().enumerate() {
                let v = match r.get_ref(i)? {
                    ValueRef::Null | ValueRef::Blob(_) => Value::Null,
                    ValueRef::Integer(x) => Value::from(x),
                    ValueRef::Real(x) => Value::from(x),
                    ValueRef::Text(s) => {
                        let s = String::from_utf8_lossy(s).into_owned();
                        if PATH_COLS.contains(&(t, n)) { Value::String(portable(&s, cache, data)) } else { Value::String(s) }
                    }
                };
                row.insert((*n).to_string(), v);
            }
            if t == "settings" && row["key"].as_str().is_some_and(|k| k.starts_with("secret:")) {
                continue;
            }
            out.insert(key_of(&row, &pk), row);
        }
        snap.tables.insert(t.to_string(), out);
    }
    Ok(snap)
}

/// Same value, where 4 and 4.0 (JavaScript writes numbers without ".0") and true / 1 count as equal.
fn val_eq(a: &Value, b: &Value) -> bool {
    match (a, b) {
        (Value::Number(x), Value::Number(y)) => x.as_f64() == y.as_f64(),
        (Value::Bool(x), Value::Number(y)) | (Value::Number(y), Value::Bool(x)) => y.as_f64() == Some(*x as i64 as f64),
        _ => a == b,
    }
}
/// Rows equal column by column (see [`val_eq`]); a missing column counts as null.
pub fn row_eq(a: Option<&Row>, b: Option<&Row>) -> bool {
    match (a, b) {
        (Some(a), Some(b)) => a.keys().chain(b.keys()).all(|k| val_eq(a.get(k).unwrap_or(&Value::Null), b.get(k).unwrap_or(&Value::Null))),
        (None, None) => true,
        _ => false,
    }
}

/// Three-way merge. `base` = None for a device's first sync (then both sides are kept).
pub fn merge(local: &Snapshot, remote: &Snapshot, base: Option<&Snapshot>) -> Snapshot {
    let empty = BTreeMap::new();
    let mut out = Snapshot { format: 1, tables: BTreeMap::new() };
    for t in TABLES {
        let (l, r) = (local.tables.get(t).unwrap_or(&empty), remote.tables.get(t).unwrap_or(&empty));
        let b = base.and_then(|b| b.tables.get(t));
        let keys: BTreeSet<&String> = l.keys().chain(r.keys()).chain(b.into_iter().flat_map(|b| b.keys())).collect();
        let mut merged = BTreeMap::new();
        for k in keys {
            let (lv, rv) = (l.get(k), r.get(k));
            let bv = b.and_then(|b| b.get(k));
            let pick = if row_eq(lv, rv) {
                lv
            } else if base.is_some() && row_eq(lv, bv) {
                rv // only the other device changed it (or deleted it)
            } else if base.is_some() && row_eq(rv, bv) {
                lv // only this device changed it
            } else {
                match (lv, rv) {
                    (Some(x), None) | (None, Some(x)) => Some(x), // first sync, or edited here while deleted there: keep
                    (Some(x), Some(y)) => {
                        let ts = |row: &Row| row.get("updated_at").and_then(Value::as_i64).unwrap_or(0);
                        // newer edit wins; without timestamps a joining device (no base) takes the cloud's
                        // version, so a fresh install's defaults never overwrite customised names / views
                        Some(if ts(y) > ts(x) || (ts(y) == ts(x) && base.is_none()) { y } else { x })
                    }
                    (None, None) => None,
                }
            };
            if let Some(row) = pick {
                merged.insert(k.clone(), row.clone());
            }
        }
        out.tables.insert(t.to_string(), merged);
    }
    dedupe_tags(&mut out);
    out
}

/// The same tag made on two devices (same kind + name, different ids) becomes one: the smallest id
/// wins and item links move to it. Deterministic, so every device ends with the same rows.
pub fn dedupe_tags(s: &mut Snapshot) {
    let Some(tags) = s.tables.get("tags") else { return };
    let mut keep: BTreeMap<(String, String), String> = BTreeMap::new();
    for (id, row) in tags {
        let k = (row.get("category").and_then(Value::as_str).unwrap_or("").to_string(), row.get("name").and_then(Value::as_str).unwrap_or("").to_lowercase());
        keep.entry(k).and_modify(|cur| if id < cur { *cur = id.clone() }).or_insert(id.clone());
    }
    let mut remap: BTreeMap<String, String> = BTreeMap::new();
    for (id, row) in tags {
        let k = (row.get("category").and_then(Value::as_str).unwrap_or("").to_string(), row.get("name").and_then(Value::as_str).unwrap_or("").to_lowercase());
        if &keep[&k] != id {
            remap.insert(id.clone(), keep[&k].clone());
        }
    }
    if remap.is_empty() {
        return;
    }
    s.tables.get_mut("tags").unwrap().retain(|id, _| !remap.contains_key(id));
    if let Some(links) = s.tables.get_mut("item_tags") {
        let old = std::mem::take(links);
        for (_, mut row) in old {
            if let Some(to) = row.get("tag_id").and_then(Value::as_str).and_then(|t| remap.get(t)) {
                row.insert("tag_id".into(), Value::String(to.clone()));
            }
            let key = format!("{}\u{1f}{}", row["item_id"].as_str().unwrap_or(""), row["tag_id"].as_str().unwrap_or(""));
            links.entry(key).or_insert(row);
        }
    }
}

/// Number of rows that differ between two snapshots.
pub fn changes(a: &Snapshot, b: &Snapshot) -> usize {
    let empty = BTreeMap::new();
    TABLES
        .iter()
        .map(|t| {
            let (x, y) = (a.tables.get(*t).unwrap_or(&empty), b.tables.get(*t).unwrap_or(&empty));
            x.keys().chain(y.keys()).collect::<BTreeSet<_>>().into_iter().filter(|k| !row_eq(x.get(*k), y.get(*k))).count()
        })
        .sum()
}

/// Make the database equal to `target` (only the rows that differ are written).
pub fn apply(c: &mut Connection, current: &Snapshot, target: &Snapshot, cache: &Path, data: &Path) -> Result<usize> {
    let tx = c.transaction()?;
    tx.execute_batch("PRAGMA defer_foreign_keys = ON;")?;
    let empty = BTreeMap::new();
    let mut n = 0;
    // deletions first (children → parents), so a re-added row never meets the one it replaces
    for t in TABLES.iter().rev() {
        let cols = table_cols(&tx, t)?;
        let pk = pk_cols(&cols);
        let (cur, want) = (current.tables.get(*t).unwrap_or(&empty), target.tables.get(*t).unwrap_or(&empty));
        for (k, row) in cur {
            if want.contains_key(k) {
                continue;
            }
            let cond: Vec<String> = pk.iter().map(|c| format!("{c} = ?")).collect();
            let vals: Vec<Sql> = pk.iter().map(|c| match &row[c] { Value::String(s) => Sql::Text(s.clone()), v => Sql::Text(v.to_string()) }).collect();
            tx.execute(&format!("DELETE FROM {t} WHERE {}", cond.join(" AND ")), rusqlite::params_from_iter(vals))?;
            n += 1;
        }
    }
    // then inserts / updates (parents → children)
    for t in TABLES {
        let cols = table_cols(&tx, t)?;
        let pk = pk_cols(&cols);
        let names: Vec<&String> = cols.iter().map(|(n, _)| n).collect();
        let (cur, want) = (current.tables.get(t).unwrap_or(&empty), target.tables.get(t).unwrap_or(&empty));
        for (k, row) in want {
            if row_eq(cur.get(k), Some(row)) {
                continue;
            }
            let present: Vec<&String> = names.iter().copied().filter(|c| row.contains_key(*c)).collect();
            let vals: Vec<Sql> = present
                .iter()
                .map(|col| match &row[*col] {
                    Value::Null => Sql::Null,
                    Value::Bool(b) => Sql::Integer(*b as i64),
                    Value::Number(x) => x.as_i64().map(Sql::Integer).unwrap_or_else(|| Sql::Real(x.as_f64().unwrap_or(0.0))),
                    Value::String(s) if PATH_COLS.contains(&(t, col.as_str())) => Sql::Text(local_path(s, cache, data)),
                    Value::String(s) => Sql::Text(s.clone()),
                    v => Sql::Text(v.to_string()),
                })
                .collect();
            let updates: Vec<String> = present.iter().filter(|c| !pk.contains(c)).map(|c| format!("{c} = excluded.{c}")).collect();
            let sql = format!(
                "INSERT INTO {t} ({}) VALUES ({}) ON CONFLICT({}) DO {}",
                present.iter().map(|s| s.as_str()).collect::<Vec<_>>().join(", "),
                vec!["?"; present.len()].join(", "),
                pk.join(", "),
                if updates.is_empty() { "NOTHING".to_string() } else { format!("UPDATE SET {}", updates.join(", ")) }
            );
            tx.execute(&sql, rusqlite::params_from_iter(vals))?;
            n += 1;
        }
    }
    if n > 0 {
        // search index includes tag names: rebuild it
        tx.execute_batch(
            "DELETE FROM items_fts;
             INSERT INTO items_fts (rowid, title, summary, code, people)
               SELECT i.rowid, i.title, COALESCE(i.summary, ''), COALESCE(i.code, ''),
                      COALESCE((SELECT group_concat(t.name, ' ') FROM item_tags it JOIN tags t ON t.id = it.tag_id WHERE it.item_id = i.id), '')
               FROM items i WHERE i.deleted_at IS NULL;",
        )?;
    }
    tx.commit()?;
    Ok(n)
}

pub fn to_gz(s: &Snapshot) -> Result<Vec<u8>> {
    let mut e = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
    e.write_all(&serde_json::to_vec(s)?)?;
    Ok(e.finish()?)
}
pub fn from_gz(b: &[u8]) -> Result<Snapshot> {
    let mut s = Vec::new();
    flate2::read::GzDecoder::new(b).read_to_end(&mut s)?;
    Ok(serde_json::from_slice(&s)?)
}

/// "@cache/…" paths (covers, banners) referenced by a snapshot.
pub fn cache_refs(s: &Snapshot) -> BTreeSet<String> {
    let mut out = BTreeSet::new();
    if let Some(items) = s.tables.get("items") {
        for row in items.values() {
            for c in ["cover_uri", "banner_uri"] {
                if let Some(p) = row.get(c).and_then(Value::as_str).filter(|p| p.starts_with("@cache/")) {
                    out.insert(p.to_string());
                }
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn snap(rows: &[(&str, Value)]) -> Snapshot {
        let mut t = BTreeMap::new();
        for (id, v) in rows {
            t.insert(id.to_string(), v.as_object().unwrap().clone());
        }
        let mut s = Snapshot { format: 1, tables: BTreeMap::new() };
        s.tables.insert("items".into(), t);
        s
    }

    #[test]
    fn three_way() {
        let base = snap(&[("a", json!({"id":"a","title":"A","updated_at":1})), ("b", json!({"id":"b","title":"B","updated_at":1})), ("c", json!({"id":"c","updated_at":1}))]);
        // this device: edits a, adds d ; other device: edits b, deletes c, adds e
        let local = snap(&[("a", json!({"id":"a","title":"A2","updated_at":5})), ("b", json!({"id":"b","title":"B","updated_at":1})), ("c", json!({"id":"c","updated_at":1})), ("d", json!({"id":"d","updated_at":6}))]);
        let remote = snap(&[("a", json!({"id":"a","title":"A","updated_at":1})), ("b", json!({"id":"b","title":"B3","updated_at":7})), ("e", json!({"id":"e","updated_at":8}))]);
        let m = merge(&local, &remote, Some(&base));
        let t = &m.tables["items"];
        assert_eq!(t["a"]["title"], "A2");
        assert_eq!(t["b"]["title"], "B3");
        assert!(!t.contains_key("c"), "deleted on the other device");
        assert!(t.contains_key("d") && t.contains_key("e"));
        // both edited → newer wins
        let l2 = snap(&[("a", json!({"id":"a","title":"here","updated_at":9}))]);
        let r2 = snap(&[("a", json!({"id":"a","title":"there","updated_at":10}))]);
        assert_eq!(merge(&l2, &r2, Some(&base)).tables["items"]["a"]["title"], "there");
        // first sync of a device: union
        assert_eq!(merge(&local, &remote, None).tables["items"].len(), 5);
        // joining device: rows without timestamps (archive names…) follow the cloud
        let fresh = snap(&[("x", json!({"id":"x","name":"일러스트"}))]);
        let cloud = snap(&[("x", json!({"id":"x","name":"그림"}))]);
        assert_eq!(merge(&fresh, &cloud, None).tables["items"]["x"]["name"], "그림");
    }

    #[test]
    fn same_tag_on_two_devices() {
        let mut s = Snapshot::default();
        let tags = BTreeMap::from([
            ("t2".to_string(), json!({"id":"t2","name":"Madhouse","category":"studio"}).as_object().unwrap().clone()),
            ("t1".to_string(), json!({"id":"t1","name":"madhouse","category":"studio"}).as_object().unwrap().clone()),
            ("t3".to_string(), json!({"id":"t3","name":"Madhouse","category":"tag"}).as_object().unwrap().clone()),
        ]);
        let links = BTreeMap::from([
            ("a\u{1f}t2".to_string(), json!({"item_id":"a","tag_id":"t2","position":0}).as_object().unwrap().clone()),
            ("b\u{1f}t1".to_string(), json!({"item_id":"b","tag_id":"t1","position":0}).as_object().unwrap().clone()),
        ]);
        s.tables.insert("tags".into(), tags);
        s.tables.insert("item_tags".into(), links);
        dedupe_tags(&mut s);
        assert_eq!(s.tables["tags"].keys().collect::<Vec<_>>(), ["t1", "t3"]);
        assert!(s.tables["item_tags"].contains_key("a\u{1f}t1"));
    }

    #[test]
    fn numbers_from_javascript() {
        let a = json!({"id":"a","rating":4.0,"favorite":1}).as_object().unwrap().clone();
        let b = json!({"id":"a","rating":4,"favorite":true}).as_object().unwrap().clone();
        assert!(row_eq(Some(&a), Some(&b)));
        let c = json!({"id":"a","rating":4.5,"favorite":1}).as_object().unwrap().clone();
        assert!(!row_eq(Some(&a), Some(&c)));
    }

    #[test]
    fn portable_paths() {
        let (c, d) = (Path::new("/x/cache"), Path::new("/x/data"));
        assert_eq!(portable("/x/cache/thumbs/a.jpg", c, d), "@cache/thumbs/a.jpg");
        assert_eq!(portable("/x/data/drive/f/b.png", c, d), "@data/drive/f/b.png");
        assert_eq!(portable("D:/Anime/a.mkv", c, d), "D:/Anime/a.mkv");
        assert_eq!(local_path("@cache/thumbs/a.jpg", Path::new("/y/c"), d), "/y/c/thumbs/a.jpg");
    }
}
