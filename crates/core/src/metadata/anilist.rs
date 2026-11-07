use serde_json::{json, Value};

use super::{agent, net};
use crate::models::{Candidate, Kind, Person, TagCategory};
use crate::{Error, Result};

pub enum Scope {
    Anime,
    Comic,
    Novel,
}

const FIELDS: &str = r#"
  id siteUrl type format countryOfOrigin
  title { romaji english native } synonyms
  coverImage { extraLarge large } bannerImage
  startDate { year } description(asHtml: false) genres
  studios(isMain: true) { nodes { name } }
  staff(sort: [RELEVANCE], perPage: 25) { edges { role node { name { full native } } } }
  characters(sort: [ROLE, RELEVANCE], perPage: 6) { edges { voiceActors(language: JAPANESE) { name { full native } } } }
"#;

fn post(query: &str, vars: Value) -> Result<Value> {
    let body: Value = agent()
        .post("https://graphql.anilist.co")
        .send_json(json!({ "query": query, "variables": vars }))
        .map_err(net)?
        .into_json()?;
    if let Some(e) = body.get("errors") {
        return Err(Error::Network(format!("AniList: {e}")));
    }
    Ok(body["data"].clone())
}

pub fn search(q: &str, scope: Scope) -> Result<Vec<Candidate>> {
    let (ty, filter) = match scope {
        Scope::Anime => ("ANIME", ""),
        Scope::Comic => ("MANGA", ", format_not_in: [NOVEL]"),
        Scope::Novel => ("MANGA", ", format_in: [NOVEL]"),
    };
    let type_arg = format!(", type: {ty}");
    let query = format!(
        "query($s: String) {{ Page(perPage: 8) {{ media(search: $s{type_arg}{filter}, sort: [SEARCH_MATCH, POPULARITY_DESC]) {{ {FIELDS} }} }} }}"
    );
    let data = post(&query, json!({ "s": q }))?;
    Ok(data["Page"]["media"].as_array().cloned().unwrap_or_default().iter().map(to_candidate).collect())
}

pub fn fetch(id: &str) -> Result<Candidate> {
    let id: i64 = id.parse().map_err(|_| Error::Invalid("anilist id".into()))?;
    let query = format!("query($id: Int) {{ Media(id: $id) {{ {FIELDS} }} }}");
    Ok(to_candidate(&post(&query, json!({ "id": id }))?["Media"]))
}

fn s(v: &Value) -> Option<String> {
    v.as_str().map(str::trim).filter(|s| !s.is_empty()).map(String::from)
}

fn has_hangul(s: &str) -> bool {
    s.chars().any(|c| ('\u{AC00}'..='\u{D7A3}').contains(&c))
}

pub(crate) fn strip_html(s: &str) -> String {
    let s = s.replace("<br>", "\n").replace("<br />", "\n").replace("<br/>", "\n");
    let re = regex::Regex::new(r"<[^>]+>").unwrap();
    let out = re.replace_all(&s, "");
    out.replace("&quot;", "\"").replace("&amp;", "&").replace("&#039;", "'").replace("&lt;", "<").replace("&gt;", ">")
        .lines()
        .map(str::trim)
        .fold(Vec::<&str>::new(), |mut acc, l| {
            if !(l.is_empty() && acc.last().is_none_or(|p| p.is_empty())) {
                acc.push(l);
            }
            acc
        })
        .join("\n")
        .trim()
        .to_string()
}

fn person_name(n: &Value) -> Option<String> {
    s(&n["name"]["native"]).or_else(|| s(&n["name"]["full"]))
}

fn to_candidate(m: &Value) -> Candidate {
    let t = &m["title"];
    let synonyms: Vec<String> = m["synonyms"].as_array().into_iter().flatten().filter_map(s).collect();
    // Prefer a Korean title when AniList has one, else English, else romaji.
    let korean = synonyms.iter().find(|x| has_hangul(x)).cloned();
    let title = korean.clone().or_else(|| s(&t["english"])).or_else(|| s(&t["romaji"])).unwrap_or_default();
    let mut alt: Vec<String> = [s(&t["native"]), s(&t["romaji"]), s(&t["english"])].into_iter().flatten().collect();
    alt.extend(synonyms.into_iter().filter(|x| has_hangul(x)));
    alt.retain(|x| x != &title);
    alt.dedup();

    let is_anime = m["type"].as_str() == Some("ANIME");
    let country = m["countryOfOrigin"].as_str().unwrap_or("");
    let novel = m["format"].as_str() == Some("NOVEL");
    let kind = if is_anime {
        Kind::Anime
    } else if novel {
        if country == "JP" { Kind::LightNovel } else { Kind::WebNovel }
    } else if country == "KR" || country == "CN" {
        Kind::Webtoon
    } else {
        Kind::Manga
    };

    let mut people: Vec<Person> = vec![];
    let mut push = |name: Option<String>, category: TagCategory, role: Option<String>| {
        if let Some(name) = name {
            if !people.iter().any(|p| p.name == name && p.category == category) {
                people.push(Person { name, category, role });
            }
        }
    };
    for e in m["staff"]["edges"].as_array().into_iter().flatten() {
        let role = e["role"].as_str().unwrap_or("");
        let base = role.split(" (").next().unwrap_or(role);
        let cat = match base {
            "Director" | "Chief Director" | "Series Director" => Some(TagCategory::Director),
            "Original Creator" | "Original Story" | "Story & Art" | "Story" | "Art" | "Original Character Design"
                if !is_anime || base.starts_with("Original") => Some(TagCategory::Author),
            "Illustration" => Some(TagCategory::Author),
            _ => None,
        };
        if let Some(c) = cat {
            push(person_name(&e["node"]), c, Some(role.to_string()));
        }
    }
    for st in m["studios"]["nodes"].as_array().into_iter().flatten() {
        push(s(&st["name"]), TagCategory::Studio, Some("Studio".into()));
    }
    for e in m["characters"]["edges"].as_array().into_iter().flatten() {
        if let Some(va) = e["voiceActors"].as_array().and_then(|a| a.first()) {
            push(person_name(va), TagCategory::Cast, Some("Voice".into()));
        }
    }

    Candidate {
        provider: "anilist".into(),
        id: m["id"].as_i64().unwrap_or(0).to_string(),
        title,
        alt_titles: alt,
        kind: Some(kind),
        year: m["startDate"]["year"].as_i64(),
        cover_url: s(&m["coverImage"]["extraLarge"]).or_else(|| s(&m["coverImage"]["large"])),
        banner_url: s(&m["bannerImage"]),
        summary: s(&m["description"]).map(|d| strip_html(&d)),
        people,
        genres: m["genres"].as_array().into_iter().flatten().filter_map(s).collect(),
        series: None,
        url: s(&m["siteUrl"]),
        code: None,
    }
}
