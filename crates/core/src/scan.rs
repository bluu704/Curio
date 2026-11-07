//! Classify local paths without reading their contents (fast even for 50 GB videos).

use std::path::Path;
use std::time::UNIX_EPOCH;

use crate::models::{FileKind, Kind};

pub const IMAGE_EXT: &[&str] = &["jpg", "jpeg", "png", "webp", "gif", "bmp", "avif"];
const VIDEO_EXT: &[&str] = &["mp4", "mkv", "webm", "avi", "mov", "m4v", "wmv", "ts"];
const ARCHIVE_EXT: &[&str] = &["zip", "cbz", "rar", "cbr", "7z", "cb7"];
const DOC_EXT: &[&str] = &["pdf", "epub", "txt", "md"];

pub fn ext_of(p: &Path) -> String {
    p.extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase()
}

pub fn file_kind(p: &Path) -> FileKind {
    if p.is_dir() {
        return FileKind::Folder;
    }
    let e = ext_of(p);
    let e = e.as_str();
    if VIDEO_EXT.contains(&e) {
        FileKind::Video
    } else if ARCHIVE_EXT.contains(&e) {
        FileKind::Archive
    } else if IMAGE_EXT.contains(&e) || e == "psd" {
        FileKind::Image
    } else if DOC_EXT.contains(&e) {
        FileKind::Document
    } else {
        FileKind::Other
    }
}

/// Best-effort guess of what an imported path is. User can change it later.
pub fn guess_kind(p: &Path) -> Kind {
    match file_kind(p) {
        FileKind::Video => Kind::Movie,
        FileKind::Archive | FileKind::Document => Kind::Manga,
        FileKind::Image => Kind::Illust,
        FileKind::Folder => {
            // A folder full of videos → anime/series; full of images → manga/illust.
            let (mut v, mut i) = (0, 0);
            for e in walkdir::WalkDir::new(p).max_depth(2).into_iter().flatten().take(200) {
                match file_kind(e.path()) {
                    FileKind::Video => v += 1,
                    FileKind::Image | FileKind::Archive => i += 1,
                    _ => {}
                }
            }
            if v > 1 { Kind::Anime } else if v == 1 { Kind::Movie } else if i > 0 { Kind::Manga } else { Kind::Other }
        }
        FileKind::Other => Kind::Other,
    }
}

pub fn title_from_path(p: &Path) -> String {
    let name = if p.is_dir() { p.file_name() } else { p.file_stem() };
    name.and_then(|n| n.to_str()).unwrap_or("제목 없음").replace(['_', '.'], " ").trim().to_string()
}

pub struct Meta {
    pub size: Option<i64>,
    pub mtime: Option<i64>,
}

pub fn stat(p: &Path) -> std::io::Result<Meta> {
    let m = std::fs::metadata(p)?;
    let mtime = m.modified().ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_millis() as i64);
    Ok(Meta { size: if m.is_file() { Some(m.len() as i64) } else { None }, mtime })
}

/// Natural sort key so "page2" < "page10".
pub fn natural_key(s: &str) -> Vec<(u8, u64, String)> {
    let mut out = Vec::new();
    let mut num = String::new();
    let mut txt = String::new();
    for c in s.chars() {
        if c.is_ascii_digit() {
            if !txt.is_empty() { out.push((1, 0, std::mem::take(&mut txt).to_lowercase())); }
            num.push(c);
        } else {
            if !num.is_empty() { out.push((0, num.parse().unwrap_or(u64::MAX), String::new())); num.clear(); }
            txt.push(c);
        }
    }
    if !num.is_empty() { out.push((0, num.parse().unwrap_or(u64::MAX), String::new())); }
    if !txt.is_empty() { out.push((1, 0, txt.to_lowercase())); }
    out
}
