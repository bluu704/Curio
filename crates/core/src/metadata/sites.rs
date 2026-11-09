//! Community / gallery links: hitomi.la galleries, DC Inside posts, Arca Live posts.
use regex::Regex;
use serde_json::Value;

use super::more::{opengraph_html, page, unescape};
use super::{agent, net};
use crate::models::{Candidate, Kind, Person, TagCategory};
use crate::Result;

fn person(name: &str, category: TagCategory, role: &str) -> Person {
    Person { name: name.to_string(), category, role: Some(role.into()) }
}
fn names(v: &Value, key: &str) -> Vec<String> {
    v.as_array().into_iter().flatten().filter_map(|x| x[key].as_str()).map(String::from).collect()
}

// ---------------------------------------------------------------- hitomi.la
/// Gallery number of a hitomi.la link (/galleries/123.html, /reader/123.html, /doujinshi/title-123.html …).
/// A bare 7-digit number counts as a gallery number too.
pub fn hitomi_id(url: &str) -> Option<String> {
    let t = url.trim().trim_start_matches('#');
    if t.len() == 7 && t.bytes().all(|b| b.is_ascii_digit()) {
        return Some(t.to_string());
    }
    Regex::new(r"hitomi\.la/[a-z]+/(?:[^/?#]*-)?(\d+)\.html").unwrap().captures(url).map(|c| c[1].to_string())
}

/// Thumbnail of a page image (served only to requests from hitomi.la, see `download_image`).
pub fn hitomi_thumb(hash: &str) -> Option<String> {
    let n = hash.len();
    (n > 3).then(|| format!("https://tn.gold-usergeneratedcontent.net/webpbigtn/{}/{}/{hash}.webp", &hash[n - 1..], &hash[n - 3..n - 1]))
}

pub fn hitomi(id: &str) -> Result<Candidate> {
    let js = agent().get(&format!("https://ltn.gold-usergeneratedcontent.net/galleries/{id}.js")).call().map_err(net)?.into_string()?;
    let v: Value = serde_json::from_str(js.trim().trim_start_matches("var galleryinfo =").trim().trim_end_matches(';'))?;
    let mut people: Vec<Person> = names(&v["artists"], "artist").iter().map(|n| person(n, TagCategory::Author, "Artist")).collect();
    people.extend(names(&v["groups"], "group").iter().map(|n| person(n, TagCategory::Circle, "Group")));
    let parody = names(&v["parodys"], "parody").into_iter().find(|p| p != "original");
    let lang = v["language_localname"].as_str().or(v["language"].as_str());
    let kind = v["type"].as_str().unwrap_or("");
    let pages = v["files"].as_array().map_or(0, |f| f.len());
    let mut detail: Vec<String> = [kind, lang.unwrap_or("")].iter().filter(|x| !x.is_empty()).map(|x| x.to_string()).collect();
    if pages > 0 {
        detail.push(format!("{pages}쪽"));
    }
    Ok(Candidate {
        provider: "hitomi".into(),
        id: id.into(),
        title: v["title"].as_str().unwrap_or_default().to_string(),
        alt_titles: v["japanese_title"].as_str().map(String::from).into_iter().collect(),
        kind: Some(if kind == "doujinshi" { Kind::Doujin } else { Kind::Manga }),
        year: v["date"].as_str().and_then(|d| d.get(..4)).and_then(|y| y.parse().ok()),
        cover_url: v["files"][0]["hash"].as_str().and_then(hitomi_thumb),
        people,
        genres: names(&v["tags"], "tag").into_iter().take(20).collect(),
        series: parody,
        url: Some(format!("https://hitomi.la/galleries/{id}.html")),
        detail: Some(detail.join(" · ")).filter(|d| !d.is_empty()),
        extra: super::more::extras([
            ("language", lang.map(String::from)), ("pages", (pages > 0).then(|| pages.to_string())), ("format", Some(kind.to_string())),
            ("characters", Some(names(&v["characters"], "character").join(", "))), ("release", v["date"].as_str().map(|d| d.chars().take(10).collect())),
        ]),
        ..Default::default()
    })
}

// ---------------------------------------------------------------- DC Inside
pub fn is_dcinside(url: &str) -> bool {
    Regex::new(r"(?:gall|m)\.dcinside\.com/(?:[a-z]+/)?board/(?:view|[\w-]+/\d+)").unwrap().is_match(url)
}

pub fn dcinside(url: &str) -> Result<Candidate> {
    let html = page(url)?;
    let mut c = opengraph_html(url, &html)?;
    c.provider = "web".into();
    let grab = |re: &str| Regex::new(re).unwrap().captures(&html).map(|m| unescape(m[1].trim()));
    // og:title is "글 제목 - 갤러리 이름"
    let (title, gallery) = match c.title.rsplit_once(" - ") { Some((t, g)) => (t.to_string(), Some(g.to_string())), None => (c.title.clone(), None) };
    c.title = grab(r#"<span class="title_subject">([^<]+)"#).unwrap_or(title);
    if let Some(nick) = grab(r#"gall_writer[^>]*data-nick="([^"]+)""#).or_else(|| grab(r#"class="nick(?:name)?[^"]*"[^>]*>([^<]+)<"#)) {
        c.people = vec![person(&nick, TagCategory::Author, "Writer")];
    }
    c.year = grab(r#"gall_date"[^>]*title="(\d{4})"#).and_then(|y| y.parse().ok());
    c.detail = gallery.or(c.detail);
    c.banner_url = None;
    Ok(c)
}

// ---------------------------------------------------------------- Arca Live
/// (channel, post number) of an arca.live post link.
pub fn arca_post(url: &str) -> Option<(String, String)> {
    Regex::new(r"arca\.live/b/([\w-]+)/(\d+)").unwrap().captures(url).map(|c| (c[1].to_string(), c[2].to_string()))
}

/// Title / image from the page; when the site turns the request away, the link is still kept.
pub fn arca(url: &str, channel: &str, no: &str) -> Result<Candidate> {
    let mut c = page(url).and_then(|h| {
        let mut c = opengraph_html(url, &h)?;
        let grab = |re: &str| Regex::new(re).unwrap().captures(&h).map(|m| unescape(m[1].trim()));
        if let Some(nick) = grab(r#"class="user-info"[^>]*>\s*<a[^>]*>([^<]+)<"#).or_else(|| grab(r#"data-filter="([^"]+)""#)) {
            c.people = vec![person(&nick, TagCategory::Author, "Writer")];
        }
        Ok(c)
    }).unwrap_or_else(|_| Candidate { title: format!("{channel} #{no}"), url: Some(url.into()), ..Default::default() });
    c.provider = "web".into();
    c.id = url.into();
    c.title = c.title.trim_end_matches(" - 아카라이브").trim_end_matches(" - Arca Live").to_string();
    c.detail = Some(format!("아카라이브 · {channel}"));
    c.banner_url = None;
    Ok(c)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn link_ids() {
        assert_eq!(hitomi_id("https://hitomi.la/galleries/1000.html").as_deref(), Some("1000"));
        assert_eq!(hitomi_id("https://hitomi.la/doujinshi/some-title-한국어-2345678.html#1").as_deref(), Some("2345678"));
        assert_eq!(hitomi_id("https://hitomi.la/reader/2345678.html#3").as_deref(), Some("2345678"));
        assert_eq!(hitomi_id(" 3456789 ").as_deref(), Some("3456789"), "bare gallery number");
        assert_eq!(hitomi_id("2024"), None);
        assert_eq!(
            hitomi_thumb("5e4dd8fcc183062842ee3bf02392a05b735688be7e6064784b813c822722a346").as_deref(),
            Some("https://tn.gold-usergeneratedcontent.net/webpbigtn/6/34/5e4dd8fcc183062842ee3bf02392a05b735688be7e6064784b813c822722a346.webp")
        );
        assert!(is_dcinside("https://gall.dcinside.com/mgallery/board/view/?id=game_dev&no=234926"));
        assert!(is_dcinside("https://gall.dcinside.com/board/view/?id=baseball_new11&no=1"));
        assert!(is_dcinside("https://m.dcinside.com/board/game_dev/234926"));
        assert!(!is_dcinside("https://gall.dcinside.com/mgallery/board/lists/?id=game_dev"));
        assert_eq!(arca_post("https://arca.live/b/genshin/123456789?p=1"), Some(("genshin".into(), "123456789".into())));
    }

    #[test]
    #[ignore = "network"]
    fn live_sites() {
        let h = hitomi("1000").unwrap();
        assert_eq!(h.title, "Honjitsu no Otooshi 2006 Summer");
        assert!(h.cover_url.is_some() && h.year == Some(2007), "{h:?}");
        let d = dcinside("https://gall.dcinside.com/mgallery/board/view/?id=game_dev&no=234926").unwrap();
        assert!(!d.title.contains(" - ") && !d.people.is_empty(), "{d:?}");
    }
}
