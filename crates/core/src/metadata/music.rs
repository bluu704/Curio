use serde_json::Value;

use super::{agent, first_ok, net, title_matches};
use crate::models::{Candidate, Kind, Person, TagCategory};
use crate::{Error, Result};

/// Extract the 11-char video id from any YouTube / YouTube Music URL (or a bare id).
pub fn youtube_id(s: &str) -> Option<String> {
    let re = regex::Regex::new(r"(?:youtube\.com/(?:watch\?(?:.*&)?v=|shorts/|embed/|live/)|youtu\.be/)([A-Za-z0-9_-]{11})").unwrap();
    re.captures(s).map(|c| c[1].to_string())
}

/// "YOASOBI「アイドル」 Official Music Video" → ("アイドル"), "Song (Official MV)" → "Song".
fn clean_title(t: &str, artist: &str) -> String {
    for (open, close) in [('「', '」'), ('『', '』'), ('“', '”')] {
        if let (Some(a), Some(b)) = (t.find(open), t.rfind(close)) {
            if b > a {
                return t[a + open.len_utf8()..b].trim().to_string();
            }
        }
    }
    let re = regex::Regex::new(r"(?i)\s*[\(\[【].*?(official|mv|m/v|music video|lyric|audio|visualizer|live).*?[\)\]】]").unwrap();
    let mut s = re.replace_all(t, "").to_string();
    let re2 = regex::Regex::new(r"(?i)\s*(official\s*(music\s*)?video|official\s*mv|m/v|mv)\s*$").unwrap();
    s = re2.replace_all(&s, "").to_string();
    // "Artist - Song" → "Song"
    if let Some((a, b)) = s.split_once(" - ") {
        if title_matches(a, artist) {
            s = b.to_string();
        }
    }
    s.trim().to_string()
}

/// A cover video's title, read the way people write them:
/// "Surges (Orangestar)ㅣ아카네 리제(Akane Lize) 【COVER】" → Surges, by Orangestar
/// "로스트원의 호곡 [ロストワンの号哭 / Neru]ㅣ…【COVER】" → 로스트원의 호곡 / ロストワンの号哭, by Neru
/// "『Surges / Orangestar (feat.夏背＆ルワン)』を歌ってみた。【…】" → Surges, by Orangestar
#[derive(Debug, Default, PartialEq)]
pub struct Cover { pub title: String, pub alts: Vec<String>, pub artists: Vec<String> }

/// `s` split at the first `sep` that is not inside brackets.
fn split_outside_brackets<'a>(s: &'a str, sep: &str) -> Option<(&'a str, &'a str)> {
    let mut depth = 0i32;
    for (i, ch) in s.char_indices() {
        match ch {
            '(' | '[' | '（' | '【' | '「' | '『' => depth += 1,
            ')' | ']' | '）' | '】' | '」' | '』' => depth -= 1,
            _ if depth == 0 && s[i..].starts_with(sep) => return Some((&s[..i], &s[i + sep.len()..])),
            _ => {}
        }
    }
    None
}

pub fn parse_cover(raw: &str, singer: &str) -> Option<Cover> {
    let re_cover = regex::Regex::new(r"(?i)cover|커버|歌ってみた|唄ってみた|불러\s*(보았|봤|봄)|翻唱").unwrap();
    if !re_cover.is_match(raw) {
        return None;
    }
    let tag = regex::Regex::new(r"(?i)[【\[(（][^】\])）]*(cover|커버|歌ってみた|唄ってみた|mv|ver\.?|full|short|live|official)[^】\])）]*[】\])）]").unwrap();
    let feat = regex::Regex::new(r"(?i)\s*[(（]?\s*(?:feat\.|ft\.|feat\s|ft\s|with\s)[^)）]*[)）]?").unwrap();
    // 『…』「…」 hold the song when present
    let core = regex::Regex::new(r"[『「]([^』」]+)[』」]").unwrap().captures(raw).map(|c| c[1].to_string()).unwrap_or_else(|| {
        let singer_n = super::lyrics::norm_pub(singer);
        raw.split(['ㅣ', '|', '｜'])
            .map(|p| tag.replace_all(p, "").trim().to_string())
            .find(|p| {
                let n = super::lyrics::norm_pub(p);
                !n.is_empty() && !re_cover.is_match(p) && !(singer_n.len() >= 2 && (n.contains(&singer_n) || singer_n.contains(&n)))
            })
            .unwrap_or_default()
    });
    let core = tag.replace_all(&core, "");
    let core = re_cover.replace_all(&core, "");
    // "Title / Artist" outside brackets
    let (title_part, mut artists): (String, Vec<String>) = match split_outside_brackets(&core, " / ") {
        Some((t, a)) => (t.to_string(), vec![feat.replace_all(a, "").trim().to_string()]),
        None => (core.to_string(), vec![]),
    };
    let mut alts = vec![];
    let feat_only = regex::Regex::new(r"(?i)^(feat\.?|ft\.?|with)\b").unwrap();
    for c in regex::Regex::new(r"[(\[（]([^)\]）]+)[)\]）]").unwrap().captures_iter(&title_part) {
        let inner = c[1].trim();
        if feat_only.is_match(inner) {
            continue;
        }
        match inner.split_once(" / ").or_else(|| inner.split_once('/')) {
            Some((t, a)) => { alts.push(t.trim().to_string()); artists.push(feat.replace_all(a, "").trim().to_string()); }
            // one word in brackets: the original title or the original singer — both are tried
            None => { alts.push(inner.to_string()); artists.push(inner.to_string()); }
        }
    }
    let title = regex::Regex::new(r"[(\[（][^)\]）]*[)\]）]").unwrap().replace_all(&title_part, "");
    let title = feat.replace_all(&title, "").trim().trim_matches(|c: char| c == '-' || c == '·' || c.is_whitespace()).to_string();
    if title.is_empty() {
        return None;
    }
    artists.retain(|a| !a.is_empty() && !title_matches(a, singer));
    Some(Cover { title, alts, artists })
}

fn deezer_track(v: &Value) -> Candidate {
    let album = &v["album"];
    let artist = v["artist"]["name"].as_str().unwrap_or("").to_string();
    let mut people = vec![];
    if !artist.is_empty() {
        people.push(Person { name: artist, category: TagCategory::Author, role: Some("Artist".into()) });
    }
    Candidate {
        provider: "deezer".into(),
        id: v["id"].as_i64().unwrap_or(0).to_string(),
        title: v["title"].as_str().unwrap_or("").to_string(),
        kind: Some(Kind::Music),
        cover_url: album["cover_xl"].as_str().map(String::from),
        series: album["title"].as_str().map(String::from),
        url: v["link"].as_str().map(String::from),
        people,
        extra: super::more::extras([("album", album["title"].as_str().map(String::from)), ("duration", v["duration"].as_i64().map(mmss))]),
        ..Default::default()
    }
}

fn mmss(secs: i64) -> String {
    format!("{}:{:02}", secs / 60, secs % 60)
}

/// What YouTube Music itself says about a track: its queue entry has the artist, album, year and length
/// (album / year only for songs, not for music videos).
#[derive(Default, Debug)]
pub struct YtmTrack { pub title: Option<String>, pub artist: Option<String>, pub album: Option<String>, pub year: Option<i64>, pub length: Option<String> }

pub fn ytm_track(vid: &str) -> Option<YtmTrack> {
    let body = serde_json::json!({
        "context": { "client": { "clientName": "WEB_REMIX", "clientVersion": "1.20241106.01.00", "hl": "ko", "gl": "KR" } },
        "videoId": vid, "isAudioOnly": true,
    });
    let v: Value = agent().post("https://music.youtube.com/youtubei/v1/next?prettyPrint=false")
        .set("Origin", "https://music.youtube.com")
        .set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36")
        .send_json(body).ok()?.into_json().ok()?;
    fn find<'a>(v: &'a Value, vid: &str) -> Option<&'a Value> {
        match v {
            Value::Object(m) => {
                if let Some(r) = m.get("playlistPanelVideoRenderer") {
                    if r["videoId"].as_str() == Some(vid) { return Some(r); }
                }
                m.values().find_map(|x| find(x, vid))
            }
            Value::Array(a) => a.iter().find_map(|x| find(x, vid)),
            _ => None,
        }
    }
    let r = find(&v, vid)?;
    let runs = r["longBylineText"]["runs"].as_array().cloned().unwrap_or_default();
    let page = |x: &Value| x["navigationEndpoint"]["browseEndpoint"]["browseEndpointContextSupportedConfigs"]["browseEndpointContextMusicConfig"]["pageType"].as_str().unwrap_or("").to_string();
    let text = |x: &Value| x["text"].as_str().unwrap_or("").trim().to_string();
    let artists: Vec<String> = runs.iter().filter(|x| page(x) == "MUSIC_PAGE_TYPE_ARTIST").map(text).collect();
    Some(YtmTrack {
        title: r["title"]["runs"][0]["text"].as_str().map(String::from),
        artist: (!artists.is_empty()).then(|| artists.join(", ")),
        album: runs.iter().find(|x| page(x) == "MUSIC_PAGE_TYPE_ALBUM").map(text),
        year: runs.iter().map(text).find(|t| t.len() == 4 && t.chars().all(|c| c.is_ascii_digit())).and_then(|t| t.parse().ok()),
        length: r["lengthText"]["runs"][0]["text"].as_str().map(String::from),
    })
}

/// Apple Music catalogue (no key): album, first release year, genre and square artwork of a song.
#[derive(Default, Debug)]
pub struct ItunesHit { pub album: String, pub year: Option<i64>, pub genre: Option<String>, pub length: Option<String>, pub artwork: Option<String> }

/// `also` = other spellings of the title (e.g. the full YouTube title "IU 'Through the Night (밤편지)'").
pub fn itunes(artist: &str, song: &str, also: &[&str]) -> Option<ItunesHit> {
    let mut best: Option<(String, Value)> = None; // (release date, hit)
    for country in ["KR", "JP", "US"] {
        let Ok(r) = agent().get("https://itunes.apple.com/search").query("term", &format!("{artist} {song}")).query("entity", "song")
            .query("limit", "15").query("country", country).call() else { continue };
        let Ok(v) = r.into_json::<Value>() else { continue };
        for h in v["results"].as_array().into_iter().flatten() {
            let (t, a) = (h["trackName"].as_str().unwrap_or(""), h["artistName"].as_str().unwrap_or(""));
            let titled = title_matches(t, song) || also.iter().any(|x| title_matches(t, x));
            if !titled || !(artist.is_empty() || title_matches(a, artist) || artist.split([',', '/', '&']).any(|x| title_matches(a, x.trim()))) {
                continue;
            }
            let date = h["releaseDate"].as_str().unwrap_or("9999").chars().take(10).collect::<String>();
            // the first release wins; for the same day an album beats a single
            let single = |x: &Value| x["collectionName"].as_str().is_some_and(|c| c.ends_with(" - Single") || c.ends_with(" - EP"));
            if best.as_ref().is_none_or(|(d, b)| date < *d || (date == *d && single(b) && !single(h))) {
                best = Some((date, h.clone()));
            }
        }
        if best.is_some() {
            break;
        }
    }
    let (date, h) = best?;
    Some(ItunesHit {
        album: h["collectionName"].as_str().unwrap_or("").trim_end_matches(" - Single").trim_end_matches(" - EP").to_string(),
        year: date.get(..4).and_then(|y| y.parse().ok()),
        genre: h["primaryGenreName"].as_str().map(String::from),
        length: h["trackTimeMillis"].as_i64().map(|ms| mmss(ms / 1000)),
        artwork: h["artworkUrl100"].as_str().map(|u| u.replace("100x100bb", "1000x1000bb")),
    })
}

fn deezer_album_details(c: &mut Candidate, album_id: i64) {
    if let Ok(r) = agent().get(&format!("https://api.deezer.com/album/{album_id}")).call() {
        if let Ok(a) = r.into_json::<Value>() {
            c.year = a["release_date"].as_str().and_then(|d| d.get(..4)).and_then(|y| y.parse().ok());
            c.genres = a["genres"]["data"].as_array().into_iter().flatten().filter_map(|g| g["name"].as_str().map(String::from)).collect();
        }
    }
}

pub fn search(q: &str) -> Result<Vec<Candidate>> {
    let v: Value = agent().get("https://api.deezer.com/search").query("q", q).query("limit", "8").call().map_err(net)?.into_json()?;
    Ok(v["data"].as_array().into_iter().flatten().map(deezer_track).collect())
}

pub fn fetch_deezer(id: &str) -> Result<Candidate> {
    let v: Value = agent().get(&format!("https://api.deezer.com/track/{id}")).call().map_err(net)?.into_json()?;
    if v.get("error").is_some() {
        return Err(Error::NotFound(format!("deezer track {id}")));
    }
    let mut c = deezer_track(&v);
    if let Some(aid) = v["album"]["id"].as_i64() {
        deezer_album_details(&mut c, aid);
    }
    Ok(c)
}

/// YouTube / YouTube Music link → title + channel via oEmbed, then album art + year via Deezer.
pub fn from_youtube(input: &str) -> Result<Candidate> {
    let vid = youtube_id(input).or_else(|| (input.len() == 11).then(|| input.to_string())).ok_or_else(|| Error::Invalid("not a YouTube link".into()))?;
    let watch = format!("https://www.youtube.com/watch?v={vid}");
    // oEmbed; videos that refuse embedding answer 404 there → YouTube Music's own title / artist instead
    let o: Value = match agent().get("https://www.youtube.com/oembed").query("url", &watch).query("format", "json").call() {
        Ok(r) => r.into_json()?,
        Err(e) => match ytm_track(&vid) {
            Some(t) if t.title.is_some() => serde_json::json!({ "title": t.title, "author_name": t.artist.unwrap_or_default() }),
            _ => return Err(net(e)),
        },
    };
    let raw_title = o["title"].as_str().unwrap_or("").to_string();
    let mut channel = o["author_name"].as_str().unwrap_or("").trim_end_matches(" - Topic").trim().to_string();
    let yt_channel = channel.clone(); // YouTube's own spelling (YouTube Music localises artist names)
    let cover = parse_cover(&raw_title, &channel);
    let mut song = cover.as_ref().map(|c| c.title.clone()).unwrap_or_else(|| clean_title(&raw_title, &channel));
    // YouTube Music's own facts (clean song title, artists, album, year, length)
    let ytm = ytm_track(&vid).unwrap_or_default();
    if let Some(t) = ytm.title.as_ref().filter(|t| !t.is_empty() && ytm.album.is_some()) { song = t.clone(); }
    if let Some(a) = ytm.artist.as_ref().filter(|a| !a.is_empty()) { channel = a.clone(); }

    let thumb = first_ok(&[
        format!("https://i.ytimg.com/vi/{vid}/maxresdefault.jpg"),
        format!("https://i.ytimg.com/vi/{vid}/sddefault.jpg"),
    ])
    .unwrap_or_else(|| format!("https://i.ytimg.com/vi/{vid}/hqdefault.jpg"));

    let mut c = Candidate {
        provider: "youtube".into(),
        id: vid.clone(),
        title: song.clone(),
        alt_titles: if raw_title != song { vec![raw_title.clone()] } else { vec![] },
        kind: Some(Kind::Music),
        cover_url: Some(thumb.clone()),
        banner_url: Some(thumb),
        // a song links to YouTube Music (a video stays a YouTube link, see `video`)
        url: Some(format!("https://music.youtube.com/watch?v={vid}")),
        people: channel.split(", ").filter(|n| !n.trim().is_empty()).map(|n| Person { name: n.trim().to_string(), category: TagCategory::Author, role: Some("Artist".into()) }).collect(),
        ..Default::default()
    };

    c.series = ytm.album.clone();
    c.year = ytm.year;
    let mut length = ytm.length.clone();

    // Apple Music: album / first release year / genre / square cover when YouTube Music has none (music videos)
    // YouTube's spelling first (Apple Music rarely knows YouTube Music's localised artist names)
    let also = [raw_title.as_str()];
    // a cover is the singer's own take: no album / release of the original
    let hit = if cover.is_some() { None } else { itunes(&yt_channel, &song, &also).or_else(|| (yt_channel != channel).then(|| itunes(&channel, &song, &also)).flatten()) };
    if let Some(h) = hit {
        if c.series.is_none() && !h.album.is_empty() { c.series = Some(h.album.clone()); }
        c.year = c.year.or(h.year);
        length = length.or(h.length);
        if let Some(g) = h.genre { c.genres.push(g); }
        if let Some(a) = h.artwork { c.cover_url = Some(a); } // square album art; the video still is the banner
    } else if cover.is_some() {
        // nothing more to look up for a cover
    } else if let Ok(hits) = search(&format!("{channel} {song}")) {
        // Deezer as a last resort, where both artist and title agree
        let best = hits.into_iter().find(|h| {
            title_matches(&h.title, &song) && h.people.first().map(|p| title_matches(&p.name, &channel)).unwrap_or(false)
        });
        if let Some(h) = best {
            c.cover_url = h.cover_url.or(c.cover_url);
            c.series = c.series.or(h.series);
            length = length.or_else(|| h.extra.get("duration").cloned());
            if let Ok(full) = fetch_deezer(&h.id) {
                c.year = c.year.or(full.year);
                c.genres = full.genres;
            }
        }
    }
    c.extra = super::more::extras([
        ("album", c.series.clone()), ("duration", length), ("release", c.year.map(|y| y.to_string())),
        // a cover: the original artist and the title's other spellings (for lyrics)
        ("original_artist", cover.as_ref().map(|x| x.artists.join(", "))),
        ("alt_titles", cover.as_ref().map(|x| x.alts.join(" | "))),
    ]);
    if let Some(cv) = &cover {
        for a in &cv.alts {
            if !c.alt_titles.contains(a) { c.alt_titles.push(a.clone()); }
        }
        // "(…)" may be the original title or its singer: shown as written
        let mut parts = vec!["커버".to_string()];
        for x in cv.alts.iter().chain(&cv.artists) {
            if !parts.contains(x) { parts.push(x.clone()); }
        }
        c.detail = Some(parts.join(" · "));
    }
    Ok(c)
}


/// YouTube search without an API key: read video ids from the results page, then oEmbed each.
pub fn search_youtube(q: &str, music: bool) -> Result<Vec<Candidate>> {
    let html = agent()
        .get("https://www.youtube.com/results")
        .query("search_query", q)
        .set("Accept-Language", "ko-KR,ko;q=0.9,en;q=0.8")
        .call()
        .map_err(net)?
        .into_string()?;
    let re = regex::Regex::new(r#""videoId":"([A-Za-z0-9_-]{11})""#).unwrap();
    let mut ids: Vec<String> = vec![];
    for c in re.captures_iter(&html) {
        if !ids.contains(&c[1].to_string()) {
            ids.push(c[1].to_string());
        }
        if ids.len() == 4 {
            break;
        }
    }
    Ok(std::thread::scope(|sc| {
        let hs: Vec<_> = ids
            .iter()
            .map(|id| sc.spawn(move || if music { from_youtube(id) } else { video(id) }))
            .collect();
        hs.into_iter().filter_map(|h| h.join().ok()?.ok()).collect()
    }))
}

/// Plain video (not a song): title, channel and the largest thumbnail.
pub fn video(id_or_url: &str) -> Result<Candidate> {
    let vid = youtube_id(id_or_url).or_else(|| (id_or_url.len() == 11).then(|| id_or_url.to_string())).ok_or_else(|| Error::Invalid("not a YouTube link".into()))?;
    let watch = format!("https://www.youtube.com/watch?v={vid}");
    let o: Value = agent().get("https://www.youtube.com/oembed").query("url", &watch).query("format", "json").call().map_err(net)?.into_json()?;
    let thumb = first_ok(&[format!("https://i.ytimg.com/vi/{vid}/maxresdefault.jpg"), format!("https://i.ytimg.com/vi/{vid}/sddefault.jpg")])
        .unwrap_or_else(|| format!("https://i.ytimg.com/vi/{vid}/hqdefault.jpg"));
    let channel = o["author_name"].as_str().unwrap_or("").to_string();
    Ok(Candidate {
        provider: "youtube-video".into(),
        id: vid,
        title: o["title"].as_str().unwrap_or("").to_string(),
        cover_url: Some(thumb.clone()),
        banner_url: Some(thumb),
        url: Some(watch),
        people: if channel.is_empty() { vec![] } else { vec![Person { name: channel, category: TagCategory::Author, role: Some("Channel".into()) }] },
        ..Default::default()
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn ids_and_titles() {
        assert_eq!(youtube_id("https://music.youtube.com/watch?v=ZRtdQ81jPUQ&si=x").as_deref(), Some("ZRtdQ81jPUQ"));
        assert_eq!(youtube_id("https://youtu.be/dQw4w9WgXcQ?t=1").as_deref(), Some("dQw4w9WgXcQ"));
        assert_eq!(youtube_id("https://www.youtube.com/watch?list=PL1&v=dQw4w9WgXcQ").as_deref(), Some("dQw4w9WgXcQ"));
        assert_eq!(clean_title("YOASOBI「アイドル」 Official Music Video", "YOASOBI"), "アイドル");
        assert_eq!(clean_title("IU - Love wins all (Official MV)", "IU"), "Love wins all");
        assert_eq!(clean_title("Ditto", "NewJeans"), "Ditto");
    }
}

#[cfg(test)]
mod cover_titles {
    use super::parse_cover;
    #[test]
    fn covers() {
        let c = parse_cover("Surges (Orangestar)ㅣ아카네 리제(Akane Lize) 【COVER】", "아카네 리제 AKANE LIZE").unwrap();
        assert_eq!((c.title.as_str(), c.artists.contains(&"Orangestar".to_string())), ("Surges", true));
        let c = parse_cover("로스트원의 호곡 [ロストワンの号哭 / Neru]ㅣ아카네 리제(Akane Lize) 【COVER】", "아카네 리제 AKANE LIZE").unwrap();
        assert_eq!((c.title.as_str(), c.alts[0].as_str(), c.artists[0].as_str()), ("로스트원의 호곡", "ロストワンの号哭", "Neru"));
        let c = parse_cover("『Surges / Orangestar (feat.夏背＆ルワン)』を死に物狂いで歌ってみた。【虹色侍 ずま】", "虹色侍").unwrap();
        assert_eq!((c.title.as_str(), c.artists[0].as_str()), ("Surges", "Orangestar"));
        let c = parse_cover("내일의 밤하늘 초계반(アスノヨゾラ哨戒班)ㅣ아카네 리제(Akane Lize) 【COVER】", "아카네 리제 AKANE LIZE").unwrap();
        assert_eq!((c.title.as_str(), c.alts[0].as_str()), ("내일의 밤하늘 초계반", "アスノヨゾラ哨戒班"));
        assert!(parse_cover("YOASOBI「アイドル」 Official Music Video", "Ayase / YOASOBI").is_none(), "not a cover");
    }
}

#[cfg(test)]
mod live_music {
    #[test]
    #[ignore = "network"]
    fn itunes_lookup() {
        let h = super::itunes("Ayase / YOASOBI", "アイドル", &[]).unwrap();
        assert_eq!(h.year, Some(2023));
        assert!(super::itunes("IU", "밤편지", &["IU 'Through the Night (밤편지)' MV"]).is_some(), "English store title via the full YouTube title");
    }
    #[test]
    #[ignore = "network"]
    fn youtube_music_album_year() {
        let mv = super::from_youtube("https://music.youtube.com/watch?v=ZRtdQ81jPUQ").unwrap();
        println!("MV: {} / {:?} / album {:?} / {:?} / {:?}", mv.title, mv.people.iter().map(|p| &p.name).collect::<Vec<_>>(), mv.series, mv.year, mv.extra);
        assert_eq!(mv.year, Some(2023));
        assert_eq!(super::ytm_track("DFzPmaNb7fk").and_then(|t| t.length).as_deref(), Some("4:27"));
        assert!(mv.series.is_some(), "album from Apple Music");
    }
}
