//! Google Play (games / apps). No public API — parses the store's HTML (best effort).
use regex::Regex;

use super::{agent, net};
use crate::models::{Candidate, Kind, Person, TagCategory};
use crate::Result;

fn page(url: &str) -> Result<String> {
    Ok(agent().get(url).set("Accept-Language", "ko-KR,ko;q=0.9").call().map_err(net)?.into_string()?)
}

fn meta(html: &str, key: &str) -> Option<String> {
    let re = Regex::new(&format!(r#"<meta (?:property|name)="{key}" content="([^"]+)""#)).unwrap();
    re.captures(html).map(|c| html_unescape(&c[1]))
}

fn html_unescape(s: &str) -> String {
    s.replace("&amp;", "&").replace("&quot;", "\"").replace("&#39;", "'").replace("&lt;", "<").replace("&gt;", ">")
}

/// Search → top app ids → details for each (in parallel).
pub fn search(q: &str) -> Result<Vec<Candidate>> {
    let url = format!("https://play.google.com/store/search?q={}&c=apps&hl=ko&gl=KR", super::urlencode(q));
    let html = page(&url)?;
    let re = Regex::new(r"/store/apps/details\?id=([A-Za-z0-9._]+)").unwrap();
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
        let hs: Vec<_> = ids.iter().map(|id| sc.spawn(move || fetch(id))).collect();
        hs.into_iter().filter_map(|h| h.join().ok()?.ok()).collect()
    }))
}

pub fn fetch(id: &str) -> Result<Candidate> {
    let url = format!("https://play.google.com/store/apps/details?id={id}&hl=ko&gl=KR");
    let html = page(&url)?;
    let title = meta(&html, "og:title").map(|t| t.trim_end_matches(" - Google Play 앱").trim_end_matches(" - Apps on Google Play").to_string()).unwrap_or_default();
    // og:image = icon, twitter:image = feature graphic (wide) → ask for large sizes
    let icon = meta(&html, "og:image").map(|u| format!("{}=s1024", u.split('=').next().unwrap_or(&u)));
    let banner = meta(&html, "twitter:image").map(|u| format!("{}=w1920", u.split('=').next().unwrap_or(&u)));
    let dev = Regex::new(r#"href="/store/apps/dev(?:eloper)?\?id=[^"]+"[^>]*>(?:<[^>]+>)*([^<]+)"#).unwrap().captures(&html).map(|c| html_unescape(c[1].trim()));
    Ok(Candidate {
        provider: "googleplay".into(),
        id: id.into(),
        title,
        kind: Some(Kind::Game),
        cover_url: icon,
        banner_url: banner,
        summary: meta(&html, "og:description").or_else(|| meta(&html, "description")),
        people: dev.into_iter().map(|name| Person { name, category: TagCategory::Studio, role: Some("Developer".into()) }).collect(),
        url: Some(format!("https://play.google.com/store/apps/details?id={id}")),
        ..Default::default()
    })
}
