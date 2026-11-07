//! IPC surface. Each command is a one-liner into `curio_core::Library`.
//! `async` = runs on Tauri's thread pool, never blocks the UI thread
//! (import decodes images / opens archives, metadata hits the network).

use curio_core::{models::*, Error, Library};
use tauri::State;

type R<T> = Result<T, Error>;

#[tauri::command] pub async fn list_items(lib: State<'_, Library>, query: ItemQuery) -> R<Vec<Item>> { lib.list_items(&query) }
#[tauri::command] pub async fn counts(lib: State<'_, Library>) -> R<Vec<ArchiveCount>> { lib.counts() }
#[tauri::command] pub async fn list_archives(lib: State<'_, Library>) -> R<Vec<Archive>> { lib.list_archives() }
#[tauri::command] pub async fn save_archive(lib: State<'_, Library>, archive: Archive) -> R<Archive> { lib.save_archive(archive) }
#[tauri::command] pub async fn delete_archive(lib: State<'_, Library>, id: String) -> R<usize> { lib.delete_archive(&id) }
#[tauri::command] pub async fn get_item(lib: State<'_, Library>, id: String) -> R<Item> { lib.get_item(&id) }
#[tauri::command] pub async fn create_item(lib: State<'_, Library>, input: NewItem) -> R<Item> { lib.create_item(input) }
#[tauri::command] pub async fn bulk_create(lib: State<'_, Library>, inputs: Vec<NewItem>) -> R<Vec<String>> { lib.bulk_create(inputs) }
#[tauri::command] pub async fn update_item(lib: State<'_, Library>, id: String, patch: ItemPatch) -> R<Item> { lib.update_item(&id, patch) }
#[tauri::command] pub async fn delete_item(lib: State<'_, Library>, id: String) -> R<()> { lib.delete_item(&id) }

#[tauri::command] pub async fn list_tags(lib: State<'_, Library>) -> R<Vec<Tag>> { lib.list_tags() }
#[tauri::command] pub async fn upsert_tag(lib: State<'_, Library>, name: String, category: TagCategory) -> R<Tag> { lib.upsert_tag(&name, category) }

#[tauri::command] pub async fn list_categories(lib: State<'_, Library>) -> R<Vec<Category>> { lib.list_categories() }
#[tauri::command] pub async fn save_category(lib: State<'_, Library>, category: Category) -> R<Category> { lib.save_category(category) }
#[tauri::command] pub async fn delete_category(lib: State<'_, Library>, id: String) -> R<()> { lib.delete_category(&id) }
#[tauri::command] pub async fn add_to_category(lib: State<'_, Library>, item_ids: Vec<String>, category_id: String) -> R<()> { lib.add_to_category(&item_ids, &category_id) }

#[tauri::command] pub async fn list_statuses(lib: State<'_, Library>) -> R<Vec<StatusDef>> { lib.list_statuses() }
#[tauri::command] pub async fn save_status(lib: State<'_, Library>, status: StatusDef) -> R<StatusDef> { lib.save_status(status) }
#[tauri::command] pub async fn delete_status(lib: State<'_, Library>, id: String, fallback: String) -> R<usize> { lib.delete_status(&id, &fallback) }
#[tauri::command] pub async fn list_fields(lib: State<'_, Library>) -> R<Vec<FieldDef>> { lib.list_fields() }
#[tauri::command] pub async fn save_field(lib: State<'_, Library>, field: FieldDef) -> R<FieldDef> { lib.save_field(field) }
#[tauri::command] pub async fn delete_field(lib: State<'_, Library>, id: String) -> R<()> { lib.delete_field(&id) }

#[tauri::command] pub async fn list_views(lib: State<'_, Library>) -> R<Vec<View>> { lib.list_views() }
#[tauri::command] pub async fn save_view(lib: State<'_, Library>, view: View) -> R<View> { lib.save_view(view) }
#[tauri::command] pub async fn delete_view(lib: State<'_, Library>, id: String) -> R<()> { lib.delete_view(&id) }

#[tauri::command] pub async fn attach_paths(lib: State<'_, Library>, item_id: String, paths: Vec<String>) -> R<Vec<FileRef>> { lib.attach_paths(&item_id, &paths) }
#[tauri::command] pub async fn detach_file(lib: State<'_, Library>, file_id: String) -> R<()> { lib.detach_file(&file_id) }
#[tauri::command] pub async fn import_paths(lib: State<'_, Library>, paths: Vec<String>, kind: Option<Kind>, list: Option<ListKind>, archive_id: Option<String>) -> R<Vec<Item>> { lib.import_paths_as(&paths, kind, list, archive_id) }
#[tauri::command] pub async fn list_pages(lib: State<'_, Library>, file_id: String) -> R<Vec<String>> { lib.list_pages(&file_id) }

#[tauri::command] pub async fn search_metadata(lib: State<'_, Library>, kind: Kind, query: String) -> R<Vec<Candidate>> { lib.search_metadata(kind, &query) }
#[tauri::command] pub async fn apply_metadata(lib: State<'_, Library>, item_id: String, candidate: Candidate, overwrite_title: bool) -> R<Item> { lib.apply_metadata(&item_id, candidate, overwrite_title) }
#[tauri::command] pub async fn autofill(lib: State<'_, Library>, item_id: String) -> R<bool> { lib.autofill(&item_id) }
#[tauri::command] pub async fn fetch_lyrics(lib: State<'_, Library>, item_id: String) -> R<Option<Item>> { lib.fetch_lyrics(&item_id) }

#[tauri::command] pub async fn list_watch_folders(lib: State<'_, Library>) -> R<Vec<WatchFolder>> { lib.list_watch_folders() }
#[tauri::command] pub async fn add_watch_folder(app: tauri::AppHandle, lib: State<'_, Library>, path: String, kind: Kind, list: ListKind) -> R<WatchFolder> {
    let w = lib.add_watch_folder(&path, kind, list)?;
    crate::watcher::restart(&app);
    Ok(w)
}
#[tauri::command] pub async fn remove_watch_folder(app: tauri::AppHandle, lib: State<'_, Library>, id: String) -> R<()> {
    lib.remove_watch_folder(&id)?;
    crate::watcher::restart(&app);
    Ok(())
}
#[tauri::command] pub async fn rescan(lib: State<'_, Library>) -> R<usize> { lib.rescan_watch_folders() }

#[tauri::command] pub async fn read_text(lib: State<'_, Library>, file_id: String) -> R<String> { lib.read_text(&file_id) }
#[tauri::command] pub async fn write_text(lib: State<'_, Library>, file_id: String, content: String) -> R<FileRef> { lib.write_text(&file_id, &content) }
#[tauri::command] pub async fn export_file(lib: State<'_, Library>, file_id: String, dest: String) -> R<()> { lib.export_file(&file_id, &dest) }

#[tauri::command] pub async fn list_trash(lib: State<'_, Library>) -> R<Vec<TrashedItem>> { lib.list_trash() }
#[tauri::command] pub async fn trash_count(lib: State<'_, Library>) -> R<i64> { lib.trash_count() }
#[tauri::command] pub async fn restore_item(lib: State<'_, Library>, id: String) -> R<Item> { lib.restore_item(&id) }
#[tauri::command] pub async fn purge_item(lib: State<'_, Library>, id: String) -> R<()> { lib.purge_item(&id) }
#[tauri::command] pub async fn empty_trash(lib: State<'_, Library>, older_than: Option<i64>) -> R<usize> { lib.empty_trash(older_than) }
#[tauri::command] pub async fn get_settings(lib: State<'_, Library>, key: String) -> R<Option<serde_json::Value>> { lib.get_settings(&key) }
#[tauri::command] pub async fn set_settings(lib: State<'_, Library>, key: String, value: serde_json::Value) -> R<()> { lib.set_settings(&key, &value) }
