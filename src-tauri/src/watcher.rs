//! Watches the library's "watch folders" and auto-imports new children.
//! Debounced: a burst of file events (copying a 500-file folder) triggers one rescan.

use std::path::Path;
use std::sync::{mpsc, Mutex};
use std::time::Duration;

use curio_core::Library;
use notify::{RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter, Manager};

static WATCHER: Mutex<Option<notify::RecommendedWatcher>> = Mutex::new(None);

pub fn restart(app: &AppHandle) {
    let lib = app.state::<Library>();
    let folders = lib.list_watch_folders().unwrap_or_default();
    let mut slot = WATCHER.lock().unwrap_or_else(|e| e.into_inner());
    *slot = None; // drop old watcher
    if folders.is_empty() {
        return;
    }
    let (tx, rx) = mpsc::channel::<()>();
    let Ok(mut w) = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        if res.map(|e| e.kind.is_create() || e.kind.is_modify() || e.kind.is_remove()).unwrap_or(false) {
            let _ = tx.send(());
        }
    }) else {
        return;
    };
    for f in &folders {
        let _ = w.watch(Path::new(&f.path), RecursiveMode::NonRecursive);
    }
    *slot = Some(w);

    let app = app.clone();
    std::thread::spawn(move || {
        while rx.recv().is_ok() {
            // debounce: wait until events stop for 2 s
            while rx.recv_timeout(Duration::from_secs(2)).is_ok() {}
            if let Ok(n) = app.state::<Library>().rescan_watch_folders() {
                if n > 0 {
                    let _ = app.emit("library-changed", n);
                }
            }
        }
    });
}

/// Initial scan on startup (off the main thread) + start watching.
pub fn start(app: &AppHandle) {
    let handle = app.clone();
    std::thread::spawn(move || {
        if let Ok(n) = handle.state::<Library>().rescan_watch_folders() {
            if n > 0 {
                let _ = handle.emit("library-changed", n);
            }
        }
        restart(&handle);
    });
}
