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
    let thumb = img.thumbnail(THUMB_MAX, THUMB_MAX * 3 / 2).to_rgb8();
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

/// First page of a CBZ/ZIP by natural order. Reads only that one entry.
pub fn first_image_in_zip(path: &Path) -> Result<Option<Vec<u8>>> {
    let mut zip = zip::ZipArchive::new(std::fs::File::open(path)?)?;
    let mut names: Vec<String> = zip
        .file_names()
        .filter(|n| is_image_name(n) && !n.starts_with("__MACOSX"))
        .map(String::from)
        .collect();
    names.sort_by_key(|n| natural_key(n));
    let Some(first) = names.first() else { return Ok(None) };
    let mut buf = Vec::new();
    zip.by_name(first)?.read_to_end(&mut buf)?;
    Ok(Some(buf))
}

/// List pages of an archive (for a future built-in reader).
pub fn zip_pages(path: &Path) -> Result<Vec<String>> {
    let zip = zip::ZipArchive::new(std::fs::File::open(path)?)?;
    let mut names: Vec<String> = zip.file_names().filter(|n| is_image_name(n)).map(String::from).collect();
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
        _ => "image/jpeg",
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
                e if IMAGE_EXT.contains(&e) => {
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
