mod commands;
mod watcher;

use curio_core::Library;
use tauri::http::{Response, StatusCode};
use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        // Reader pages: curio://localhost/page/<fileId>/<index>  (http://curio.localhost/... on Windows)
        // Streams one entry out of a zip/cbz without extracting the archive to disk.
        .register_uri_scheme_protocol("curio", |ctx, req| {
            let path = percent_decode(req.uri().path());
            let parts: Vec<&str> = path.trim_start_matches('/').split('/').collect();
            let lib = ctx.app_handle().state::<Library>();
            let res = match parts.as_slice() {
                ["page", file_id, idx] => idx.parse::<usize>().ok().and_then(|i| lib.read_page(file_id, i).ok()),
                _ => None,
            };
            match res {
                Some((bytes, mime)) => Response::builder()
                    .header("Content-Type", mime)
                    .header("Cache-Control", "max-age=3600")
                    .header("Access-Control-Allow-Origin", "*")
                    .body(bytes)
                    .unwrap(),
                None => Response::builder().status(StatusCode::NOT_FOUND).body(Vec::new()).unwrap(),
            }
        })
        .setup(|app| {
            // %APPDATA%/app.curio.desktop (Win) · ~/Library/Application Support/... (mac) · ~/.local/share/... (Linux)
            let data = app.path().app_data_dir()?;
            let cache = app.path().app_cache_dir()?;
            let lib = Library::open(&data.join("curio.db"), &cache)?;
            // trash keeps items for 30 days
            let month = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0) - 30 * 86_400_000;
            let _ = lib.empty_trash(Some(month));
            app.manage(lib);
            watcher::start(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_items,
            commands::counts,
            commands::list_archives,
            commands::save_archive,
            commands::delete_archive,
            commands::get_item,
            commands::create_item,
            commands::bulk_create,
            commands::update_item,
            commands::delete_item,
            commands::list_tags,
            commands::upsert_tag,
            commands::list_categories,
            commands::save_category,
            commands::delete_category,
            commands::add_to_category,
            commands::list_statuses,
            commands::save_status,
            commands::delete_status,
            commands::list_fields,
            commands::save_field,
            commands::delete_field,
            commands::list_views,
            commands::save_view,
            commands::delete_view,
            commands::attach_paths,
            commands::detach_file,
            commands::import_paths,
            commands::list_pages,
            commands::search_metadata,
            commands::apply_metadata,
            commands::autofill,
            commands::fetch_lyrics,
            commands::cover_from_video,
            commands::drive_status,
            commands::drive_login,
            commands::drive_logout,
            commands::drive_folder,
            commands::drive_import,
            commands::list_watch_folders,
            commands::add_watch_folder,
            commands::remove_watch_folder,
            commands::rescan,
            commands::read_text,
            commands::write_text,
            commands::export_file,
            commands::list_trash,
            commands::trash_count,
            commands::restore_item,
            commands::purge_item,
            commands::empty_trash,
            commands::get_settings,
            commands::set_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Curio");
}

fn percent_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let Ok(v) = u8::from_str_radix(std::str::from_utf8(&b[i + 1..i + 3]).unwrap_or(""), 16) {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}
