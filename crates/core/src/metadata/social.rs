//! Links to posts and streaming services: X (Twitter), YouTube community posts,
//! Spotify / SoundCloud / Deezer / Melon / Bugs / Genie / Apple Music / VIBE.
use regex::Regex;
use serde_json::Value;

use super::{agent, more, music, net};
use crate::models::{Candidate, Kind, Person, TagCategory};
use crate::{Error, Result};

const BROWSER_UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

fn artist(name: &str, role: &str) -> Vec<Person> {
    let n = name.trim();
    if n.is_empty() { vec![] } else { vec![Person { name: n.into(), category: TagCategory::Author, role: Some(role.into()) }] }
}

/// First line of a post, without links, cut to a title-sized length.
fn title_from_text(text: &str) -> String {
    let re = Regex::new(r"https?://\S+").unwrap();
    let line = text.lines().map(|l| re.replace_all(l, "").trim().to_string()).find(|l| !l.is_empty()).unwrap_or_default();
    let mut t: String = line.chars().take(60).collect();
    if line.chars().count() > 60 {
        t.push('…');
    }
    t
}

/// Calendar year of a unix timestamp (UTC).
fn year_of(secs: i64) -> i64 {
    // days → civil date (Howard Hinnant's algorithm)
    let z = secs.div_euclid(86_400) + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    yoe + era * 400 + i64::from(m <= 2)
}

// ---------------------------------------------------------------- X (Twitter)
/// (user, status id) from x.com / twitter.com / fxtwitter / vxtwitter / fixupx links.
pub fn tweet_id(url: &str) -> Option<(String, String)> {
    Regex::new(r"(?:^|//|\.)(?:x|twitter|fxtwitter|vxtwitter|fixupx|fixvx)\.com/([A-Za-z0-9_]+)/status(?:es)?/(\d+)")
        .unwrap()
        .captures(url)
        .map(|c| (c[1].to_string(), c[2].to_string()))
}

/// Post text, author and the first photo (or video thumbnail) through the public FxTwitter API.
pub fn tweet(user: &str, id: &str) -> Result<Candidate> {
    let v: Value = agent().get(&format!("https://api.fxtwitter.com/{user}/status/{id}")).call().map_err(net)?.into_json()?;
    let t = &v["tweet"];
    if t.is_null() {
        return Err(Error::NotFound("post not found".into()));
    }
    let text = t["text"].as_str().unwrap_or("").to_string();
    let a = &t["author"];
    let name = a["name"].as_str().unwrap_or("");
    let handle = a["screen_name"].as_str().unwrap_or(user);
    let photos: Vec<String> = t["media"]["photos"].as_array().into_iter().flatten().filter_map(|p| p["url"].as_str().map(String::from)).collect();
    let image = photos.first().cloned()
        .or_else(|| t["media"]["videos"][0]["thumbnail_url"].as_str().map(String::from))
        .or_else(|| t["media"]["mosaic"]["formats"]["jpeg"].as_str().map(String::from));
    let title = title_from_text(&text);
    let mut detail = vec![format!("@{handle}")];
    if photos.len() > 1 {
        detail.push(format!("사진 {}장", photos.len()));
    }
    Ok(Candidate {
        provider: "x".into(),
        id: format!("{handle}/{id}"),
        title: if title.is_empty() { format!("@{handle}의 게시물") } else { title },
        kind: Some(Kind::Illust),
        year: t["created_timestamp"].as_i64().map(year_of),
        cover_url: image,
        summary: Some(text).filter(|x| !x.trim().is_empty()),
        people: artist(if name.is_empty() { handle } else { name }, "Artist"),
        url: Some(t["url"].as_str().map(String::from).unwrap_or_else(|| format!("https://x.com/{handle}/status/{id}"))),
        detail: Some(detail.join(" · ")),
        ..Default::default()
    })
}

// ---------------------------------------------------------------- YouTube community posts
/// Post id from youtube.com/post/<id> or …/community?lb=<id>.
pub fn yt_post_id(url: &str) -> Option<String> {
    Regex::new(r"youtube\.com/(?:post/|(?:channel/[\w-]+/|@[\w.-]+/|c/[\w-]+/)?community\?(?:.*&)?lb=)([\w-]{20,})")
        .unwrap()
        .captures(url)
        .map(|c| c[1].to_string())
}

fn find<'a>(v: &'a Value, key: &str) -> Option<&'a Value> {
    match v {
        Value::Object(m) => m.get(key).or_else(|| m.values().find_map(|x| find(x, key))),
        Value::Array(a) => a.iter().find_map(|x| find(x, key)),
        _ => None,
    }
}

fn runs(v: &Value) -> String {
    v["runs"].as_array().into_iter().flatten().filter_map(|r| r["text"].as_str()).collect::<String>()
}

/// Text, channel and the attached image (full size) of a community post.
pub fn yt_post(id: &str) -> Result<Candidate> {
    let url = format!("https://www.youtube.com/post/{id}");
    let html = agent().get(&url).set("User-Agent", BROWSER_UA).set("Accept-Language", "ko-KR,ko;q=0.9,en;q=0.8").call().map_err(net)?.into_string()?;
    let data = Regex::new(r"(?s)var ytInitialData = (\{.*?\});</script>").unwrap().captures(&html)
        .and_then(|c| serde_json::from_str::<Value>(&c[1]).ok())
        .ok_or_else(|| Error::NotFound("post not found".into()))?;
    let p = find(&data, "backstagePostRenderer").ok_or_else(|| Error::NotFound("post not found".into()))?;
    let text = runs(&p["contentText"]);
    let channel = runs(&p["authorText"]);
    let att = &p["backstageAttachment"];
    let images: Vec<String> = {
        let size = Regex::new(r"=s\d+.*$").unwrap();
        let mut out = vec![];
        let mut walk = vec![att];
        while let Some(v) = walk.pop() {
            match v {
                Value::Object(m) => {
                    if let Some(th) = m.get("backstageImageRenderer").and_then(|b| b["image"]["thumbnails"].as_array()) {
                        if let Some(u) = th.last().and_then(|t| t["url"].as_str()) {
                            // "…=s512-c-fcrop64=…" → uncropped large size
                            out.push(size.replace(u, "=s1600").to_string());
                        }
                    } else {
                        walk.extend(m.values().rev());
                    }
                }
                Value::Array(a) => walk.extend(a.iter().rev()),
                _ => {}
            }
        }
        out
    };
    let video_thumb = find(att, "videoId").and_then(|v| v.as_str()).map(|v| format!("https://i.ytimg.com/vi/{v}/hqdefault.jpg"));
    let title = title_from_text(&text);
    let mut detail = vec![channel.clone()];
    if images.len() > 1 {
        detail.push(format!("이미지 {}장", images.len()));
    }
    Ok(Candidate {
        provider: "youtube-post".into(),
        id: id.into(),
        title: if title.is_empty() { format!("{channel} 게시물") } else { title },
        kind: Some(Kind::Illust),
        cover_url: images.first().cloned().or(video_thumb),
        summary: Some(text).filter(|x| !x.trim().is_empty()),
        people: artist(&channel, "Channel"),
        url: Some(url),
        detail: Some(detail.join(" · ")).filter(|d| !d.is_empty()),
        ..Default::default()
    })
}

// ---------------------------------------------------------------- music services
/// True for links to a song/album on a streaming or music store service.
pub fn is_music_link(url: &str) -> bool {
    Regex::new(r"open\.spotify\.com/|spotify\.link/|soundcloud\.com/|deezer\.(?:com|page\.link)/|melon\.com/|bugs\.co\.kr/|genie\.co\.kr/|music\.apple\.com/|vibe\.naver\.com/|bandcamp\.com/|music\.amazon\.")
        .unwrap()
        .is_match(url)
}

/// Song / album from a music-service link.
pub fn music_link(url: &str) -> Result<Candidate> {
    // Deezer has a full API → genres, year, album art
    if let Some(c) = Regex::new(r"deezer\.com/(?:[a-z]{2}/)?track/(\d+)").unwrap().captures(url) {
        return music::fetch_deezer(&c[1]);
    }
    let oembed = |endpoint: &str| -> Option<Value> {
        agent().get(endpoint).query("url", url).query("format", "json").call().ok()?.into_json().ok()
    };
    if url.contains("spotify.") {
        if let Some(o) = oembed("https://open.spotify.com/oembed") {
            let thumb = o["thumbnail_url"].as_str().map(String::from);
            return Ok(Candidate {
                provider: "spotify".into(),
                id: url.into(),
                title: o["title"].as_str().unwrap_or("").to_string(),
                kind: Some(Kind::Music),
                cover_url: thumb.clone(),
                banner_url: thumb,
                url: Some(url.into()),
                detail: Some("Spotify".into()),
                ..Default::default()
            });
        }
    }
    if url.contains("soundcloud.com") {
        if let Some(o) = oembed("https://soundcloud.com/oembed") {
            let who = o["author_name"].as_str().unwrap_or("").to_string();
            let raw = o["title"].as_str().unwrap_or("");
            let title = raw.strip_suffix(&format!(" by {who}")).unwrap_or(raw).to_string();
            let thumb = o["thumbnail_url"].as_str().map(String::from);
            return Ok(Candidate {
                provider: "soundcloud".into(),
                id: url.into(),
                title,
                kind: Some(Kind::Music),
                cover_url: thumb.clone(),
                banner_url: thumb,
                people: artist(&who, "Artist"),
                url: Some(url.into()),
                detail: Some("SoundCloud".into()),
                ..Default::default()
            });
        }
    }
    // Melon / Bugs / Genie / Apple Music / VIBE / Bandcamp: page preview tags
    let mut c = more::opengraph(url)?;
    c.kind = Some(Kind::Music);
    // "곡 - 가수" (멜론·벅스·지니) → title + artist
    if c.people.is_empty() && Regex::new(r"melon\.com|bugs\.co\.kr|genie\.co\.kr").unwrap().is_match(url) {
        if let Some((song, who)) = c.title.rsplit_once(" - ").or_else(|| c.title.rsplit_once(" / ")) {
            let (song, who) = (song.trim().to_string(), who.trim().to_string());
            c.people = artist(&who, "Artist");
            c.title = song;
        }
    }
    if c.title.is_empty() {
        return Err(Error::NotFound("no title on page".into()));
    }
    Ok(c)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn link_ids() {
        assert_eq!(tweet_id("https://x.com/someone/status/1234567890?s=20"), Some(("someone".into(), "1234567890".into())));
        assert_eq!(tweet_id("https://twitter.com/a_b/status/42"), Some(("a_b".into(), "42".into())));
        assert_eq!(tweet_id("https://fxtwitter.com/a/status/7/photo/1"), Some(("a".into(), "7".into())));
        assert_eq!(tweet_id("https://box.com/a/status/7"), None);
        assert_eq!(yt_post_id("https://www.youtube.com/post/UgkxY7UpcbiXyUkas7oziL3Cx_8hkBLrybz1").as_deref(), Some("UgkxY7UpcbiXyUkas7oziL3Cx_8hkBLrybz1"));
        assert_eq!(yt_post_id("https://youtube.com/channel/UC123/community?lb=UgkxY7UpcbiXyUkas7oziL3Cx_8hkBLrybz1").as_deref(), Some("UgkxY7UpcbiXyUkas7oziL3Cx_8hkBLrybz1"));
        assert!(is_music_link("https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT"));
        assert!(is_music_link("https://www.melon.com/song/detail.htm?songId=1"));
        assert!(!is_music_link("https://www.youtube.com/watch?v=abc"));
        assert_eq!(year_of(1_142_974_214), 2006);
        assert_eq!(year_of(1_704_067_199), 2023);
        assert_eq!(year_of(1_704_067_200), 2024);
        assert_eq!(title_from_text("첫 줄 https://t.co/x\n둘째"), "첫 줄");
    }

    #[test]
    #[ignore = "network"]
    fn live_social() {
        let t = tweet("Twitter", "20").unwrap();
        assert!(t.title.contains("twttr"), "{t:?}");
        let p = yt_post("UgkxOIrm_buePPtJKUmQBL6xGBrcpEX8mNXj").unwrap();
        assert!(p.cover_url.as_deref().unwrap_or("").contains("ggpht"), "{p:?}");
        let s = music_link("https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT").unwrap();
        assert_eq!(s.title, "Never Gonna Give You Up");
        // Melon resets some TLS clients from data-centre IPs; only check the parse when it answers
        if let Ok(m) = music_link("https://www.melon.com/song/detail.htm?songId=36382580") {
            assert_eq!(m.people.first().map(|p| p.name.as_str()), Some("박재정"), "{m:?}");
        }
        let sc = music_link("https://soundcloud.com/forss/flickermood").unwrap();
        assert_eq!(sc.title, "Flickermood");
    }
}
