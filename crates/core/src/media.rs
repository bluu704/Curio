//! Cover extraction + thumbnails. Writes small JPEGs into the cache dir so the
//! gallery never decodes 8K originals or unzips archives while scrolling.

use std::io::Read;
use std::path::{Path, PathBuf};

use crate::models::FileKind;
use crate::scan::{self, natural_key, IMAGE_EXT};
use crate::Error;
use crate::Result;

const THUMB_MAX: u32 = 640;

/// Try to produce a cover thumbnail for `src`. Returns the thumbnail path, or None
/// when the type has no cheap cover (e.g. video — ffmpeg support can be added later).
pub fn make_cover(src: &Path, cache_dir: &Path, key: &str) -> Result<Option<PathBuf>> {
    let out = cache_dir.join("thumbs").join(format!("{key}.jpg"));
    let bytes = if src.is_dir() {
        match first_image_in_dir(src) {
            Some(img) => Some(std::fs::read(img)?),
            None => return Ok(first_video_in_dir(src).and_then(|v| video_frame(&v, &out))),
        }
    } else {
        match scan::file_kind(src) {
            FileKind::Video => return Ok(video_frame(src, &out)),
            _ => match scan::ext_of(src).as_str() {
                "zip" | "cbz" => first_image_in_zip(src)?,
                "ani" => ani_first_frame(&std::fs::read(src)?),
                "ico" | "cur" => Some(cur_as_ico(std::fs::read(src)?)),
                e if IMAGE_EXT.contains(&e) => Some(std::fs::read(src)?),
                _ => None,
            },
        }
    };
    let Some(bytes) = bytes else { return Ok(None) };
    write_thumb(&bytes, &out)?;
    Ok(Some(out))
}

pub fn write_thumb(bytes: &[u8], out: &Path) -> Result<()> {
    let img = image::load_from_memory(bytes)?;
    let thumb = if img.width() < 128 && img.height() < 128 {
        // cursors / icons / pixel art: enlarge with sharp pixels on white (JPEG has no transparency)
        let k = (256 / img.width().max(img.height()).max(1)).max(1);
        let big = image::imageops::resize(&img.to_rgba8(), img.width() * k, img.height() * k, image::imageops::FilterType::Nearest);
        let mut rgb = image::RgbImage::from_pixel(big.width(), big.height(), image::Rgb([255, 255, 255]));
        for (x, y, p) in big.enumerate_pixels() {
            let a = p[3] as u32;
            let mix = |c: u8| ((c as u32 * a + 255 * (255 - a)) / 255) as u8;
            rgb.put_pixel(x, y, image::Rgb([mix(p[0]), mix(p[1]), mix(p[2])]));
        }
        rgb
    } else {
        img.thumbnail(THUMB_MAX, THUMB_MAX * 3 / 2).to_rgb8()
    };
    if let Some(d) = out.parent() {
        std::fs::create_dir_all(d)?;
    }
    thumb.save_with_format(out, image::ImageFormat::Jpeg)?;
    Ok(())
}

fn is_image_name(n: &str) -> bool {
    let n = n.to_ascii_lowercase();
    IMAGE_EXT.iter().any(|e| n.ends_with(&format!(".{e}")))
}

/// A .cur file has the .ico layout with type 2 in its header; decoders want type 1.
fn cur_as_ico(mut b: Vec<u8>) -> Vec<u8> {
    if b.len() > 6 && b[2] == 2 {
        b[2] = 1;
    }
    b
}

/// First frame of a Windows animated cursor (RIFF "ACON" → LIST "fram" → "icon" chunks).
pub fn ani_first_frame(b: &[u8]) -> Option<Vec<u8>> {
    if b.len() < 12 || &b[0..4] != b"RIFF" || &b[8..12] != b"ACON" {
        return None;
    }
    fn walk(b: &[u8], mut o: usize, end: usize) -> Option<Vec<u8>> {
        while o + 8 <= end {
            let id = &b[o..o + 4];
            let size = u32::from_le_bytes(b[o + 4..o + 8].try_into().ok()?) as usize;
            let data = o + 8;
            if data + size > b.len() {
                return None;
            }
            if id == b"LIST" {
                if let Some(f) = walk(b, data + 4, data + size) {
                    return Some(f);
                }
            } else if id == b"icon" {
                return Some(cur_as_ico(b[data..data + size].to_vec()));
            }
            o = data + size + (size & 1);
        }
        None
    }
    walk(b, 12, b.len())
}

/// Image entries of a zip, without macOS metadata ("__MACOSX/…", "._page.webp") or folders.
fn is_zip_page(n: &str) -> bool {
    let base = n.rsplit('/').next().unwrap_or(n);
    !n.ends_with('/') && !n.starts_with("__MACOSX") && !base.starts_with("._") && is_image_name(n)
}

/// First page of a CBZ/ZIP by natural order. Reads only that one entry.
pub fn first_image_in_zip(path: &Path) -> Result<Option<Vec<u8>>> {
    let mut zip = zip::ZipArchive::new(std::fs::File::open(path)?)?;
    let mut names: Vec<String> = zip
        .file_names()
        .filter(|n| is_zip_page(n))
        .map(String::from)
        .collect();
    names.sort_by_key(|n| natural_key(n));
    let Some(first) = names.first() else { return Ok(None) };
    let mut buf = Vec::new();
    zip.by_name(first)?.read_to_end(&mut buf)?;
    Ok(Some(buf))
}

/// Pages of a zip/cbz in natural order (webp, gif, png, jpg… in any sub-folder).
pub fn zip_pages(path: &Path) -> Result<Vec<String>> {
    let zip = zip::ZipArchive::new(std::fs::File::open(path)?)?;
    let mut names: Vec<String> = zip.file_names().filter(|n| is_zip_page(n)).map(String::from).collect();
    names.sort_by_key(|n| natural_key(n));
    Ok(names)
}

fn first_image_in_dir(dir: &Path) -> Option<PathBuf> {
    let mut imgs: Vec<PathBuf> = walkdir::WalkDir::new(dir)
        .max_depth(2)
        .into_iter()
        .flatten()
        .filter(|e| e.file_type().is_file() && is_image_name(&e.file_name().to_string_lossy()))
        .map(|e| e.into_path())
        .take(500)
        .collect();
    imgs.sort_by_key(|p| natural_key(&p.to_string_lossy()));
    imgs.into_iter().next()
}

fn first_video_in_dir(dir: &Path) -> Option<PathBuf> {
    let mut v: Vec<PathBuf> = walkdir::WalkDir::new(dir)
        .max_depth(2)
        .into_iter()
        .flatten()
        .filter(|e| e.file_type().is_file() && scan::file_kind(e.path()) == FileKind::Video)
        .map(|e| e.into_path())
        .collect();
    v.sort_by_key(|p| natural_key(&p.to_string_lossy()));
    v.into_iter().next()
}

/// Grab one frame with ffmpeg (if installed). Seeks to 10% (max 90 s) to skip black intros.
pub fn video_frame(src: &Path, out: &Path) -> Option<PathBuf> {
    use std::process::{Command, Stdio};
    let ffmpeg = which("ffmpeg")?;
    let dur = which("ffprobe")
        .and_then(|p| {
            Command::new(p)
                .args(["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1"])
                .arg(src)
                .output()
                .ok()
        })
        .and_then(|o| String::from_utf8_lossy(&o.stdout).trim().parse::<f64>().ok())
        .unwrap_or(0.0);
    let at = (dur * 0.1).clamp(0.0, 90.0);
    std::fs::create_dir_all(out.parent()?).ok()?;
    let ok = Command::new(ffmpeg)
        .args(["-y", "-v", "error", "-ss", &format!("{at:.2}"), "-i"])
        .arg(src)
        .args(["-frames:v", "1", "-vf", "scale='min(1280,iw)':-2", "-q:v", "3"])
        .arg(out)
        .stdin(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false);
    (ok && out.exists()).then(|| out.to_path_buf())
}

fn which(bin: &str) -> Option<PathBuf> {
    let exe = if cfg!(windows) { format!("{bin}.exe") } else { bin.to_string() };
    std::env::var_os("PATH").and_then(|paths| std::env::split_paths(&paths).map(|d| d.join(&exe)).find(|p| p.is_file()))
}

// ---------------------------------------------------------------- reader

enum Inner {
    Zip(zip::ZipArchive<std::fs::File>),
    Dir(PathBuf),
    Single(PathBuf),
}

/// Random access to the pages of a zip/cbz, an image folder or a single image.
pub struct PageSource {
    pub file_id: String,
    pub names: Vec<String>,
    inner: Inner,
}

pub fn mime_of(name: &str) -> &'static str {
    match name.rsplit('.').next().map(|e| e.to_ascii_lowercase()).as_deref() {
        Some("png") => "image/png",
        Some("webp") => "image/webp",
        Some("gif") => "image/gif",
        Some("avif") => "image/avif",
        Some("bmp") => "image/bmp",
        Some("pdf") => "application/pdf",
        Some("mp4") | Some("m4v") => "video/mp4",
        Some("webm") => "video/webm",
        Some("mkv") => "video/x-matroska",
        Some("mov") => "video/quicktime",
        Some("mp3") => "audio/mpeg",
        Some("m4a") | Some("aac") => "audio/mp4",
        Some("flac") => "audio/flac",
        Some("wav") => "audio/wav",
        Some("ogg") | Some("oga") | Some("opus") => "audio/ogg",
        Some("txt") | Some("log") | Some("srt") => "text/plain; charset=utf-8",
        Some("md") | Some("markdown") => "text/markdown; charset=utf-8",
        Some("json") => "application/json",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("ico") | Some("cur") => "image/x-icon",
        Some("ani") => "application/x-navi-animation",
        _ => "application/octet-stream",
    }
}

impl PageSource {
    pub fn open(file_id: &str, path: &Path) -> Result<Self> {
        let (names, inner) = if path.is_dir() {
            let mut names: Vec<String> = walkdir::WalkDir::new(path)
                .into_iter()
                .flatten()
                .filter(|e| e.file_type().is_file() && is_image_name(&e.file_name().to_string_lossy()))
                .filter_map(|e| e.path().strip_prefix(path).ok().map(|p| p.to_string_lossy().into_owned()))
                .collect();
            names.sort_by_key(|n| natural_key(n));
            (names, Inner::Dir(path.to_path_buf()))
        } else {
            match scan::ext_of(path).as_str() {
                "zip" | "cbz" => {
                    let names = zip_pages(path)?;
                    (names, Inner::Zip(zip::ZipArchive::new(std::fs::File::open(path)?)?))
                }
                e if IMAGE_EXT.contains(&e) || matches!(e, "ani" | "ico" | "cur") => {
                    let n = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
                    (vec![n], Inner::Single(path.to_path_buf()))
                }
                e => return Err(Error::Unsupported(format!("reader: .{e}"))),
            }
        };
        Ok(Self { file_id: file_id.into(), names, inner })
    }

    pub fn read(&mut self, index: usize) -> Result<(Vec<u8>, &'static str)> {
        let name = self.names.get(index).ok_or_else(|| Error::NotFound(format!("page {index}")))?.clone();
        let mut buf = Vec::new();
        match &mut self.inner {
            Inner::Zip(z) => {
                z.by_name(&name)?.read_to_end(&mut buf)?;
            }
            Inner::Dir(d) => buf = std::fs::read(d.join(&name))?,
            Inner::Single(p) => buf = std::fs::read(p)?,
        }
        Ok((buf, mime_of(&name)))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    /// A 1×1 WebP (lossless) — enough to check decoding and page listing.
    const WEBP: &[u8] = &[
        0x52, 0x49, 0x46, 0x46, 0x1a, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x4c, 0x0d, 0x00, 0x00, 0x00,
        0x2f, 0x00, 0x00, 0x00, 0x10, 0x07, 0x10, 0x11, 0x11, 0x88, 0x88, 0xfe, 0x07, 0x00,
    ];

    #[test]
    fn zip_of_webp_pages() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("book.zip");
        let mut z = zip::ZipWriter::new(std::fs::File::create(&path).unwrap());
        let opt = zip::write::SimpleFileOptions::default();
        for n in ["book/", "book/p10.webp", "book/p2.WEBP", "book/p1.webp", "__MACOSX/book/._p1.webp", "book/._p3.webp", "book/info.txt"] {
            if n.ends_with('/') { z.add_directory(n, opt).unwrap(); continue; }
            z.start_file(n, opt).unwrap();
            z.write_all(if n.ends_with(".txt") { b"x" } else { WEBP }).unwrap();
        }
        z.finish().unwrap();
        assert_eq!(zip_pages(&path).unwrap(), ["book/p1.webp", "book/p2.WEBP", "book/p10.webp"]);
        let mut src = PageSource::open("f", &path).unwrap();
        let (bytes, mime) = src.read(1).unwrap();
        assert_eq!(mime, "image/webp");
        assert!(image::load_from_memory(&bytes).is_ok(), "webp decodes");
        let cover = make_cover(&path, dir.path(), "k").unwrap();
        assert!(cover.is_some_and(|p| p.exists()));
    }

    #[test]
    fn animated_cursor_cover_and_page() {
        let dir = tempfile::tempdir().unwrap();
        let src = Path::new(env!("CARGO_MANIFEST_DIR")).join("testdata/spin.ani");
        let frame = ani_first_frame(&std::fs::read(&src).unwrap()).expect("frame");
        assert_eq!(frame[2], 1, ".cur header patched to .ico");
        assert_eq!(image::load_from_memory(&frame).unwrap().width(), 32);
        let cover = make_cover(&src, dir.path(), "ani").unwrap().expect("cover");
        assert_eq!(image::open(cover).unwrap().width(), 256, "small cursor enlarged");
        let mut p = PageSource::open("f", &src).unwrap();
        assert_eq!(p.read(0).unwrap().1, "application/x-navi-animation");
        assert_eq!(scan::file_kind(&src), FileKind::Image);
    }
}
