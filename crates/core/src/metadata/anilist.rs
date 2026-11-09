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
  id siteUrl type format countryOfOrigin season seasonYear episodes chapters volumes duration source status
  startDate { year month day }
  title { romaji english native } synonyms
  coverImage { extraLarge large } bannerImage
  description(asHtml: false) genres
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

    // "TV · 2023 가을 · 28화" / "극장판" — tells seasons, cours and movies apart
    let fmt = match m["format"].as_str().unwrap_or("") {
        "TV" => "TV", "TV_SHORT" => "TV 단편", "MOVIE" => "극장판", "SPECIAL" => "스페셜", "OVA" => "OVA", "ONA" => "ONA",
        "MUSIC" => "뮤직비디오", "MANGA" => "만화", "NOVEL" => "소설", "ONE_SHOT" => "단편", _ => "",
    };
    let season = match m["season"].as_str().unwrap_or("") { "WINTER" => "겨울", "SPRING" => "봄", "SUMMER" => "여름", "FALL" => "가을", _ => "" };
    let when = m["seasonYear"].as_i64().map(|y| if season.is_empty() { format!("{y}") } else { format!("{y} {season}") });
    let count = m["episodes"].as_i64().map(|e| format!("{e}화")).or_else(|| m["volumes"].as_i64().map(|v| format!("{v}권")));
    let detail = [Some(fmt.to_string()).filter(|x| !x.is_empty()), when.clone(), count].into_iter().flatten().collect::<Vec<_>>().join(" · ");
    let series = series_name(s(&t["english"]).or_else(|| s(&t["romaji"])).as_deref().unwrap_or(""));

    Candidate {
        detail: Some(detail).filter(|d| !d.is_empty()),
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
        series,
        url: s(&m["siteUrl"]),
        code: None,
        extra: {
            let mut x = std::collections::BTreeMap::new();
            let mut put = |k: &str, v: Option<String>| { if let Some(v) = v.filter(|v| !v.is_empty()) { x.insert(k.to_string(), v); } };
            put("format", Some(fmt.to_string()));
            put("episodes", m["episodes"].as_i64().map(|e| e.to_string()));
            put("chapters", m["chapters"].as_i64().map(|e| e.to_string()));
            put("volumes", m["volumes"].as_i64().map(|e| e.to_string()));
            put("duration", m["duration"].as_i64().map(|d| format!("{d}분")));
            put("season", when.clone());
            put("source", m["source"].as_str().map(|v| match v {
                "ORIGINAL" => "오리지널", "MANGA" => "만화", "LIGHT_NOVEL" => "라이트노벨", "WEB_NOVEL" => "웹소설", "NOVEL" => "소설",
                "VISUAL_NOVEL" => "비주얼 노벨", "VIDEO_GAME" => "게임", "WEB_MANGA" => "웹툰", "OTHER" => "기타", other => other,
            }.to_string()));
            put("airing", m["status"].as_str().map(|v| match v {
                "FINISHED" => "완결", "RELEASING" => "연재·방영 중", "NOT_YET_RELEASED" => "공개 예정", "CANCELLED" => "중단", "HIATUS" => "휴재", other => other,
            }.to_string()));
            put("studio", m["studios"]["nodes"].as_array().map(|a| a.iter().filter_map(|n| n["name"].as_str()).collect::<Vec<_>>().join(", ")));
            put("release", { let d = &m["startDate"]; d["year"].as_i64().map(|y| match (d["month"].as_i64(), d["day"].as_i64()) { (Some(mo), Some(da)) => format!("{y}-{mo:02}-{da:02}"), _ => y.to_string() }) });
            x
        },
    }
}

/// Franchise name shared by every season / cour / movie: strips "Season 2", "2nd Season", "Part 2", "Movie", ": subtitle"…
/// e.g. "Attack on Titan Season 3 Part 2" → "Attack on Titan", "Frieren: Beyond Journey's End" → "Frieren".
pub fn series_name(title: &str) -> Option<String> {
    let re = regex::Regex::new(r"(?i)\s*(:|-|–)\s.*$|\s+(season|part|cour)\s*\d+.*$|\s+\d+(st|nd|rd|th)\s+season.*$|\s+(the\s+)?movie.*$|\s+(the\s+)?final(\s+season)?.*$|\s+(ii+|iv|v|\d+)$|\s*\(\d{4}\)$").unwrap();
    let base = re.replace_all(title.trim(), "").trim().to_string();
    (!base.is_empty()).then_some(base)
}

#[cfg(test)]
mod series_tests {
    use super::series_name;
    #[test]
    fn franchise_names() {
        for (t, want) in [
            ("Attack on Titan Season 3 Part 2", "Attack on Titan"),
            ("Attack on Titan Final Season", "Attack on Titan"),
            ("Frieren: Beyond Journey's End", "Frieren"),
            ("Mushoku Tensei II", "Mushoku Tensei"),
            ("Demon Slayer the Movie: Mugen Train", "Demon Slayer"),
            ("Spy x Family Season 2", "Spy x Family"),
        ] {
            assert_eq!(series_name(t).as_deref(), Some(want), "{t}");
        }
    }
}
