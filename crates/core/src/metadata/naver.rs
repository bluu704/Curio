//! Naver Webtoon / Naver Series (novels). Unofficial JSON endpoints used by comic.naver.com itself.
use serde_json::Value;

use super::{agent, net};
use crate::models::{Candidate, Kind, Person, TagCategory};
use crate::Result;

#[derive(Clone, Copy)]
pub enum Scope {
    Webtoon,
    Novel,
}

fn s(v: &Value) -> Option<String> {
    v.as_str().map(str::trim).filter(|s| !s.is_empty()).map(String::from)
}

fn people(v: &Value) -> Vec<Person> {
    let mut out: Vec<Person> = vec![];
    for a in v["communityArtists"].as_array().into_iter().flatten() {
        let Some(name) = s(&a["name"]) else { continue };
        let types: Vec<&str> = a["artistTypeList"].as_array().into_iter().flatten().filter_map(|t| t.as_str()).collect();
        let role = if types.contains(&"ARTIST_NOVEL_ORIGIN") { "원작" } else if types.contains(&"ARTIST_PAINTER") && !types.contains(&"ARTIST_WRITER") { "그림" } else { "글" };
        if !out.iter().any(|p| p.name == name) {
            out.push(Person { name, category: TagCategory::Author, role: Some(role.into()) });
        }
    }
    out
}

pub fn search(q: &str, scope: Scope) -> Result<Vec<Candidate>> {
    let v: Value = agent().get("https://comic.naver.com/api/search/all").query("keyword", q).call().map_err(net)?.into_json()?;
    let keys: &[&str] = match scope {
        Scope::Webtoon => &["searchWebtoonResult", "searchNbooksComicResult"],
        Scope::Novel => &["searchNbooksNovelResult"],
    };
    let mut out = vec![];
    for k in keys {
        for w in v[*k]["searchViewList"].as_array().into_iter().flatten().take(5) {
            let webtoon = w.get("titleId").is_some();
            let id = w["titleId"].as_i64().or(w["contentId"].as_i64()).unwrap_or(0).to_string();
            out.push(Candidate {
                provider: "naver".into(),
                id: if webtoon { id.clone() } else { format!("series:{id}") },
                title: s(&w["titleName"]).unwrap_or_default(),
                kind: Some(if matches!(scope, Scope::Novel) { Kind::WebNovel } else { Kind::Webtoon }),
                cover_url: s(&w["thumbnailUrl"]),
                people: people(w),
                genres: w["genreList"].as_array().into_iter().flatten().filter_map(|g| s(&g["description"])).collect(),
                url: Some(if webtoon {
                    format!("https://comic.naver.com/webtoon/list?titleId={id}")
                } else {
                    format!("https://series.naver.com/search/search.series?t=all&fs=default&q={}", urlenc(&s(&w["titleName"]).unwrap_or_default()))
                }),
                ..Default::default()
            });
        }
    }
    Ok(out)
}

fn urlenc(s: &str) -> String {
    s.bytes().map(|b| if b.is_ascii_alphanumeric() { (b as char).to_string() } else { format!("%{b:02X}") }).collect()
}

/// Webtoon details: synopsis, genre tags, larger poster.
pub fn fetch(id: &str) -> Result<Candidate> {
    if id.starts_with("series:") {
        return Err(crate::Error::Unsupported("Naver Series details".into()));
    }
    let d: Value = agent().get("https://comic.naver.com/api/article/list/info").query("titleId", id).call().map_err(net)?.into_json()?;
    Ok(Candidate {
        provider: "naver".into(),
        id: id.into(),
        title: s(&d["titleName"]).unwrap_or_default(),
        kind: Some(Kind::Webtoon),
        cover_url: s(&d["posterThumbnailUrl"]).or_else(|| s(&d["thumbnailUrl"])),
        banner_url: s(&d["sharedThumbnailUrl"]),
        summary: s(&d["synopsis"]),
        people: people(&d),
        genres: d["curationTagList"].as_array().into_iter().flatten().filter_map(|t| s(&t["tagName"])).take(6).collect(),
        url: Some(format!("https://comic.naver.com/webtoon/list?titleId={id}")),
        ..Default::default()
    })
}
