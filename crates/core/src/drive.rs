//! Google Drive helpers that do not need the sync engine: folder colours.
//!
//! Drive folders take one of 24 colours (`folderColorRgb`; any other value is snapped to the nearest).
//! Curio folders use named presets ("red", "teal"…) or any "#rrggbb". These functions translate both
//! ways so a Curio folder and its linked Drive folder show the same colour, and talk to the Drive API
//! with an OAuth access token (obtained by the login flow).
use serde_json::{json, Value};

use crate::metadata::{agent, net};
use crate::{Error, Result};

/// Drive's folder colour palette (About.folderColorPalette).
pub const DRIVE_PALETTE: [&str; 24] = [
    "#ac725e", "#d06b64", "#f83a22", "#fa573c", "#ff7537", "#ffad46", "#42d692", "#16a765",
    "#7bd148", "#b3dc6c", "#fbe983", "#fad165", "#92e1c0", "#9fe1e7", "#9fc6e7", "#4986e7",
    "#9a9cff", "#b99aff", "#8f8f8f", "#cabdbf", "#cca6ac", "#f691b2", "#cd74e6", "#a47ae2",
];
/// Drive's colour for folders that were never coloured.
pub const DRIVE_DEFAULT: &str = "#8f8f8f";

/// Curio's named folder colours (same values as the app's palette).
const CURIO_PRESETS: [(&str, &str); 9] = [
    ("red", "#ef4444"), ("amber", "#eab308"), ("green", "#22c55e"), ("teal", "#14b8a6"), ("blue", "#3b82f6"),
    ("violet", "#8b5cf6"), ("pink", "#ec4899"), ("slate", "#78716c"), ("orange", "#f97316"),
];
/// Fixed Drive colour for each Curio preset (distinct, so presets survive a round trip).
const PRESET_TO_DRIVE: [(&str, &str); 9] = [
    ("red", "#f83a22"), ("orange", "#ff7537"), ("amber", "#fad165"), ("green", "#16a765"), ("teal", "#92e1c0"),
    ("blue", "#4986e7"), ("violet", "#a47ae2"), ("pink", "#f691b2"), ("slate", "#cabdbf"),
];
/// Colour of a Curio folder without a colour.
const CURIO_DEFAULT: &str = "#f59e0b";

fn rgb(hex: &str) -> Option<(f64, f64, f64)> {
    let h = hex.trim().trim_start_matches('#');
    if h.len() != 6 {
        return None;
    }
    let n = u32::from_str_radix(h, 16).ok()?;
    Some((((n >> 16) & 255) as f64, ((n >> 8) & 255) as f64, (n & 255) as f64))
}

/// Perceptual-ish distance ("redmean"), good enough to pick the closest palette colour.
fn dist(a: (f64, f64, f64), b: (f64, f64, f64)) -> f64 {
    let rm = (a.0 + b.0) / 2.0;
    let (dr, dg, db) = (a.0 - b.0, a.1 - b.1, a.2 - b.2);
    ((2.0 + rm / 256.0) * dr * dr + 4.0 * dg * dg + (2.0 + (255.0 - rm) / 256.0) * db * db).sqrt()
}

fn nearest<'a>(hex: &str, among: impl Iterator<Item = &'a str>) -> Option<&'a str> {
    let c = rgb(hex)?;
    among.filter_map(|p| rgb(p).map(|x| (p, dist(c, x)))).min_by(|a, b| a.1.total_cmp(&b.1)).map(|(p, _)| p)
}

/// "#rrggbb" of a Curio folder colour value (preset name, hex, or none).
pub fn curio_hex(color: Option<&str>) -> String {
    match color {
        None | Some("") => CURIO_DEFAULT.into(),
        Some(c) => CURIO_PRESETS.iter().find(|(n, _)| *n == c).map(|(_, h)| h.to_string()).unwrap_or_else(|| c.to_lowercase()),
    }
}

/// Drive colour for a Curio folder colour.
pub fn to_drive(color: Option<&str>) -> &'static str {
    if color.is_none_or(str::is_empty) {
        return DRIVE_DEFAULT;
    }
    if let Some((_, d)) = PRESET_TO_DRIVE.iter().find(|(n, _)| Some(*n) == color) {
        return d;
    }
    nearest(&curio_hex(color), DRIVE_PALETTE.iter().copied()).unwrap_or(DRIVE_DEFAULT)
}

/// Curio colour for a Drive folder colour: the closest preset name, or None for Drive's grey default.
/// `current` is kept when it already maps to the same Drive colour, so custom colours survive a round trip.
pub fn from_drive(drive: &str, current: Option<&str>) -> Option<String> {
    let d = drive.to_lowercase();
    if d == DRIVE_DEFAULT || rgb(&d).is_none() {
        return None;
    }
    if current.is_some() && to_drive(current) == nearest(&d, DRIVE_PALETTE.iter().copied()).unwrap_or("") {
        return current.map(String::from);
    }
    // a preset's own Drive colour → that preset; any other Drive colour → the closest preset
    let snapped = nearest(&d, DRIVE_PALETTE.iter().copied()).unwrap_or(DRIVE_DEFAULT);
    if let Some((n, _)) = PRESET_TO_DRIVE.iter().find(|(_, x)| *x == snapped) {
        return Some(n.to_string());
    }
    nearest(&d, CURIO_PRESETS.iter().map(|(_, h)| *h))
        .and_then(|h| CURIO_PRESETS.iter().find(|(_, x)| *x == h))
        .map(|(n, _)| n.to_string())
}

// ---------------------------------------------------------------- Drive API

const API: &str = "https://www.googleapis.com/drive/v3/files";

/// Colour of a Drive folder (as Drive reports it).
pub fn folder_color(token: &str, folder_id: &str) -> Result<String> {
    let v: Value = agent()
        .get(&format!("{API}/{folder_id}"))
        .query("fields", "folderColorRgb,mimeType")
        .query("supportsAllDrives", "true")
        .set("Authorization", &format!("Bearer {token}"))
        .call()
        .map_err(net)?
        .into_json()?;
    if v["mimeType"].as_str() != Some("application/vnd.google-apps.folder") {
        return Err(Error::Invalid("not a Drive folder".into()));
    }
    Ok(v["folderColorRgb"].as_str().unwrap_or(DRIVE_DEFAULT).to_string())
}

/// Give a Drive folder the colour of a Curio folder. Returns the colour Drive stored.
pub fn set_folder_color(token: &str, folder_id: &str, curio_color: Option<&str>) -> Result<String> {
    let v: Value = agent()
        .request("PATCH", &format!("{API}/{folder_id}"))
        .query("fields", "folderColorRgb")
        .query("supportsAllDrives", "true")
        .set("Authorization", &format!("Bearer {token}"))
        .set("Content-Type", "application/json")
        .send_string(&json!({ "folderColorRgb": to_drive(curio_color) }).to_string())
        .map_err(net)?
        .into_json()?;
    Ok(v["folderColorRgb"].as_str().unwrap_or_default().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn colour_mapping() {
        assert_eq!(to_drive(None), DRIVE_DEFAULT);
        assert_eq!(to_drive(Some("red")), "#f83a22");
        assert_eq!(to_drive(Some("blue")), "#4986e7");
        assert_eq!(to_drive(Some("green")), "#16a765");
        assert_eq!(to_drive(Some("#0ea5e9")), "#4986e7");
        // every preset survives a round trip through Drive
        for (name, _) in CURIO_PRESETS {
            assert_eq!(from_drive(to_drive(Some(name)), None).as_deref(), Some(name), "{name} → {}", to_drive(Some(name)));
        }
        // a custom colour is kept when Drive still shows "its" colour, replaced when Drive was changed
        assert_eq!(from_drive("#4986e7", Some("#0ea5e9")).as_deref(), Some("#0ea5e9"));
        assert_eq!(from_drive("#f83a22", Some("#0ea5e9")).as_deref(), Some("red"));
        assert_eq!(from_drive(DRIVE_DEFAULT, Some("red")), None);
    }
}
