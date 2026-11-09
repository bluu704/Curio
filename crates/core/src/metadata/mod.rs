//! Online metadata lookup. Every provider is keyless and public.
//!
//! Several sources are queried **in parallel** and merged (round-robin, so every source shows up):
//!
//! | kind        | sources                                             |
//! |-------------|-----------------------------------------------------|
//! | anime       | AniList · Wikipedia/Wikidata                        |
//! | webtoon     | Naver Webtoon · AniList · Wikipedia                 |
//! | web novel   | Naver Series · AniList · Wikipedia                  |
//! | LN / manga  | AniList · Wikipedia                                 |
//! | game        | Steam · Google Play · Wikipedia                     |
//! | music       | YouTube/YT Music link (oEmbed + Deezer art) · Deezer · Wikipedia |
//! | movie / illust / catalog / other | Wikipedia/Wikidata             |
//! | doujin      | — (files are uploaded; no lookup)                   |
//!
//! Search returns candidates; `fetch(provider, id)` returns full details.

pub(crate) mod anilist;
mod googleplay;
pub mod lyrics;
mod more;
mod music;
mod naver;
mod sites;
mod social;
mod steam;
mod wikipedia;
pub mod codes;

use std::path::{Path, PathBuf};
use std::time::Duration;

use crate::models::{Candidate, Kind};
use crate::{Error, Result};

pub(crate) fn agent() -> ureq::Agent {
    ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(15))
        .user_agent("CuriosArchive/0.1 (personal desktop archive app; low-volume, user-initiated lookups)")
        .try_proxy_from_env(true)
        .build()
}

pub(crate) fn net(e: ureq::Error) -> Error {
    Error::Network(e.to_string())
}

type Job<'a> = Box<dyn FnOnce() -> Result<Vec<Candidate>> + Send + 'a>;

/// Search every source that fits `kind` in parallel and merge the hits.
/// `query` may be a title, a YouTube/Steam/Play URL. A failing source is skipped.
pub fn search(kind: Kind, query: &str) -> Result<Vec<Candidate>> {
    let q = query.trim();
    if let Some(id) = sites::hitomi_id(q) {
        return sites::hitomi(&id).map(|c| vec![c]);
    }
    // a YouTube Music search link (the web version's stand-in link for a song): search YouTube Music
    if let Some(text) = ytm_search_query(q) {
        return music::ytm_search(&text);
    }
    if q.is_empty() || kind == Kind::Doujin {
        return Ok(vec![]);
    }
    // Direct links resolve to exactly one candidate.
    if music::youtube_id(q).is_some() {
        // songs: YouTube Music links (and items already marked as music) are read as a track
        return if kind == Kind::Music || q.contains("music.youtube.com") { music::from_youtube(q) } else { music::video(q) }.map(|c| vec![c]);
    }
    if let Some(c) = regex::Regex::new(r"anilist\.co/(?:anime|manga)/(\d+)").unwrap().captures(q) {
        return anilist::fetch(&c[1]).map(|c| vec![c]);
    }
    if let Some(id) = more::tvmaze_id(q) {
        return more::tvmaze_fetch(&id).map(|c| vec![c]);
    }
    if let Some(id) = more::vndb_id(q) {
        return more::vndb_fetch(&id).map(|c| vec![c]);
    }
    if let Some(id) = regex::Regex::new(r"comic\.naver\.com/webtoon/(?:list|detail)\?(?:.*&)?titleId=(\d+)").unwrap().captures(q) {
        return naver::fetch(&id[1]).map(|c| vec![c]);
    }
    if let Some(id) = steam::app_id_from_url(q) {
        return steam::fetch(&id).map(|c| vec![c]);
    }
    if let Some(id) = regex::Regex::new(r"play\.google\.com/store/apps/details\?id=([A-Za-z0-9._]+)").unwrap().captures(q) {
        return googleplay::fetch(&id[1]).map(|c| vec![c]);
    }
    if sites::is_dcinside(q) {
        return sites::dcinside(q).map(|c| vec![c]);
    }
    if let Some((ch, no)) = sites::arca_post(q) {
        return sites::arca(q, &ch, &no).map(|c| vec![c]);
    }
    if let Some(id) = more::pixiv_id(q) {
        return more::pixiv(&id).map(|c| vec![c]);
    }
    if let Some((user, id)) = social::tweet_id(q) {
        return social::tweet(&user, &id).map(|c| vec![c]);
    }
    if let Some(id) = social::yt_post_id(q) {
        return social::yt_post(&id).map(|c| vec![c]);
    }
    if social::is_music_link(q) {
        return social::music_link(q).map(|c| vec![c]);
    }
    // any other web page → OpenGraph preview (title, image, description)
    if q.starts_with("http://") || q.starts_with("https://") {
        return more::opengraph(q).map(|c| vec![c]);
    }

    let wiki: Job = Box::new(|| wikipedia::search(q));
    let jobs: Vec<Job> = match kind {
        Kind::Anime => vec![Box::new(|| anilist::search(q, anilist::Scope::Anime)), Box::new(|| more::kitsu(q, false)), wiki],
        Kind::Webtoon => vec![Box::new(|| naver::search(q, naver::Scope::Webtoon)), Box::new(|| anilist::search(q, anilist::Scope::Comic)), wiki],
        Kind::WebNovel => vec![Box::new(|| naver::search(q, naver::Scope::Novel)), Box::new(|| anilist::search(q, anilist::Scope::Novel)), Box::new(|| more::google_books(q)), wiki],
        Kind::LightNovel => vec![Box::new(|| anilist::search(q, anilist::Scope::Novel)), Box::new(|| more::google_books(q)), Box::new(|| more::open_library(q)), wiki],
        Kind::Manga => vec![Box::new(|| anilist::search(q, anilist::Scope::Comic)), Box::new(|| more::kitsu(q, true)), Box::new(|| more::open_library(q)), wiki],
        Kind::Book => vec![Box::new(|| more::google_books(q)), Box::new(|| more::open_library(q)), wiki],
        Kind::Drama => vec![Box::new(|| more::tvmaze(q)), wiki],
        Kind::Game => vec![Box::new(|| steam::search(q)), Box::new(|| googleplay::search(q)), Box::new(|| more::vndb(q)), wiki],
        // songs: YouTube Music first and alone; the others only when it finds nothing
        Kind::Music => {
            if let Ok(hits) = music::ytm_search(q) {
                if !hits.is_empty() {
                    return Ok(hits);
                }
            }
            vec![Box::new(|| music::search(q)), Box::new(|| music::search_youtube(q, true)), wiki]
        }
        Kind::Movie => vec![wiki, Box::new(|| music::search_youtube(q, false))],
        // no specific kind (archives don't have one any more): ask every source and let the user pick
        Kind::Other => vec![
            Box::new(|| anilist::search(q, anilist::Scope::Anime)),
            Box::new(|| anilist::search(q, anilist::Scope::Comic)),
            Box::new(|| anilist::search(q, anilist::Scope::Novel)),
            Box::new(|| naver::search(q, naver::Scope::Webtoon)),
            Box::new(|| naver::search(q, naver::Scope::Novel)),
            Box::new(|| steam::search(q)),
            Box::new(|| googleplay::search(q)),
            Box::new(|| more::vndb(q)),
            Box::new(|| more::tvmaze(q)),
            Box::new(|| more::google_books(q)),
            Box::new(|| more::open_library(q)),
            Box::new(|| music::search(q)),
            Box::new(|| music::search_youtube(q, false)),
            wiki,
        ],
        _ => vec![wiki],
    };
    let results: Vec<Result<Vec<Candidate>>> = std::thread::scope(|sc| {
        let hs: Vec<_> = jobs.into_iter().map(|j| sc.spawn(j)).collect();
        hs.into_iter().map(|h| h.join().unwrap_or_else(|_| Err(Error::Network("source panicked".into())))).collect()
    });
    let errors: Vec<String> = results.iter().filter_map(|r| r.as_ref().err().map(|e| e.to_string())).collect();
    let lists: Vec<Vec<Candidate>> = results.into_iter().filter_map(|r| r.ok()).collect();
    if lists.is_empty() && !errors.is_empty() {
        return Err(Error::Network(errors.join("; ")));
    }
    // Round-robin merge: best hit of each source first.
    let mut merged = vec![];
    let max = lists.iter().map(|l| l.len()).max().unwrap_or(0);
    for i in 0..max {
        for l in &lists {
            if let Some(c) = l.get(i) {
                merged.push(c.clone());
            }
        }
    }
    Ok(merged)
}

pub fn fetch(provider: &str, id: &str) -> Result<Candidate> {
    match provider {
        "anilist" => anilist::fetch(id),
        "steam" => steam::fetch(id),
        "googleplay" => googleplay::fetch(id),
        "naver" => naver::fetch(id),
        "wikipedia" => wikipedia::fetch(id),
        "youtube" => music::from_youtube(id),
        "youtube-video" => music::video(id),
        "pixiv" => more::pixiv(id),
        "hitomi" => sites::hitomi(id),
        "web" => more::opengraph(id),
        "x" => id.split_once('/').ok_or_else(|| Error::Invalid("bad id".into())).and_then(|(u, i)| social::tweet(u, i)),
        "youtube-post" => social::yt_post(id),
        "spotify" | "soundcloud" => social::music_link(id),
        // these sources return full details in search already
        "tvmaze" => more::tvmaze_fetch(id),
        "vndb" => more::vndb_fetch(id),
        "kitsu" | "openlibrary" | "googlebooks" => Err(Error::Unsupported("use the search result".into())),
        "deezer" => music::fetch_deezer(id),
        p => Err(Error::Invalid(format!("unknown provider {p}"))),
    }
}

pub(crate) fn urlencode(s: &str) -> String {
    s.bytes()
        .map(|b| if b.is_ascii_alphanumeric() || b"-_.~".contains(&b) { (b as char).to_string() } else { format!("%{b:02X}") })
        .collect()
}

/// Download an image into `cache/images` and return the local path. Same URL → same file.
pub fn download_image(url: &str, cache_dir: &Path) -> Result<PathBuf> {
    use std::hash::{Hash, Hasher};
    let mut h = std::collections::hash_map::DefaultHasher::new();
    url.hash(&mut h);
    let ext = url.rsplit('.').next().filter(|e| e.len() <= 4 && e.chars().all(|c| c.is_ascii_alphanumeric())).unwrap_or("jpg");
    let out = cache_dir.join("images").join(format!("{:016x}.{ext}", h.finish()));
    if out.exists() {
        return Ok(out);
    }
    // Some CDNs only serve images to their own pages (Naver: image-comic.pstatic.net → 403 without Referer).
    let referer = [
        ("pstatic.net", "https://comic.naver.com/"),
        ("gold-usergeneratedcontent.net", "https://hitomi.la/"),
        ("dcinside.co.kr", "https://gall.dcinside.com/"),
        ("namu.la", "https://arca.live/"),
        ("pximg.net", "https://www.pixiv.net/"),
    ]
    .into_iter()
    .find(|(host, _)| url.contains(host))
    .map(|(_, r)| r);
    let mut req = agent().get(url);
    if let Some(r) = referer {
        req = req.set("Referer", r);
    }
    let resp = req.call().map_err(net)?;
    let mut bytes = Vec::new();
    std::io::Read::read_to_end(&mut resp.into_reader().take(40 * 1024 * 1024), &mut bytes)?;
    if bytes.len() < 100 {
        return Err(Error::Network(format!("empty image: {url}")));
    }
    std::fs::create_dir_all(out.parent().unwrap())?;
    std::fs::write(&out, bytes)?;
    Ok(out)
}

/// First URL in `urls` that answers 200 (used to pick the highest-resolution variant).
pub(crate) fn first_ok(urls: &[String]) -> Option<String> {
    let a = agent();
    urls.iter().find(|u| a.head(u).call().map(|r| r.status() == 200).unwrap_or(false)).cloned()
}

use std::io::Read as _;

/// Loose title similarity used by auto-fill (only apply when we are fairly sure).
/// YouTube video id of a song link (watch / youtu.be / music.youtube / shorts).
/// YouTube Music link of a song found by title + singer (the most certain match), if any.
pub fn youtube_music_link(title: &str, artist: &str) -> Option<String> {
    if title.trim().is_empty() || artist.trim().is_empty() {
        return None;
    }
    lyrics::ytmusic_find(title, artist).into_iter().next().map(|v| format!("https://music.youtube.com/watch?v={v}"))
}

pub use music::{parse_cover, Cover};

/// Length of a YouTube video / song in seconds, from YouTube Music (0 = unknown).
pub fn track_length(video_id: &str) -> u32 {
    music::ytm_track(video_id).and_then(|t| t.length).map(|l| lyrics::length_secs(&l)).unwrap_or(0)
}

/// "https://music.youtube.com/search?q=밤편지+아이유" → "밤편지 아이유"
pub fn ytm_search_query(url: &str) -> Option<String> {
    let rest = url.split_once("music.youtube.com/search?")?.1;
    rest.split('&').find_map(|kv| kv.strip_prefix("q="))
        .map(|v| percent_decode(&v.replace('+', " ")))
        .filter(|v| !v.trim().is_empty())
}

fn percent_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let Ok(v) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
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

pub fn music_video_id(url: &str) -> Option<String> {
    music::youtube_id(url)
}

pub fn title_matches(a: &str, b: &str) -> bool {
    let norm = |s: &str| s.chars().filter(|c| c.is_alphanumeric()).flat_map(char::to_lowercase).collect::<String>();
    let (a, b) = (norm(a), norm(b));
    !a.is_empty() && !b.is_empty() && (a == b || (a.chars().count() >= 3 && b.contains(&a)) || (b.chars().count() >= 3 && a.contains(&b)))
}

#[cfg(test)]
mod live {
    //! Hits real APIs: `cargo test -p curio-core live -- --ignored --nocapture`
    use super::*;
    fn show(c: &Candidate) {
        println!(
            "[{}:{}] {} ({:?}) kind={:?}\n  cover={:?}\n  banner={:?}\n  people={:?}\n  genres={:?} series={:?} url={:?}\n  summary={:?}",
            c.provider, c.id, c.title, c.year, c.kind, c.cover_url, c.banner_url,
            c.people.iter().map(|p| format!("{}:{:?}", p.name, p.category)).collect::<Vec<_>>(),
            c.genres, c.series, c.url, c.summary.as_deref().map(|s| s.chars().take(60).collect::<String>())
        );
    }
    #[test]
    #[ignore]
    fn live_providers() {
        let a = search(Kind::Anime, "Frieren").unwrap();
        show(&fetch(&a[0].provider, &a[0].id).unwrap());
        let w = search(Kind::Webtoon, "Solo Leveling").unwrap();
        show(&w[0]);
        let n = search(Kind::LightNovel, "Spice and Wolf").unwrap();
        show(&n[0]);
        let g = search(Kind::Game, "elden ring").unwrap();
        show(&fetch(&g[0].provider, &g[0].id).unwrap());
        show(&search(Kind::Music, "https://music.youtube.com/watch?v=ZRtdQ81jPUQ").unwrap()[0]);
        show(&search(Kind::Music, "https://www.youtube.com/watch?v=Ks-_Mh1QhMc").unwrap()[0]);
        for c in search(Kind::Webtoon, "화산귀환").unwrap().iter().take(3) { println!("  ~ {} [{}]", c.title, c.provider); }
        let nv = search(Kind::Webtoon, "화산귀환").unwrap().into_iter().find(|c| c.provider == "naver").unwrap();
        show(&fetch("naver", &nv.id).unwrap());
        let gp = search(Kind::Game, "붕괴 스타레일").unwrap();
        for c in gp.iter().take(6) { println!("  ~ {} [{}]", c.title, c.provider); }
        let w = search(Kind::Movie, "기생충 영화").unwrap();
        show(&fetch("wikipedia", &w[0].id).unwrap());
        let dir = std::env::temp_dir().join("curio-live");
        let p = download_image(a[0].banner_url.as_deref().unwrap(), &dir).unwrap();
        println!("downloaded {} bytes", std::fs::metadata(p).unwrap().len());
    }
}

#[cfg(test)]
mod live_links {
    //! `cargo test -p curio-core live_links -- --ignored --nocapture` — title/link → cover for each archive type.
    use super::*;
    #[test]
    #[ignore]
    fn titles_and_links_bring_covers() {
        let cases: &[(Kind, &str)] = &[
            (Kind::Webtoon, "화산귀환"),
            (Kind::Webtoon, "https://comic.naver.com/webtoon/list?titleId=769209"),
            (Kind::Game, "Stardew Valley"),
            (Kind::Game, "https://store.steampowered.com/app/413150/Stardew_Valley/"),
            (Kind::Game, "https://play.google.com/store/apps/details?id=com.HoYoverse.hkrpgoversea"),
            (Kind::Music, "아이유 밤편지"),
            (Kind::Music, "https://music.youtube.com/watch?v=ZRtdQ81jPUQ"),
            (Kind::Movie, "https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
            (Kind::Other, "Never Gonna Give You Up official video"),
        ];
        let dir = std::env::temp_dir().join("curio-live-links");
        for (k, q) in cases {
            match search(*k, q) {
                Ok(hits) if !hits.is_empty() => {
                    let h = &hits[0];
                    let full = fetch(&h.provider, &h.id).unwrap_or_else(|_| h.clone());
                    let img = full.cover_url.as_deref().map(|u| download_image(u, &dir).map(|p| std::fs::metadata(p).map(|m| m.len()).unwrap_or(0)));
                    println!("{:<8?} {:<60} → [{}] {} | cover {:?} | banner {}", k, q.chars().take(60).collect::<String>(), full.provider, full.title, img.map(|r| r.map_err(|e| e.to_string())), full.banner_url.is_some());
                }
                Ok(_) => println!("{k:<8?} {q} → NO RESULTS"),
                Err(e) => println!("{k:<8?} {q} → ERROR {e}"),
            }
        }
    }
}

#[cfg(test)]
mod live_more {
    //! `cargo test -p curio-core live_more -- --ignored --nocapture`
    use super::*;
    #[test]
    #[ignore]
    fn new_sources() {
        let cases: &[(Kind, &str)] = &[
            (Kind::Anime, "Attack on Titan"),
            (Kind::Drama, "The Glory"),
            (Kind::Book, "Spice and Wolf"),
            (Kind::Game, "Steins;Gate"),
            (Kind::Illust, "https://www.webtoons.com/en/fantasy/tower-of-god/list?title_no=95"),
            (Kind::Other, "https://page.kakao.com/"),
        ];
        for (k, q) in cases {
            match search(*k, q) {
                Ok(h) => for c in h.iter().take(4) {
                    println!("{k:?} {q:.30} → [{}] {} | {} | series {:?} | cover {}", c.provider, c.title, c.detail.clone().unwrap_or_default(), c.series, c.cover_url.is_some());
                },
                Err(e) => println!("{k:?} {q} → ERROR {e}"),
            }
        }
    }
}
