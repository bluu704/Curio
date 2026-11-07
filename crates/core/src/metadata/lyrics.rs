//! Song lyrics, the way the DeskPlayer extension finds them:
//! 1. YouTube Music — the song's "가사" tab (`next` → `MPLY…` browse id → `browse`), timed lines when present;
//!    for a title without a video id, YouTube Music search first.
//! 2. LRCLIB (lrclib.net) — free lyrics database with synced (LRC) lyrics, matched by title + artist.
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use super::{agent, net};
use crate::Result;

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Lyrics {
    pub plain: String,
    /// LRC text ("[01:02.30]line"), empty when the source has no timing
    pub synced: String,
    /// where it came from, shown under the lyrics
    pub source: String,
}

// ---------------------------------------------------------------- matching (ported from the extension)
fn norm(s: &str) -> String {
    let no_paren = Regex::new(r"\(.*?\)|\[.*?\]").unwrap().replace_all(s, "");
    no_paren.chars().filter(|c| c.is_alphanumeric()).flat_map(char::to_lowercase).collect()
}
fn is_cjk(s: &str) -> bool {
    s.chars().any(|c| matches!(c as u32, 0x1100..=0x11FF | 0x3040..=0x30FF | 0x3130..=0x318F | 0x3400..=0x4DBF | 0x4E00..=0x9FFF | 0xAC00..=0xD7AF))
}
/// Names in "A, B & C feat. D" → normalised parts.
fn artist_parts(s: &str) -> Vec<String> {
    let re = Regex::new(r"(?i)\s*(?:[,&/·×•()\[\]、，＆]|\s및\s|\bfeat\.?|\bft\.?|\bwith\b|\bx\b)\s*").unwrap();
    let mut v: Vec<String> = re.split(s).map(norm).filter(|x| x.chars().count() >= 2).collect();
    v.dedup();
    v
}
/// Some(true) same artist · Some(false) different · None can't tell (아이유 ↔ IU).
pub(crate) fn artist_ok(want: &str, got: &str) -> Option<bool> {
    let (a, b, all) = (artist_parts(want), artist_parts(got), norm(got));
    if a.is_empty() || all.is_empty() {
        return None;
    }
    let long = |x: &String| x.chars().count() >= 4;
    if a.iter().any(|x| b.contains(x) || (long(x) && all.contains(x.as_str())) || b.iter().any(|y| long(y) && x.contains(y.as_str()))) {
        return Some(true);
    }
    if a.iter().any(|x| b.iter().any(|y| is_cjk(x) == is_cjk(y))) {
        return Some(false);
    }
    None
}
/// The title plus the text in its brackets: "Bam Yang Gang (밤양갱)" → ["bamyanggang", "밤양갱"].
fn title_forms(s: &str) -> Vec<String> {
    let mut v = vec![norm(s)];
    for c in Regex::new(r"[(\[（「『]([^)\]）」』]+)[)\]）」』]").unwrap().captures_iter(s) {
        v.push(norm(&c[1]));
    }
    v.retain(|x| !x.is_empty());
    v
}
/// Exact title, or one title is a (long enough) part of the other — in either language form.
pub(crate) fn title_ok(want: &str, got: &str) -> bool {
    let long = |x: &str| x.chars().count() >= if is_cjk(x) { 2 } else { 4 };
    let (ws, gs) = (title_forms(want), title_forms(got));
    ws.iter().any(|w| gs.iter().any(|g| w == g || (long(w) && g.contains(w.as_str())) || (long(g) && w.contains(g.as_str()))))
}

// ---------------------------------------------------------------- YouTube Music
fn ytm(path: &str, body: Value) -> Result<Value> {
    let mut b = json!({ "context": { "client": { "clientName": "WEB_REMIX", "clientVersion": "1.20241106.01.00", "hl": "ko", "gl": "KR" } } });
    if let (Some(o), Some(extra)) = (b.as_object_mut(), body.as_object()) {
        o.extend(extra.clone());
    }
    Ok(agent()
        .post(&format!("https://music.youtube.com/youtubei/v1/{path}?prettyPrint=false"))
        .set("Content-Type", "application/json")
        .send_string(&b.to_string())
        .map_err(net)?
        .into_json()?)
}

fn find<'a>(v: &'a Value, key: &str) -> Option<&'a Value> {
    match v {
        Value::Object(m) => m.get(key).or_else(|| m.values().find_map(|x| find(x, key))),
        Value::Array(a) => a.iter().find_map(|x| find(x, key)),
        _ => None,
    }
}
fn runs(v: &Value) -> String {
    v["runs"].as_array().into_iter().flatten().filter_map(|r| r["text"].as_str()).collect()
}
fn lrc_time(ms: u64) -> String {
    let t = ms as f64 / 1000.0;
    format!("[{:02}:{:05.2}]", (t / 60.0).floor() as u64, t % 60.0)
}

/// Lyrics attached to a YouTube Music song (video id).
pub fn ytmusic_lyrics(video_id: &str) -> Result<Option<Lyrics>> {
    let nx = ytm("next", json!({ "videoId": video_id, "isAudioOnly": true }))?;
    let Some(id) = Regex::new(r#""browseId":"(MPLY[^"]+)""#).unwrap().captures(&nx.to_string()).map(|c| c[1].to_string()) else {
        return Ok(None);
    };
    let br = ytm("browse", json!({ "browseId": id }))?;
    let synced = find(&br, "timedLyricsData")
        .and_then(|v| v.as_array())
        .map(|lines| {
            lines.iter()
                .filter_map(|x| Some(format!("{}{}", lrc_time(x["cueRange"]["startTimeMilliseconds"].as_str()?.parse().ok()?), x["lyricLine"].as_str().unwrap_or(""))))
                .collect::<Vec<_>>()
                .join("\n")
        })
        .unwrap_or_default();
    let shelf = find(&br, "musicDescriptionShelfRenderer");
    let plain = shelf.map(|s| runs(&s["description"])).unwrap_or_default();
    if plain.trim().is_empty() && synced.is_empty() {
        return Ok(None);
    }
    let footer = shelf.map(|s| runs(&s["footer"])).unwrap_or_default();
    let src = Regex::new(r"^.*?:\s*").unwrap().replace(&footer, "").to_string();
    Ok(Some(Lyrics {
        plain: if plain.trim().is_empty() { strip_lrc(&synced) } else { plain },
        synced,
        source: if src.is_empty() { "YouTube Music".into() } else { format!("YouTube Music · {src}") },
    }))
}

/// Songs (video ids) on YouTube Music matching title + artist, most certain first.
fn ytmusic_find(title: &str, artist: &str) -> Vec<String> {
    let Ok(res) = ytm("search", json!({ "query": format!("{title} {artist}").trim() })) else { return vec![] };
    let mut out: Vec<(u8, String)> = vec![];
    fn walk(v: &Value, f: &mut dyn FnMut(&Value)) {
        match v {
            Value::Object(m) => {
                if let Some(r) = m.get("musicResponsiveListItemRenderer") {
                    f(r);
                } else {
                    m.values().for_each(|x| walk(x, f));
                }
            }
            Value::Array(a) => a.iter().for_each(|x| walk(x, f)),
            _ => {}
        }
    }
    walk(&res, &mut |r| {
        let s = r.to_string();
        if !s.contains("MUSIC_VIDEO_TYPE_ATV") && !s.contains("MUSIC_VIDEO_TYPE_OMV") {
            return;
        }
        let Some(vid) = r["playlistItemData"]["videoId"].as_str() else { return };
        let col = |i: usize| &r["flexColumns"][i]["musicResponsiveListItemFlexColumnRenderer"]["text"];
        if !title_ok(title, &runs(col(0))) {
            return;
        }
        let by: Vec<&str> = col(1)["runs"].as_array().into_iter().flatten()
            .filter(|x| x["navigationEndpoint"]["browseEndpoint"]["browseId"].as_str().is_some_and(|b| b.starts_with("UC")))
            .filter_map(|x| x["text"].as_str())
            .collect();
        let m = if artist.is_empty() { None } else { artist_ok(artist, &by.join(", ")) };
        if m == Some(false) {
            return;
        }
        let rank = if m == Some(true) { 0 } else { 1 } + if s.contains("MUSIC_VIDEO_TYPE_ATV") { 0 } else { 2 };
        if !out.iter().any(|(_, v)| v == vid) {
            out.push((rank, vid.to_string()));
        }
    });
    out.sort_by_key(|(r, _)| *r);
    out.into_iter().take(4).map(|(_, v)| v).collect()
}

// ---------------------------------------------------------------- LRCLIB
fn strip_lrc(s: &str) -> String {
    let re = Regex::new(r"^\s*(\[[0-9:.]+\]\s*)+").unwrap();
    s.lines().map(|l| re.replace(l, "").to_string()).collect::<Vec<_>>().join("\n")
}

pub fn lrclib(title: &str, artist: &str) -> Result<Option<Lyrics>> {
    let mut best: Option<(u8, Value)> = None;
    for q in [format!("{title} {artist}"), title.to_string()] {
        let hits: Value = agent().get("https://lrclib.net/api/search").query("q", q.trim()).call().map_err(net)?.into_json()?;
        for h in hits.as_array().into_iter().flatten() {
            let (t, a) = (h["trackName"].as_str().unwrap_or(""), h["artistName"].as_str().unwrap_or(""));
            if h["instrumental"].as_bool() == Some(true) || !title_ok(title, t) {
                continue;
            }
            let m = if artist.is_empty() { None } else { artist_ok(artist, a) };
            let rank = match m {
                Some(true) => 0,
                None if title_forms(t).contains(&norm(title)) => 1,
                _ => continue,
            } + if h["syncedLyrics"].is_string() { 0 } else { 1 };
            if best.as_ref().is_none_or(|(r, _)| rank < *r) {
                best = Some((rank, h.clone()));
            }
        }
        if best.as_ref().is_some_and(|(r, _)| *r == 0) {
            break;
        }
    }
    Ok(best.and_then(|(_, h)| {
        let synced = h["syncedLyrics"].as_str().unwrap_or("").to_string();
        let plain = h["plainLyrics"].as_str().map(String::from).filter(|p| !p.trim().is_empty()).unwrap_or_else(|| strip_lrc(&synced));
        (!plain.trim().is_empty()).then(|| Lyrics { plain, synced, source: "LRCLIB".into() })
    }))
}

/// Best lyrics for a song: the video's own YouTube Music lyrics, then the same song found on
/// YouTube Music by title, then LRCLIB.
pub fn find_lyrics(title: &str, artist: &str, video_id: Option<&str>) -> Result<Option<Lyrics>> {
    if let Some(v) = video_id {
        if let Ok(Some(l)) = ytmusic_lyrics(v) {
            return Ok(Some(l));
        }
    }
    for v in ytmusic_find(title, artist) {
        if Some(v.as_str()) == video_id {
            continue;
        }
        if let Ok(Some(l)) = ytmusic_lyrics(&v) {
            return Ok(Some(l));
        }
    }
    lrclib(title, artist)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn matching() {
        assert!(title_ok("밤양갱", "Bam Yang Gang (밤양갱)"));
        assert!(title_ok("アイドル", "YOASOBI「アイドル」 Official Music Video"));
        assert!(title_ok("アイドル", "アイドル"));
        assert!(!title_ok("GO", "WE GO UP"));
        assert_eq!(artist_ok("BIBI", "BIBI"), Some(true));
        assert_eq!(artist_ok("YOASOBI", "YOASOBI, Ayase"), Some(true));
        assert_eq!(artist_ok("BIBI", "Taylor Swift"), Some(false));
        assert_eq!(artist_ok("아이유", "IU"), None);
        assert_eq!(lrc_time(62_300), "[01:02.30]");
        assert_eq!(strip_lrc("[00:01.00]a\n[00:02.50] b"), "a\nb");
    }

    #[test]
    #[ignore = "network"]
    fn live_lyrics() {
        let l = lrclib("Bam Yang Gang", "BIBI").unwrap().expect("lyrics");
        assert!(!l.synced.is_empty() && l.plain.contains('\n'), "{l:?}");
        let l = find_lyrics("アイドル", "YOASOBI", None).unwrap().expect("lyrics");
        assert!(l.plain.len() > 100, "{l:?}");
    }
}
