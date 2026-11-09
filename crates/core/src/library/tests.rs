use super::*;

fn lib() -> (Library, tempfile::TempDir) {
    let dir = tempfile::tempdir().unwrap();
    (Library::open_in_memory(dir.path()).unwrap(), dir)
}

/// Archives named after kinds (new libraries only have "아카이브 1"), so items of that kind land in them.
fn kind_archives(l: &Library, kinds: &[Kind]) {
    for (i, k) in kinds.iter().enumerate() {
        l.save_archive(Archive { id: k.as_str().into(), name: k.as_str().into(), icon: k.as_str().into(), kind: *k, format: None, position: i as i64 + 1, pinned: false }).unwrap();
    }
}

#[test]
fn crud_and_query() {
    let (l, _d) = lib();
    let a = l.create_item(NewItem { title: "Alpha".into(), kind: Some(Kind::Anime), ..Default::default() }).unwrap();
    let _b = l.create_item(NewItem { title: "Beta".into(), kind: Some(Kind::Manga), ..Default::default() }).unwrap();
    let author = l.upsert_tag("Mori", TagCategory::Author).unwrap();
    assert_eq!(l.upsert_tag("mori", TagCategory::Author).unwrap().id, author.id, "case-insensitive upsert");

    let patch: ItemPatch = serde_json::from_value(serde_json::json!({
        "rating": 4.5, "favorite": true, "tagIds": [author.id], "blocks": [{"id": "1", "type": "paragraph", "text": "hi"}]
    }))
    .unwrap();
    let a2 = l.update_item(&a.id, patch).unwrap();
    assert_eq!(a2.rating, Some(4.5));
    assert_eq!(a2.tags.len(), 1);
    assert_eq!(a2.blocks.as_ref().unwrap().len(), 1);

    // explicit null clears rating
    let clear: ItemPatch = serde_json::from_value(serde_json::json!({ "rating": null })).unwrap();
    assert_eq!(l.update_item(&a.id, clear).unwrap().rating, None);

    let q = |v: serde_json::Value| l.list_items(&serde_json::from_value(v).unwrap()).unwrap();
    assert_eq!(q(serde_json::json!({ "kinds": ["anime"] })).len(), 1);
    assert_eq!(q(serde_json::json!({ "favorite": true })).len(), 1);
    assert_eq!(q(serde_json::json!({ "tagIds": [author.id] })).len(), 1);
    assert_eq!(q(serde_json::json!({ "search": "mor" })).len(), 1, "search matches tag names");
    let sorted = q(serde_json::json!({ "sort": { "field": "title", "dir": "asc" } }));
    assert_eq!(sorted[0].title, "Alpha");

    l.delete_item(&a.id).unwrap();
    assert_eq!(q(serde_json::json!({})).len(), 1);
    assert!(l.get_item(&a.id).is_err());
}

#[test]
fn views_and_fields_roundtrip() {
    let (l, _d) = lib();
    let v: View = serde_json::from_value(serde_json::json!({
        "id": "sys:all", "name": "전체", "icon": "library", "position": 0, "layout": "table",
        "query": { "kinds": ["manga"], "sort": { "field": "rating", "dir": "desc" } },
        "card": { "size": "m" }, "columns": ["title", "rating"]
    }))
    .unwrap();
    l.save_view(v).unwrap();
    let back = &l.list_views().unwrap()[0];
    assert_eq!(back.layout, "table");
    assert_eq!(back.query.kinds.as_ref().unwrap()[0], Kind::Manga);

    let f = FieldDef { id: "f1".into(), name: "연도".into(), field_type: "number".into(), options: vec![], position: 0 };
    l.save_field(f).unwrap();
    let it = l.create_item(NewItem { title: "x".into(), ..Default::default() }).unwrap();
    let p: ItemPatch = serde_json::from_value(serde_json::json!({ "props": { "f1": 2024, "keep": 1 } })).unwrap();
    l.update_item(&it.id, p).unwrap();
    l.delete_field("f1").unwrap();
    let props = l.get_item(&it.id).unwrap().props;
    assert!(props.get("f1").is_none());
    assert!(props.get("keep").is_some());
}

#[test]
fn import_cbz_extracts_cover() {
    let (l, dir) = lib();
    // Build a tiny CBZ with two PNG pages, out of natural order.
    let cbz = dir.path().join("Vol 01.cbz");
    {
        let mut zw = zip::ZipWriter::new(std::fs::File::create(&cbz).unwrap());
        for name in ["p10.png", "p2.png"] {
            let mut buf = std::io::Cursor::new(Vec::new());
            image::RgbImage::new(4, 6).write_to(&mut buf, image::ImageFormat::Png).unwrap();
            zw.start_file(name, zip::write::SimpleFileOptions::default()).unwrap();
            std::io::Write::write_all(&mut zw, buf.get_ref()).unwrap();
        }
        zw.finish().unwrap();
    }
    let items = l.import_paths(&[cbz.to_string_lossy().into_owned()]).unwrap();
    assert_eq!(items.len(), 1);
    let it = &items[0];
    assert_eq!(it.kind, Kind::Manga);
    assert_eq!(it.title, "Vol 01");
    assert_eq!(it.files[0].kind, FileKind::Archive);
    let cover = it.cover_uri.as_ref().expect("cover generated");
    assert!(Path::new(cover).exists());
    assert_eq!(media::zip_pages(&cbz).unwrap(), vec!["p2.png", "p10.png"]);
}

#[test]
fn wishlist_categories_counts_fts() {
    let (l, _d) = lib();
    kind_archives(&l, &[Kind::Anime, Kind::Game]);
    let mk = |t: &str, k: Kind, list: ListKind| l.create_item(NewItem { title: t.into(), kind: Some(k), list: Some(list), ..Default::default() }).unwrap();
    let a = mk("장송의 프리렌", Kind::Anime, ListKind::Archive);
    let _w = mk("약사의 혼잣말", Kind::Anime, ListKind::Wishlist);
    let g = mk("ELDEN RING", Kind::Game, ListKind::Archive);

    let counts = l.counts().unwrap();
    let get = |k: Kind, li: ListKind| counts.iter().find(|c| c.archive_id.as_deref() == Some(k.as_str()) && c.list == li).map(|c| c.count).unwrap_or(0);
    assert_eq!(get(Kind::Anime, ListKind::Archive), 1);
    assert_eq!(get(Kind::Anime, ListKind::Wishlist), 1);
    assert_eq!(get(Kind::Game, ListKind::Wishlist), 0);

    // folder tree: 팬아트 > 프리렌
    let root = Category { id: "c1".into(), parent_id: None, kind: Some(Kind::Anime), name: "팬아트".into(), position: 0, color: Some("pink".into()), archive_id: None };
    let child = Category { id: "c2".into(), parent_id: Some("c1".into()), kind: Some(Kind::Anime), name: "프리렌".into(), position: 0, color: None, archive_id: None };
    l.save_category(root.clone()).unwrap();
    l.save_category(child).unwrap();
    assert!(l.save_category(Category { parent_id: Some("c2".into()), ..root }).is_err(), "cycle rejected");
    l.add_to_category(std::slice::from_ref(&a.id), "c2").unwrap();
    let q = |v: serde_json::Value| l.list_items(&serde_json::from_value(v).unwrap()).unwrap();
    assert_eq!(q(serde_json::json!({ "categoryId": "c1" })).len(), 1, "parent includes descendants");
    assert_eq!(q(serde_json::json!({ "kinds": ["anime"], "list": "wishlist" })).len(), 1);

    // FTS (trigram) on Korean substring + people names
    let mori = l.upsert_tag("FromSoftware", TagCategory::Studio).unwrap();
    l.update_item(&g.id, serde_json::from_value(serde_json::json!({ "tagIds": [mori.id], "summary": "오픈월드 액션 RPG" })).unwrap()).unwrap();
    assert_eq!(q(serde_json::json!({ "search": "프리렌" })).len(), 1);
    assert_eq!(q(serde_json::json!({ "search": "fromsoft" })).len(), 1);
    assert_eq!(q(serde_json::json!({ "search": "오픈월드" })).len(), 1);
    assert_eq!(q(serde_json::json!({ "search": "혼잣" })).len(), 1, "short query falls back to LIKE");

    assert_eq!(l.delete_category("c1").unwrap(), 1, "items inside go to the trash too");
    assert!(l.list_categories().unwrap().is_empty(), "children go with it");
    assert!(l.get_item(&a.id).is_err());
    let groups = l.list_trash_groups().unwrap();
    assert_eq!((groups.len(), groups[0].id.as_str(), groups[0].count), (1, "cat:c1", 1));
    assert_eq!(l.restore_group("cat:c1").unwrap(), 1);
    assert_eq!(l.list_categories().unwrap().len(), 2, "sub-folders come back");
    assert_eq!(l.get_item(&a.id).unwrap().category_ids, ["c2"]);
    assert_eq!(q(serde_json::json!({ "search": "프리렌" })).len(), 1, "search index restored");
    // restoring a single item brings its folders back too
    l.delete_category("c1").unwrap();
    l.restore_item(&a.id).unwrap();
    assert_eq!(l.list_categories().unwrap().len(), 2);
    l.delete_category("c1").unwrap();
    l.purge_group("cat:c1").unwrap();
    assert_eq!(l.trash_count().unwrap(), 0);
}

#[test]
fn bulk_create_with_tags_and_codes() {
    let (l, _d) = lib();
    let ids = l
        .bulk_create(vec![
            NewItem { title: "Song".into(), kind: Some(Kind::Music), tags: vec![NewTag { name: "IU".into(), category: TagCategory::Author }], ..Default::default() },
            NewItem { title: "X".into(), kind: Some(Kind::Catalog), code: Some("abc123".into()), rating: Some(4.0), ..Default::default() },
        ])
        .unwrap();
    assert_eq!(l.get_item(&ids[0]).unwrap().tags[0].name, "IU");
    let x = l.get_item(&ids[1]).unwrap();
    assert_eq!(x.code.as_deref(), Some("ABC-123"));
    assert_eq!(x.rating, Some(4.0));
}

#[test]
fn reader_pages_and_watch_folder() {
    let (l, dir) = lib();
    let root = dir.path().join("watch");
    std::fs::create_dir_all(root.join("Album A")).unwrap();
    for n in ["10.png", "2.png"] {
        image::RgbImage::new(3, 3).save(root.join("Album A").join(n)).unwrap();
    }
    std::fs::write(root.join(".hidden"), b"x").unwrap();
    l.add_watch_folder(&root.to_string_lossy(), Kind::Illust, ListKind::Archive).unwrap();
    assert_eq!(l.rescan_watch_folders().unwrap(), 1);
    assert_eq!(l.rescan_watch_folders().unwrap(), 0, "idempotent");
    let it = &l.list_items(&ItemQuery::default()).unwrap()[0];
    assert_eq!(it.kind, Kind::Illust);
    let fid = &it.files[0].id;
    assert_eq!(l.list_pages(fid).unwrap(), vec!["2.png", "10.png"]);
    let (bytes, mime) = l.read_page(fid, 1).unwrap();
    assert_eq!(mime, "image/png");
    assert!(bytes.starts_with(b"\x89PNG"));
    assert!(l.is_known_media(&it.files[0].uri));
    assert!(!l.is_known_media("/etc/passwd"));
}

#[test]
fn user_archives_and_pins() {
    let (l, _d) = lib();
    assert_eq!(l.list_archives().unwrap().iter().map(|a| a.name.as_str()).collect::<Vec<_>>(), ["아카이브 1"], "one plain archive to start");
    let a = Archive { id: "vocaloid".into(), name: "보컬로이드".into(), icon: "headphones".into(), kind: Kind::Music, format: Some("fmt1".into()), position: 20, pinned: true };
    l.save_archive(a).unwrap();
    assert_eq!(l.list_archives().unwrap()[0].id, "vocaloid", "pinned first");
    let x = l.create_item(NewItem { title: "千本桜".into(), kind: Some(Kind::Music), archive_id: Some("vocaloid".into()), ..Default::default() }).unwrap();
    let y = l.create_item(NewItem { title: "Song".into(), kind: Some(Kind::Music), ..Default::default() }).unwrap();
    assert_eq!(x.archive_id.as_deref(), Some("vocaloid"));
    assert_eq!(y.archive_id, None, "no archive of that kind any more");
    let z = l.create_item(NewItem { title: "Zzz".into(), kind: Some(Kind::Music), ..Default::default() }).unwrap();
    l.update_item(&z.id, serde_json::from_value(serde_json::json!({ "pinned": true })).unwrap()).unwrap();
    l.update_item(&z.id, serde_json::from_value(serde_json::json!({ "archiveId": "vocaloid" })).unwrap()).unwrap();
    let q = ItemQuery { archive_id: Some("vocaloid".into()), sort: Some(Sort { field: SortField::Title, dir: SortDir::Asc }), ..Default::default() };
    assert_eq!(l.list_items(&q).unwrap()[0].title, "Zzz", "pinned items come first");
    l.save_category(Category { id: "vf".into(), parent_id: None, kind: None, name: "보카로 폴더".into(), position: 0, color: None, archive_id: Some("vocaloid".into()) }).unwrap();
    assert_eq!(l.delete_archive("vocaloid").unwrap(), 2);
    assert!(l.get_item(&x.id).is_err());
    assert!(l.list_categories().unwrap().is_empty(), "its folders go with it");
    assert_eq!(l.list_archives().unwrap().len(), 1);
    assert_eq!(l.trash_count().unwrap(), 1, "the archive (its two items inside it)");
    let g = &l.list_trash_groups().unwrap()[0];
    assert_eq!((g.id.as_str(), g.name.as_str(), g.count), ("arc:vocaloid", "보컬로이드", 2));
    assert_eq!(l.restore_group("arc:vocaloid").unwrap(), 2);
    assert_eq!(l.get_item(&x.id).unwrap().archive_id.as_deref(), Some("vocaloid"));
    assert_eq!(l.list_archives().unwrap().len(), 2);
    assert_eq!(l.list_categories().unwrap()[0].archive_id.as_deref(), Some("vocaloid"), "folders come back");
    l.delete_archive("vocaloid").unwrap();
    l.empty_trash(None).unwrap();
    assert_eq!(l.trash_count().unwrap(), 0);
    assert_eq!(l.list_archives().unwrap().len(), 1);
}

#[test]
fn custom_statuses() {
    let (l, _d) = lib();
    assert_eq!(l.list_statuses().unwrap().len(), 5);
    l.save_status(StatusDef { id: "rewatch".into(), label: "재감상".into(), icon: "repeat".into(), color: "violet".into(), position: 5 }).unwrap();
    let it = l.create_item(NewItem { title: "x".into(), status: Some("rewatch".into()), ..Default::default() }).unwrap();
    assert_eq!(it.status, "rewatch");
    assert_eq!(l.list_items(&serde_json::from_value(serde_json::json!({ "statuses": ["rewatch"] })).unwrap()).unwrap().len(), 1);
    assert_eq!(l.delete_status("rewatch", "completed").unwrap(), 1);
    assert_eq!(l.get_item(&it.id).unwrap().status, "completed");
}

#[test]
fn text_files_read_write_export() {
    let (l, dir) = lib();
    let md = dir.path().join("notes.md");
    std::fs::write(&md, "# 제목\n본문").unwrap();
    let mp3 = dir.path().join("song.mp3");
    std::fs::write(&mp3, b"ID3").unwrap();
    let items = l.import_paths(&[md.to_string_lossy().into_owned(), mp3.to_string_lossy().into_owned()]).unwrap();
    assert_eq!(items[0].files[0].kind, FileKind::Text);
    assert_eq!(items[1].files[0].kind, FileKind::Audio);
    assert_eq!(items[1].kind, Kind::Music);
    let fid = &items[0].files[0].id;
    assert_eq!(l.read_text(fid).unwrap(), "# 제목\n본문");
    l.write_text(fid, "# 바뀜").unwrap();
    assert_eq!(std::fs::read_to_string(&md).unwrap(), "# 바뀜");
    assert!(l.read_text(&items[1].files[0].id).is_err(), "audio is not text");
    let out = dir.path().join("copy.md");
    l.export_file(fid, &out.to_string_lossy()).unwrap();
    assert_eq!(std::fs::read_to_string(out).unwrap(), "# 바뀜");
}

#[test]
fn trash_restore_purge_and_settings() {
    let (l, _d) = lib();
    kind_archives(&l, &[Kind::Game]);
    let a = l.create_item(NewItem { title: "버릴 것".into(), kind: Some(Kind::Game), ..Default::default() }).unwrap();
    let b = l.create_item(NewItem { title: "영구 삭제".into(), kind: Some(Kind::Game), ..Default::default() }).unwrap();
    l.delete_item(&a.id).unwrap();
    l.delete_item(&b.id).unwrap();
    assert_eq!(l.trash_count().unwrap(), 2);
    assert!(l.list_items(&ItemQuery::default()).unwrap().is_empty());
    let back = l.restore_item(&a.id).unwrap();
    assert_eq!(back.archive_id.as_deref(), Some("game"));
    assert_eq!(l.list_items(&serde_json::from_value(serde_json::json!({ "search": "버릴" })).unwrap()).unwrap().len(), 1, "FTS restored");
    l.purge_item(&b.id).unwrap();
    assert_eq!(l.trash_count().unwrap(), 0);
    l.set_settings("formats", &serde_json::json!([{ "id": "fmt1", "name": "굿즈" }])).unwrap();
    assert_eq!(l.get_settings("formats").unwrap().unwrap()[0]["name"], "굿즈");
    assert_eq!(l.list_categories().unwrap().len(), 0);
    l.save_category(Category { id: "x".into(), parent_id: None, kind: None, name: "폴더".into(), position: 0, color: Some("teal".into()), archive_id: None }).unwrap();
    assert_eq!(l.list_categories().unwrap()[0].color.as_deref(), Some("teal"));
}

/// Two devices share a library through a stand-in "cloud" (what Drive's app folder would hold).
#[test]
fn sync_between_two_devices() {
    let (a, _da) = lib();
    let (b, _db) = lib();
    let mut cloud: Option<crate::sync::Snapshot> = None;
    let sync = |l: &Library, cloud: &mut Option<crate::sync::Snapshot>| -> usize {
        let (merged, pulled) = l.sync_merge(cloud.as_ref()).unwrap();
        *cloud = Some(merged.clone());
        l.sync_commit(&merged).unwrap();
        pulled
    };
    let titles = |l: &Library| {
        let mut t: Vec<String> = l.list_items(&Default::default()).unwrap().into_iter().map(|i| i.title).collect();
        t.sort();
        t
    };

    // A starts the cloud copy
    let x = a.create_item(NewItem { title: "Frieren".into(), kind: Some(Kind::Anime), ..Default::default() }).unwrap();
    let mut folder = a.save_category(Category { id: "c1".into(), parent_id: None, kind: None, name: "팬아트".into(), position: 0, color: Some("red".into()), archive_id: None }).unwrap();
    sync(&a, &mut cloud);

    // B joins: gets A's item and folder (and keeps its own item)
    b.create_item(NewItem { title: "Only on B".into(), ..Default::default() }).unwrap();
    assert!(sync(&b, &mut cloud) > 0);
    assert_eq!(titles(&b), ["Frieren", "Only on B"]);
    assert_eq!(b.list_categories().unwrap()[0].color.as_deref(), Some("red"));
    assert_eq!(b.list_items(&serde_json::from_value(serde_json::json!({ "search": "frie" })).unwrap()).unwrap().len(), 1, "search index rebuilt");

    // A: folder colour + rename ; B: delete its own item — then both sync twice
    folder.color = Some("#0ea5e9".into());
    folder = a.save_category(folder).unwrap();
    a.update_item(&x.id, serde_json::from_value(serde_json::json!({ "title": "Frieren 2" })).unwrap()).unwrap();
    let only_b = b.list_items(&Default::default()).unwrap().into_iter().find(|i| i.title == "Only on B").unwrap();
    b.delete_item(&only_b.id).unwrap();
    b.purge_item(&only_b.id).unwrap();
    for _ in 0..2 {
        sync(&a, &mut cloud);
        sync(&b, &mut cloud);
    }
    assert_eq!(titles(&a), ["Frieren 2"]);
    assert_eq!(titles(&b), ["Frieren 2"]);
    assert_eq!(b.list_categories().unwrap()[0].color, folder.color);
    // secrets never leave the device
    a.set_setting("secret:drive", "{\"refresh\":\"x\"}").unwrap();
    sync(&a, &mut cloud);
    assert!(!serde_json::to_string(cloud.as_ref().unwrap()).unwrap().contains("secret:"));
}

/// Writes a realistic snapshot to $CURIO_FIXTURE (used by the web version's round-trip check),
/// and with $CURIO_MERGE_IN merges a snapshot the web version produced and reports the result.
#[test]
#[ignore = "fixture for the web test"]
fn web_fixture() {
    // a library file that survives between the two runs (export, then merge the web's edit back)
    let dir = std::path::PathBuf::from(std::env::var("CURIO_FIXTURE_DIR").unwrap_or_else(|_| std::env::temp_dir().join("curio-web-fixture").to_string_lossy().into()));
    std::fs::create_dir_all(&dir).unwrap();
    let l = Library::open(&dir.join("lib.db"), &dir.join("cache")).unwrap();
    if let Ok(p) = std::env::var("CURIO_MERGE_IN") {
        let web: crate::sync::Snapshot = serde_json::from_str(&std::fs::read_to_string(p).unwrap()).unwrap();
        let (merged, pulled) = l.sync_merge(Some(&web)).unwrap();
        let it = l.list_items(&Default::default()).unwrap().into_iter().find(|i| i.title.starts_with("Frieren")).unwrap();
        let it = l.get_item(&it.id).unwrap();
        println!("PULLED={pulled} TITLE={} RATING={:?} TAGS={:?} CHANGES_VS_WEB={}", it.title, it.rating, it.tags.iter().map(|t| &t.name).collect::<Vec<_>>(), crate::sync::changes(&merged, &web));
        return;
    }
    let a = l.create_item(NewItem { title: "Frieren".into(), kind: Some(Kind::Anime), tags: vec![NewTag { name: "Madhouse".into(), category: TagCategory::Studio }], ..Default::default() }).unwrap();
    l.update_item(&a.id, serde_json::from_value(serde_json::json!({ "rating": 4.0, "favorite": true, "props": {"_lyrics": {"plain": "a", "synced": "", "source": "x"}}, "blocks": [{"id": "1", "type": "paragraph", "text": "메모"}] })).unwrap()).unwrap();
    let c = l.save_category(Category { id: "c1".into(), parent_id: None, kind: None, name: "팬아트".into(), position: 0, color: Some("#0ea5e9".into()), archive_id: None }).unwrap();
    l.add_to_category(std::slice::from_ref(&a.id), &c.id).unwrap();
    let b = l.create_item(NewItem { title: "Trashed".into(), ..Default::default() }).unwrap();
    l.delete_item(&b.id).unwrap();
    l.set_settings("palette", &serde_json::json!({ "custom": ["#123456"] })).unwrap();
    l.save_view(View { id: "sys:all".into(), name: "전체".into(), icon: "library".into(), position: 0, layout: "gallery".into(), query: Default::default(), card: serde_json::json!({"size": "m", "showTitle": true}), columns: vec!["title".into()] }).unwrap();
    let (snap, _) = l.sync_merge(None).unwrap();
    if let Ok(p) = std::env::var("CURIO_FIXTURE") {
        std::fs::write(p, serde_json::to_string(&snap).unwrap()).unwrap();
    }
    l.sync_commit(&snap).unwrap();
}

#[test]
fn file_sync_limit_setting() {
    let (l, _d) = lib();
    assert_eq!(l.file_sync_limit(), 50 * 1024 * 1024, "default 50 MB");
    l.set_settings("cloud", &serde_json::json!({ "fileSyncMb": 200 })).unwrap();
    assert_eq!(l.file_sync_limit(), 200 * 1024 * 1024);
    l.set_settings("cloud", &serde_json::json!({ "fileSyncMb": 0 })).unwrap();
    assert_eq!(l.file_sync_limit(), 0, "0 = files stay on the PC");
}

/// Cloud switch off: the item leaves the cloud copy (and other devices) but stays on this device.
#[test]
fn cloud_switch_off_keeps_item_here() {
    let (a, _da) = lib();
    let (b, _db) = lib();
    let mut cloud: Option<crate::sync::Snapshot> = None;
    let sync = |l: &Library, cloud: &mut Option<crate::sync::Snapshot>| {
        let (merged, _) = l.sync_merge(cloud.as_ref()).unwrap();
        *cloud = Some(merged.clone());
        l.sync_commit(&merged).unwrap();
    };
    let x = a.create_item(NewItem { title: "Private".into(), archive_id: Some("archive1".into()), ..Default::default() }).unwrap();
    a.create_item(NewItem { title: "Shared".into(), archive_id: Some("archive1".into()), ..Default::default() }).unwrap();
    sync(&a, &mut cloud);
    sync(&b, &mut cloud);
    assert_eq!(b.list_items(&Default::default()).unwrap().len(), 2);

    a.update_item(&x.id, serde_json::from_value(serde_json::json!({ "props": { "_cloud": false } })).unwrap()).unwrap();
    sync(&a, &mut cloud);
    sync(&b, &mut cloud);
    assert!(a.get_item(&x.id).is_ok(), "still on this device");
    assert!(!serde_json::to_string(cloud.as_ref().unwrap()).unwrap().contains("Private"), "gone from the cloud copy");
    assert_eq!(b.list_items(&Default::default()).unwrap().iter().map(|i| i.title.as_str()).collect::<Vec<_>>(), ["Shared"]);

    // switched back on → shared again
    a.update_item(&x.id, serde_json::from_value(serde_json::json!({ "props": {} })).unwrap()).unwrap();
    sync(&a, &mut cloud);
    sync(&b, &mut cloud);
    assert_eq!(b.list_items(&Default::default()).unwrap().len(), 2);

    // a whole archive switched off (the "cloud" setting) → its items stay on A only
    a.set_settings("cloud", &serde_json::json!({ "offArchives": ["archive1"] })).unwrap();
    sync(&a, &mut cloud);
    sync(&b, &mut cloud);
    assert_eq!(a.list_items(&Default::default()).unwrap().len(), 2, "kept here");
    assert!(b.list_items(&Default::default()).unwrap().is_empty(), "left the cloud copy");
    a.set_settings("cloud", &serde_json::json!({ "offArchives": [] })).unwrap();
    sync(&a, &mut cloud);
    sync(&b, &mut cloud);
    assert_eq!(b.list_items(&Default::default()).unwrap().len(), 2, "back on");
}

/// Facts beyond the built-ins (album, length…) stay with the item for the user's own properties.
#[test]
fn candidate_extras_are_kept() {
    let (l, _d) = lib();
    let it = l.create_item(NewItem { title: "밤편지".into(), ..Default::default() }).unwrap();
    let mut c = Candidate { provider: "test".into(), id: "1".into(), title: "밤편지".into(), kind: Some(Kind::Music), ..Default::default() };
    c.extra.insert("album".into(), "Palette".into());
    c.extra.insert("duration".into(), "4:13".into());
    let saved = l.apply_candidate(&it.id, c, false).unwrap();
    assert_eq!(saved.kind, Kind::Music, "a plain item that turns out to be a song becomes one");
    assert_eq!(saved.props["_extra"]["album"], "Palette");
    assert_eq!(saved.props["_extra"]["duration"], "4:13");
}

/// Paste import → auto-fill: a song found by title gets a YouTube Music link.
#[test]
#[ignore = "network"]
fn autofill_song_gets_youtube_music_link() {
    let (l, _d) = lib();
    let it = l.create_item(NewItem { title: "Supernova".into(), kind: Some(Kind::Music), tags: vec![NewTag { name: "aespa".into(), category: TagCategory::Author }], ..Default::default() }).unwrap();
    assert!(l.autofill(&it.id).unwrap(), "found");
    let got = l.get_item(&it.id).unwrap();
    println!("{:?} {:?}", got.url, got.props.get("_extra"));
    assert!(got.url.as_deref().is_some_and(|u| u.starts_with("https://music.youtube.com/watch?v=")), "{:?}", got.url);
}

/// The extension's way: a VTuber cover finds the original song's lyrics by title + original singer + length.
#[test]
#[ignore = "network"]
fn cover_lyrics() {
    let (l, _d) = lib();
    let it = l.create_item(NewItem { title: "x".into(), kind: Some(Kind::Music), url: Some("https://www.youtube.com/watch?v=fTqvR0U0EC4".into()), ..Default::default() }).unwrap();
    assert!(l.autofill(&it.id).unwrap());
    let got = l.get_item(&it.id).unwrap();
    println!("title {:?} people {:?} extra {:?}", got.title, got.tags.iter().map(|t| &t.name).collect::<Vec<_>>(), got.props.get("_extra"));
    let ly = l.fetch_lyrics(&it.id).unwrap().expect("lyrics found");
    let text = ly.props["_lyrics"]["plain"].as_str().unwrap().to_string();
    println!("{}", text.chars().take(120).collect::<String>());
    assert!(text.len() > 50);
}
