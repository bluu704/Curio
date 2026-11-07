use serde_json::Value;

use super::{agent, first_ok, net};
use crate::models::{Candidate, Kind, Person, TagCategory};
use crate::{Error, Result};

const CDN: &str = "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps";

pub fn app_id_from_url(s: &str) -> Option<String> {
    let re = regex::Regex::new(r"store\.steampowered\.com/app/(\d+)").unwrap();
    re.captures(s).map(|c| c[1].to_string())
}

pub fn search(q: &str) -> Result<Vec<Candidate>> {
    let v: Value = agent()
        .get("https://store.steampowered.com/api/storesearch/")
        .query("term", q)
        .query("l", "korean")
        .query("cc", "KR")
        .call()
        .map_err(net)?
        .into_json()?;
    Ok(v["items"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|i| i["type"].as_str() == Some("app"))
        .take(8)
        .map(|i| {
            let id = i["id"].as_i64().unwrap_or(0).to_string();
            Candidate {
                provider: "steam".into(),
                cover_url: Some(format!("{CDN}/{id}/header.jpg")),
                url: Some(format!("https://store.steampowered.com/app/{id}")),
                title: i["name"].as_str().unwrap_or("").to_string(),
                kind: Some(Kind::Game),
                id,
                ..Default::default()
            }
        })
        .collect())
}

pub fn fetch(id: &str) -> Result<Candidate> {
    let v: Value = agent()
        .get("https://store.steampowered.com/api/appdetails")
        .query("appids", id)
        .query("l", "korean")
        .call()
        .map_err(net)?
        .into_json()?;
    let d = &v[id]["data"];
    if d.is_null() {
        return Err(Error::NotFound(format!("steam app {id}")));
    }
    let strs = |k: &str| -> Vec<String> { d[k].as_array().into_iter().flatten().filter_map(|x| x.as_str().map(String::from)).collect() };
    let mut people: Vec<Person> =
        strs("developers").into_iter().map(|name| Person { name, category: TagCategory::Studio, role: Some("Developer".into()) }).collect();
    people.extend(strs("publishers").into_iter().map(|name| Person { name, category: TagCategory::Publisher, role: Some("Publisher".into()) }));
    let header = d["header_image"].as_str().map(String::from);
    let year = d["release_date"]["date"].as_str().and_then(|s| {
        regex::Regex::new(r"(19|20)\d{2}").unwrap().find(s).and_then(|m| m.as_str().parse().ok())
    });
    let cover = first_ok(&[format!("{CDN}/{id}/library_600x900_2x.jpg"), format!("{CDN}/{id}/library_600x900.jpg")]).or(header.clone());
    let banner = first_ok(&[format!("{CDN}/{id}/library_hero.jpg")]).or(header);
    Ok(Candidate {
        provider: "steam".into(),
        id: id.into(),
        title: d["name"].as_str().unwrap_or("").to_string(),
        alt_titles: vec![],
        kind: Some(Kind::Game),
        year,
        cover_url: cover,
        banner_url: banner,
        summary: d["short_description"].as_str().map(super::anilist::strip_html),
        people,
        genres: d["genres"].as_array().into_iter().flatten().filter_map(|g| g["description"].as_str().map(String::from)).collect(),
        series: None,
        url: Some(format!("https://store.steampowered.com/app/{id}")),
        code: None,
    })
}
