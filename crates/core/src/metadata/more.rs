//! Extra keyless sources: Kitsu (anime/manga), TVmaze (dramas/series), Open Library + Google Books (books, novels),
//! VNDB (visual novels), Pixiv (artwork links) and OpenGraph (any other web page).
use regex::Regex;
use serde_json::{json, Value};

use super::{agent, anilist::strip_html, net};
use crate::models::{Candidate, Kind, Person, TagCategory};
use crate::Result;

fn s(v: &Value) -> Option<String> {
    v.as_str().map(str::trim).filter(|s| !s.is_empty()).map(String::from)
}
fn year(v: &Value) -> Option<i64> {
    v.as_str().and_then(|d| d.get(..4)).and_then(|y| y.parse().ok()).or_else(|| v.as_i64())
}
fn person(name: String, category: TagCategory, role: &str) -> Person {
    Person { name, category, role: Some(role.into()) }
}

// ---------------------------------------------------------------- Kitsu
pub fn kitsu(q: &str, manga: bool) -> Result<Vec<Candidate>> {
    let kind = if manga { "manga" } else { "anime" };
    let v: Value = agent().get(&format!("https://kitsu.io/api/edge/{kind}")).query("filter[text]", q).query("page[limit]", "5").call().map_err(net)?.into_json()?;
    Ok(v["data"].as_array().into_iter().flatten().map(|d| {
        let a = &d["attributes"];
        let titles = &a["titles"];
        let title = s(&titles["en"]).or_else(|| s(&a["canonicalTitle"])).unwrap_or_default();
        let sub = s(&a["subtype"]).unwrap_or_default();
        let eps = a["episodeCount"].as_i64().or(a["chapterCount"].as_i64());
        Candidate {
            provider: "kitsu".into(),
            id: format!("{kind}/{}", s(&d["id"]).unwrap_or_default()),
            alt_titles: [s(&titles["ja_jp"]), s(&titles["en_jp"]), s(&a["canonicalTitle"])].into_iter().flatten().filter(|t| t != &title).collect(),
            title,
            kind: Some(if manga { Kind::Manga } else { Kind::Anime }),
            year: year(&a["startDate"]),
            cover_url: s(&a["posterImage"]["original"]).or_else(|| s(&a["posterImage"]["large"])),
            banner_url: s(&a["coverImage"]["original"]).or_else(|| s(&a["coverImage"]["large"])),
            summary: s(&a["synopsis"]),
            detail: Some([Some(sub.to_uppercase()), eps.map(|e| format!("{e}화"))].into_iter().flatten().collect::<Vec<_>>().join(" · ")).filter(|x| !x.is_empty()),
            url: Some(format!("https://kitsu.io/{kind}/{}", s(&a["slug"]).unwrap_or_default())),
            ..Default::default()
        }
    }).collect())
}

// ---------------------------------------------------------------- TVmaze
fn tvmaze_show(sh: &Value) -> Candidate {
    let net = s(&sh["network"]["name"]).or_else(|| s(&sh["webChannel"]["name"]));
    Candidate {
        provider: "tvmaze".into(),
        id: sh["id"].as_i64().unwrap_or(0).to_string(),
        title: s(&sh["name"]).unwrap_or_default(),
        kind: Some(Kind::Drama),
        year: year(&sh["premiered"]),
        cover_url: s(&sh["image"]["original"]).or_else(|| s(&sh["image"]["medium"])),
        summary: s(&sh["summary"]).map(|t| strip_html(&t)),
        genres: sh["genres"].as_array().into_iter().flatten().filter_map(s).collect(),
        people: net.into_iter().map(|n| person(n, TagCategory::Publisher, "Network")).collect(),
        detail: [s(&sh["type"]), s(&sh["language"]), s(&sh["status"])].into_iter().flatten().collect::<Vec<_>>().join(" · ").into(),
        url: s(&sh["url"]),
        ..Default::default()
    }
}

pub fn tvmaze(q: &str) -> Result<Vec<Candidate>> {
    let v: Value = agent().get("https://api.tvmaze.com/search/shows").query("q", q).call().map_err(net)?.into_json()?;
    Ok(v.as_array().into_iter().flatten().take(6).map(|r| tvmaze_show(&r["show"])).collect())
}

/// tvmaze.com/shows/<id>/…
pub fn tvmaze_id(url: &str) -> Option<String> {
    Regex::new(r"tvmaze\.com/shows/(\d+)").unwrap().captures(url).map(|c| c[1].to_string())
}
pub fn tvmaze_fetch(id: &str) -> Result<Candidate> {
    let v: Value = agent().get(&format!("https://api.tvmaze.com/shows/{id}")).call().map_err(net)?.into_json()?;
    Ok(tvmaze_show(&v))
}

// ---------------------------------------------------------------- books
pub fn open_library(q: &str) -> Result<Vec<Candidate>> {
    let v: Value = agent().get("https://openlibrary.org/search.json").query("q", q).query("limit", "5")
        .query("fields", "key,title,author_name,first_publish_year,cover_i,publisher,subject").call().map_err(net)?.into_json()?;
    Ok(v["docs"].as_array().into_iter().flatten().map(|d| {
        let mut people: Vec<Person> = d["author_name"].as_array().into_iter().flatten().filter_map(s).take(3).map(|n| person(n, TagCategory::Author, "Author")).collect();
        people.extend(d["publisher"].as_array().into_iter().flatten().filter_map(s).take(1).map(|n| person(n, TagCategory::Publisher, "Publisher")));
        Candidate {
            provider: "openlibrary".into(),
            id: s(&d["key"]).unwrap_or_default(),
            title: s(&d["title"]).unwrap_or_default(),
            kind: Some(Kind::Book),
            year: d["first_publish_year"].as_i64(),
            cover_url: d["cover_i"].as_i64().map(|c| format!("https://covers.openlibrary.org/b/id/{c}-L.jpg")),
            people,
            genres: d["subject"].as_array().into_iter().flatten().filter_map(s).take(4).collect(),
            url: s(&d["key"]).map(|k| format!("https://openlibrary.org{k}")),
            ..Default::default()
        }
    }).collect())
}

pub fn google_books(q: &str) -> Result<Vec<Candidate>> {
    let v: Value = agent().get("https://www.googleapis.com/books/v1/volumes").query("q", q).query("maxResults", "5").query("langRestrict", "ko").call().map_err(net)?.into_json()?;
    Ok(v["items"].as_array().into_iter().flatten().map(|it| {
        let b = &it["volumeInfo"];
        let mut people: Vec<Person> = b["authors"].as_array().into_iter().flatten().filter_map(s).take(3).map(|n| person(n, TagCategory::Author, "Author")).collect();
        people.extend(s(&b["publisher"]).map(|n| person(n, TagCategory::Publisher, "Publisher")));
        // ask Google for a large rendition of the cover
        let cover = s(&b["imageLinks"]["thumbnail"]).map(|u| u.replace("http://", "https://").replace("&edge=curl", "").replace("zoom=1", "zoom=0") + "&fife=w800");
        Candidate {
            provider: "googlebooks".into(),
            id: s(&it["id"]).unwrap_or_default(),
            title: [s(&b["title"]), s(&b["subtitle"])].into_iter().flatten().collect::<Vec<_>>().join(" "),
            kind: Some(Kind::Book),
            year: year(&b["publishedDate"]),
            cover_url: cover,
            summary: s(&b["description"]).map(|t| strip_html(&t)),
            people,
            genres: b["categories"].as_array().into_iter().flatten().filter_map(s).take(3).collect(),
            detail: b["pageCount"].as_i64().map(|p| format!("{p}쪽")),
            url: s(&b["infoLink"]),
            ..Default::default()
        }
    }).collect())
}

// ---------------------------------------------------------------- VNDB (visual novels)
/// vndb.org/v17
pub fn vndb_id(url: &str) -> Option<String> {
    Regex::new(r"vndb\.org/(v\d+)").unwrap().captures(url).map(|c| c[1].to_string())
}
pub fn vndb_fetch(id: &str) -> Result<Candidate> {
    vndb_query(json!(["id", "=", id]))?.into_iter().next().ok_or_else(|| crate::Error::NotFound(id.into()))
}
pub fn vndb(q: &str) -> Result<Vec<Candidate>> {
    vndb_query(json!(["search", "=", q]))
}
fn vndb_query(filters: Value) -> Result<Vec<Candidate>> {
    let v: Value = agent().post("https://api.vndb.org/kana/vn")
        .send_json(json!({ "filters": filters, "fields": "title, alttitle, released, image.url, developers.name, description, length_minutes", "results": 5 }))
        .map_err(net)?.into_json()?;
    Ok(v["results"].as_array().into_iter().flatten().map(|r| Candidate {
        provider: "vndb".into(),
        id: s(&r["id"]).unwrap_or_default(),
        title: s(&r["title"]).unwrap_or_default(),
        alt_titles: s(&r["alttitle"]).into_iter().collect(),
        kind: Some(Kind::Game),
        year: year(&r["released"]),
        cover_url: s(&r["image"]["url"]),
        summary: s(&r["description"]).map(|d| Regex::new(r"\[/?[a-z]+[^\]]*\]").unwrap().replace_all(&d, "").to_string()),
        people: r["developers"].as_array().into_iter().flatten().filter_map(|d| s(&d["name"])).map(|n| person(n, TagCategory::Studio, "Developer")).collect(),
        detail: Some("비주얼 노벨".into()),
        url: s(&r["id"]).map(|id| format!("https://vndb.org/{id}")),
        ..Default::default()
    }).collect())
}

// ---------------------------------------------------------------- Pixiv artwork link
pub fn pixiv_id(url: &str) -> Option<String> {
    Regex::new(r"pixiv\.net/(?:[a-z]{2}/)?artworks/(\d+)").unwrap().captures(url).map(|c| c[1].to_string())
}

pub fn pixiv(id: &str) -> Result<Candidate> {
    let v: Value = agent().get(&format!("https://www.pixiv.net/ajax/illust/{id}")).set("Referer", "https://www.pixiv.net/").call().map_err(net)?.into_json()?;
    let b = &v["body"];
    let url = format!("https://www.pixiv.net/artworks/{id}");
    // the public share image is reachable without login
    let og = opengraph(&url).ok();
    Ok(Candidate {
        provider: "pixiv".into(),
        id: id.into(),
        title: s(&b["title"]).or_else(|| og.as_ref().map(|o| o.title.clone())).unwrap_or_default(),
        kind: Some(Kind::Illust),
        year: year(&b["createDate"]),
        cover_url: og.as_ref().and_then(|o| o.cover_url.clone()),
        people: s(&b["userName"]).map(|n| person(n, TagCategory::Author, "Artist")).into_iter().collect(),
        genres: vec![],
        series: None,
        summary: s(&b["description"]).map(|t| strip_html(&t)).filter(|t| !t.is_empty()),
        url: Some(url),
        detail: Some(b["tags"]["tags"].as_array().into_iter().flatten().filter_map(|t| s(&t["tag"])).take(6).collect::<Vec<_>>().join(" · ")).filter(|x| !x.is_empty()),
        ..Default::default()
    })
}

// ---------------------------------------------------------------- OpenGraph (any page)
/// Title / image / description from a page's <meta property="og:*"> tags — works for most sites
/// (Kakao Page, Webtoon, Ridi, Laftel, Netflix, blogs…).
pub fn opengraph(url: &str) -> Result<Candidate> {
    let html = agent().get(url).set("Accept-Language", "ko-KR,ko;q=0.9,en;q=0.8")
        .set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36")
        .call().map_err(net)?.into_string()?;
    let meta = |names: &[&str]| -> Option<String> {
        for n in names {
            let re = Regex::new(&format!(r#"(?is)<meta[^>]+(?:property|name)=["']{n}["'][^>]*content=["']([^"']+)["']|<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']{n}["']"#)).unwrap();
            if let Some(c) = re.captures(&html) {
                let v = c.get(1).or(c.get(2)).map(|m| m.as_str().trim().to_string()).unwrap_or_default();
                if !v.is_empty() {
                    return Some(v.replace("&amp;", "&").replace("&quot;", "\"").replace("&#39;", "'"));
                }
            }
        }
        None
    };
    let title = meta(&["og:title", "twitter:title"])
        .or_else(|| Regex::new(r"(?is)<title[^>]*>(.*?)</title>").unwrap().captures(&html).map(|c| c[1].trim().to_string()))
        .ok_or_else(|| crate::Error::NotFound("no title on page".into()))?;
    let image = meta(&["og:image", "og:image:url", "twitter:image"]).map(|i| if i.starts_with("//") { format!("https:{i}") } else { i });
    let site = meta(&["og:site_name"]);
    Ok(Candidate {
        provider: "web".into(),
        id: url.into(),
        title,
        cover_url: image.clone(),
        banner_url: image,
        summary: meta(&["og:description", "description", "twitter:description"]),
        detail: site,
        url: Some(url.into()),
        ..Default::default()
    })
}


#[cfg(test)]
mod link_tests {
    use crate::metadata::search;
    use crate::models::Kind;
    #[test]
    #[ignore = "network"]
    fn live_new_links() {
        let t = search(Kind::Other, "https://www.tvmaze.com/shows/169/breaking-bad").unwrap();
        assert_eq!(t[0].title, "Breaking Bad");
        let v = search(Kind::Other, "https://vndb.org/v17").unwrap();
        assert!(v[0].title.starts_with("Ever17"), "{:?}", v[0].title);
        let a = search(Kind::Other, "https://anilist.co/anime/154587/Sousou-no-Frieren/").unwrap();
        assert!(a[0].title.to_lowercase().contains("frieren") || a[0].title.contains("フリーレン") || a[0].title.contains("프리렌"), "{:?}", a[0].title);
        let all = search(Kind::Other, "Frieren").unwrap();
        assert!(all.len() >= 3, "broad search finds several");
    }
}
