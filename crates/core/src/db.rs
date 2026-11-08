use rusqlite::Connection;
use std::path::Path;

use crate::Result;

/// Ordered migrations. Append only — never edit a shipped one.
const MIGRATIONS: &[&str] = &[
    include_str!("../migrations/0001_init.sql"),
    include_str!("../migrations/0002_archives.sql"),
    include_str!("../migrations/0003_user_archives.sql"),
    include_str!("../migrations/0004_statuses.sql"),
    include_str!("../migrations/0005_trash_formats_colors.sql"),
    include_str!("../migrations/0006_more_kinds.sql"),
    include_str!("../migrations/0007_one_archive.sql"),
    include_str!("../migrations/0008_trash_groups.sql"),
    include_str!("../migrations/0009_folder_archive.sql"),
];

pub fn open(path: &Path) -> Result<Connection> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let conn = Connection::open(path)?;
    configure(&conn)?;
    migrate(&conn)?;
    Ok(conn)
}

pub fn open_in_memory() -> Result<Connection> {
    let conn = Connection::open_in_memory()?;
    configure(&conn)?;
    migrate(&conn)?;
    Ok(conn)
}

fn configure(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;
         PRAGMA foreign_keys = ON;
         PRAGMA busy_timeout = 5000;",
    )?;
    conn.create_collation("NATSORT", natural_cmp)?;
    Ok(())
}

/// Title order where numbers count as numbers ("3화" < "10화" < "113화", "1-3화" < "1-10화"),
/// letters ignore case.
pub fn natural_cmp(a: &str, b: &str) -> std::cmp::Ordering {
    use std::cmp::Ordering;
    let (mut x, mut y) = (a.chars().peekable(), b.chars().peekable());
    loop {
        match (x.peek().copied(), y.peek().copied()) {
            (None, None) => return a.cmp(b),
            (None, _) => return Ordering::Less,
            (_, None) => return Ordering::Greater,
            (Some(p), Some(q)) if p.is_ascii_digit() && q.is_ascii_digit() => {
                let take = |it: &mut std::iter::Peekable<std::str::Chars>| {
                    let mut s = String::new();
                    while let Some(c) = it.peek().copied().filter(char::is_ascii_digit) {
                        s.push(c);
                        it.next();
                    }
                    s
                };
                let (m, n) = (take(&mut x), take(&mut y));
                let (m2, n2) = (m.trim_start_matches('0'), n.trim_start_matches('0'));
                let o = m2.len().cmp(&n2.len()).then_with(|| m2.cmp(n2));
                if o != Ordering::Equal {
                    return o;
                }
            }
            (Some(p), Some(q)) => {
                let o = p.to_lowercase().cmp(q.to_lowercase());
                if o != Ordering::Equal {
                    return o;
                }
                x.next();
                y.next();
            }
        }
    }
}

/// Uses `PRAGMA user_version` as the schema version.
fn migrate(conn: &Connection) -> Result<()> {
    let current: usize = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    for (i, sql) in MIGRATIONS.iter().enumerate().skip(current) {
        let tx = conn.unchecked_transaction()?;
        tx.execute_batch(sql)?;
        tx.pragma_update(None, "user_version", i + 1)?;
        tx.commit()?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    #[test]
    fn folders_get_an_archive() {
        let c = rusqlite::Connection::open_in_memory().unwrap();
        for m in &super::MIGRATIONS[..8] {
            c.execute_batch(m).unwrap();
        }
        c.execute_batch(
            "INSERT INTO archives (id, name, icon, kind, position, pinned, created_at) VALUES ('a2', 'B', 'x', 'other', 5, 0, 0);
             INSERT INTO categories (id, parent_id, kind, name, position, created_at) VALUES ('top', NULL, NULL, 'T', 0, 0), ('sub', 'top', NULL, 'S', 0, 0), ('empty', NULL, NULL, 'E', 1, 0);
             INSERT INTO items (id, title, kind, status, created_at, updated_at, archive_id) VALUES ('i1', 'x', 'other', 'planned', 0, 0, 'a2');
             INSERT INTO item_categories (item_id, category_id) VALUES ('i1', 'sub');",
        )
        .unwrap();
        c.execute_batch(super::MIGRATIONS[8]).unwrap();
        let arc = |id: &str| c.query_row("SELECT archive_id FROM categories WHERE id = ?", [id], |r| r.get::<_, Option<String>>(0)).unwrap();
        assert_eq!(arc("top").as_deref(), Some("a2"), "majority of the items under it");
        assert_eq!(arc("sub").as_deref(), Some("a2"), "sub-folder follows its top folder");
        assert_eq!(arc("empty").as_deref(), Some("archive1"), "empty folder → first archive");
    }

    #[test]
    fn natural_order() {
        let mut v = vec!["10화", "3화", "113화", "1~3", "1-3화", "11화", "1화", "Abc", "abd"];
        v.sort_by(|a, b| super::natural_cmp(a, b));
        assert_eq!(v, ["1-3화", "1~3", "1화", "3화", "10화", "11화", "113화", "Abc", "abd"]);
    }
}
