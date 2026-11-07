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
        ..Default::default()
    }
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
    let is_music = input.contains("music.youtube.com");
    let watch = format!("https://www.youtube.com/watch?v={vid}");
    let o: Value = agent().get("https://www.youtube.com/oembed").query("url", &watch).query("format", "json").call().map_err(net)?.into_json()?;
    let raw_title = o["title"].as_str().unwrap_or("").to_string();
    let channel = o["author_name"].as_str().unwrap_or("").trim_end_matches(" - Topic").trim().to_string();
    let song = clean_title(&raw_title, &channel);

    let thumb = first_ok(&[
        format!("https://i.ytimg.com/vi/{vid}/maxresdefault.jpg"),
        format!("https://i.ytimg.com/vi/{vid}/sddefault.jpg"),
    ])
    .unwrap_or_else(|| format!("https://i.ytimg.com/vi/{vid}/hqdefault.jpg"));

    let mut c = Candidate {
        provider: "youtube".into(),
        id: vid.clone(),
        title: song.clone(),
        alt_titles: if raw_title != song { vec![raw_title] } else { vec![] },
        kind: Some(Kind::Music),
        cover_url: Some(thumb.clone()),
        banner_url: Some(thumb),
        url: Some(if is_music { format!("https://music.youtube.com/watch?v={vid}") } else { watch }),
        people: if channel.is_empty() { vec![] } else { vec![Person { name: channel.clone(), category: TagCategory::Author, role: Some("Artist".into()) }] },
        ..Default::default()
    };

    // Album art: best Deezer match where both artist and title agree.
    if let Ok(hits) = search(&format!("{channel} {song}")) {
        let best = hits.into_iter().find(|h| {
            title_matches(&h.title, &song) && h.people.first().map(|p| title_matches(&p.name, &channel)).unwrap_or(false)
        });
        if let Some(h) = best {
            c.cover_url = h.cover_url.or(c.cover_url);
            c.series = h.series;
            if let Ok(full) = fetch_deezer(&h.id) {
                c.year = full.year;
                c.genres = full.genres;
            }
        }
    }
    Ok(c)
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
