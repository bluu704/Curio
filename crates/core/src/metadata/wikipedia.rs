//! Wikipedia (ko / en / ja) + Wikidata: the general "internet" source for any kind of work.
//! Search hits come from Wikipedia full-text search; details pull structured credits from Wikidata.
use serde_json::Value;

use super::{agent, net};
use crate::models::{Candidate, Kind, Person, TagCategory};
use crate::{Error, Result};

const LANGS: [&str; 3] = ["ko", "en", "ja"];

fn s(v: &Value) -> Option<String> {
    v.as_str().map(str::trim).filter(|s| !s.is_empty()).map(String::from)
}

fn query_pages(lang: &str, params: &[(&str, &str)]) -> Result<Vec<Value>> {
    let mut req = agent().get(&format!("https://{lang}.wikipedia.org/w/api.php"));
    for (k, v) in [
        ("action", "query"), ("format", "json"), ("prop", "pageimages|extracts|pageprops|info"), ("piprop", "original"),
        ("pilicense", "any"), ("exintro", "1"), ("explaintext", "1"), ("exchars", "600"), ("inprop", "url"), ("redirects", "1"),
    ] {
        req = req.query(k, v);
    }
    for (k, v) in params {
        req = req.query(k, v);
    }
    let v: Value = req.call().map_err(net)?.into_json()?;
    let mut pages: Vec<Value> = v["query"]["pages"].as_object().map(|m| m.values().cloned().collect()).unwrap_or_default();
    pages.sort_by_key(|p| p["index"].as_i64().unwrap_or(0));
    Ok(pages)
}

fn to_candidate(lang: &str, p: &Value) -> Candidate {
    let title = s(&p["title"]).unwrap_or_default();
    let qid = s(&p["pageprops"]["wikibase_item"]).unwrap_or_default();
    Candidate {
        provider: "wikipedia".into(),
        id: format!("{lang}|{qid}|{title}"),
        title,
        cover_url: s(&p["original"]["source"]),
        summary: s(&p["extract"]),
        url: s(&p["fullurl"]),
        ..Default::default()
    }
}

pub fn search(q: &str) -> Result<Vec<Candidate>> {
    let per_lang: Vec<Vec<Candidate>> = std::thread::scope(|sc| {
        let hs: Vec<_> = LANGS
            .iter()
            .map(|lang| sc.spawn(move || query_pages(lang, &[("generator", "search"), ("gsrsearch", q), ("gsrlimit", "3")]).map(|ps| ps.iter().map(|p| to_candidate(lang, p)).collect::<Vec<_>>())))
            .collect();
        hs.into_iter().filter_map(|h| h.join().ok()?.ok()).collect()
    });
    // Same Wikidata item in several languages → keep the first (ko > en > ja).
    let mut out: Vec<Candidate> = vec![];
    for c in per_lang.into_iter().flatten() {
        let qid = c.id.split('|').nth(1).unwrap_or("");
        if qid.is_empty() || !out.iter().any(|o| o.id.split('|').nth(1) == Some(qid)) {
            out.push(c);
        }
    }
    Ok(out)
}

/// Wikidata properties → tag categories.
const PROPS: &[(&str, TagCategory)] = &[
    ("P50", TagCategory::Author),     // author
    ("P170", TagCategory::Author),    // creator
    ("P175", TagCategory::Author),    // performer (music)
    ("P57", TagCategory::Director),   // director
    ("P178", TagCategory::Studio),    // developer
    ("P272", TagCategory::Studio),    // production company
    ("P123", TagCategory::Publisher), // publisher
    ("P449", TagCategory::Publisher), // original broadcaster
    ("P161", TagCategory::Cast),      // cast member
    ("P725", TagCategory::Cast),      // voice actor
    ("P179", TagCategory::Series),    // part of the series
    ("P136", TagCategory::Genre),     // genre
];

fn labels(ids: &[String]) -> Result<std::collections::HashMap<String, String>> {
    let mut out = std::collections::HashMap::new();
    for chunk in ids.chunks(45) {
        let v: Value = agent()
            .get("https://www.wikidata.org/w/api.php")
            .query("action", "wbgetentities")
            .query("format", "json")
            .query("props", "labels")
            .query("languages", "ko|ja|en")
            .query("ids", &chunk.join("|"))
            .call()
            .map_err(net)?
            .into_json()?;
        for (id, e) in v["entities"].as_object().into_iter().flatten() {
            let l = &e["labels"];
            if let Some(name) = s(&l["ko"]["value"]).or_else(|| s(&l["ja"]["value"])).or_else(|| s(&l["en"]["value"])) {
                out.insert(id.clone(), name);
            }
        }
    }
    Ok(out)
}

pub fn fetch(id: &str) -> Result<Candidate> {
    let mut parts = id.splitn(3, '|');
    let (lang, qid, title) = (parts.next().unwrap_or("ko"), parts.next().unwrap_or(""), parts.next().unwrap_or(""));
    let page = query_pages(lang, &[("titles", title)])?.into_iter().next().ok_or_else(|| Error::NotFound(title.into()))?;
    let mut c = to_candidate(lang, &page);
    if qid.is_empty() {
        return Ok(c);
    }
    let v: Value = agent()
        .get("https://www.wikidata.org/w/api.php")
        .query("action", "wbgetentities")
        .query("format", "json")
        .query("props", "claims|labels")
        .query("languages", "ko|ja|en")
        .query("ids", qid)
        .call()
        .map_err(net)?
        .into_json()?;
    let e = &v["entities"][qid];
    if let Some(ko) = s(&e["labels"]["ko"]["value"]) {
        if ko != c.title {
            c.alt_titles.push(std::mem::replace(&mut c.title, ko));
        }
    }
    for l in ["ja", "en"] {
        if let Some(t) = s(&e["labels"][l]["value"]) {
            if t != c.title && !c.alt_titles.contains(&t) {
                c.alt_titles.push(t);
            }
        }
    }
    let claims = &e["claims"];
    let ids_of = |p: &str| -> Vec<String> {
        claims[p].as_array().into_iter().flatten().filter_map(|cl| s(&cl["mainsnak"]["datavalue"]["value"]["id"])).take(6).collect()
    };
    let all: Vec<String> = PROPS.iter().flat_map(|(p, _)| ids_of(p)).collect();
    let names = labels(&all).unwrap_or_default();
    for (p, cat) in PROPS {
        for id in ids_of(p) {
            if let Some(name) = names.get(&id) {
                match cat {
                    TagCategory::Genre => {
                        if !c.genres.contains(name) {
                            c.genres.push(name.clone())
                        }
                    }
                    TagCategory::Series => c.series = c.series.clone().or(Some(name.clone())),
                    _ => {
                        if !c.people.iter().any(|x| &x.name == name) {
                            c.people.push(Person { name: name.clone(), category: *cat, role: Some((*p).into()) })
                        }
                    }
                }
            }
        }
    }
    // P577 publication date / P580 start time → year
    for p in ["P577", "P580", "P571"] {
        if let Some(t) = claims[p][0]["mainsnak"]["datavalue"]["value"]["time"].as_str() {
            c.year = t.get(1..5).and_then(|y| y.parse().ok());
            break;
        }
    }
    // P18 image / P154 logo when the article has none
    if c.cover_url.is_none() {
        for p in ["P18", "P154"] {
            if let Some(f) = s(&claims[p][0]["mainsnak"]["datavalue"]["value"]) {
                c.cover_url = Some(format!("https://commons.wikimedia.org/wiki/Special:FilePath/{}?width=1200", super::urlencode(&f.replace(' ', "_"))));
                break;
            }
        }
    }
    c.kind = None::<Kind>;
    Ok(c)
}
