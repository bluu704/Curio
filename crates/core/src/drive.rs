//! Google Drive: one-click sign-in (OAuth for desktop apps, PKCE + loopback redirect), reading
//! folders, downloading files, and folder colours.
//!
//! Drive folders take one of 24 colours (`folderColorRgb`; any other value is snapped to the nearest).
//! Curio folders use named presets ("red", "teal"…) or any "#rrggbb". These functions translate both
//! ways so a Curio folder and its linked Drive folder show the same colour, and talk to the Drive API
//! with an OAuth access token (obtained by the login flow).
use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use base64::Engine as _;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

use crate::metadata::{agent, net, urlencode};
use crate::{Error, Result};

// ---------------------------------------------------------------- sign-in (OAuth for desktop apps)

/// Google OAuth client of type "desktop app". For installed apps Google does not treat the secret as
/// confidential, but we still keep it out of the repository (see build.rs).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OAuthClient {
    pub client_id: String,
    pub client_secret: String,
}

/// The client built into this copy of the app, if one was provided at build time.
pub fn builtin_client() -> Option<OAuthClient> {
    match (option_env!("CURIO_GOOGLE_CLIENT_ID"), option_env!("CURIO_GOOGLE_CLIENT_SECRET")) {
        (Some(id), Some(secret)) if !id.is_empty() => Some(OAuthClient { client_id: id.into(), client_secret: secret.into() }),
        _ => None,
    }
}

/// Read-only access to Drive files + the account's e-mail address (shown as "연결됨: …").
/// Read access to the user's Drive files, the app's own hidden folder (library sync) and the e-mail address.
pub const SCOPES: &str = "openid email https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.appdata";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Tokens {
    pub refresh_token: String,
    pub access_token: String,
    /// unix seconds
    pub expires_at: i64,
    pub email: Option<String>,
}

fn now_secs() -> i64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0)
}

/// PKCE pair (RFC 7636): random verifier and its S256 challenge.
pub fn pkce() -> (String, String) {
    let verifier = format!("{}{}", uuid::Uuid::new_v4().simple(), uuid::Uuid::new_v4().simple());
    (verifier.clone(), challenge(&verifier))
}
fn challenge(verifier: &str) -> String {
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}

pub fn auth_url(client: &OAuthClient, redirect: &str, challenge: &str, state: &str) -> String {
    format!(
        "https://accounts.google.com/o/oauth2/v2/auth?client_id={}&redirect_uri={}&response_type=code&scope={}&code_challenge={}&code_challenge_method=S256&state={}&access_type=offline&prompt=consent",
        urlencode(&client.client_id), urlencode(redirect), urlencode(SCOPES), challenge, state
    )
}

/// `code` from the browser's redirect ("GET /?state=…&code=…"), checking `state`.
pub fn parse_callback(request_line: &str, state: &str) -> Result<String> {
    let target = request_line.split_whitespace().nth(1).unwrap_or("");
    let query = target.split_once('?').map(|(_, q)| q).unwrap_or("");
    let get = |k: &str| query.split('&').find_map(|kv| kv.split_once('=').filter(|(a, _)| *a == k).map(|(_, v)| v.to_string()));
    if let Some(e) = get("error") {
        return Err(Error::Invalid(if e == "access_denied" { "로그인을 취소했어요".into() } else { format!("Google 로그인 오류: {e}") }));
    }
    if get("state").as_deref() != Some(state) {
        return Err(Error::Invalid("로그인 응답이 이 요청과 맞지 않아요".into()));
    }
    get("code").map(|c| c.replace("%2F", "/")).ok_or_else(|| Error::Invalid("로그인 응답에 코드가 없어요".into()))
}

const DONE_PAGE: &str = "<!doctype html><meta charset=utf-8><title>Curio</title><body style=\"font-family:system-ui;display:grid;place-items:center;height:90vh;color:#444\"><div style=\"text-align:center\"><h2>연결됐어요</h2><p>이 창을 닫고 Curio로 돌아가세요.</p></div>";
const FAIL_PAGE: &str = "<!doctype html><meta charset=utf-8><title>Curio</title><body style=\"font-family:system-ui;display:grid;place-items:center;height:90vh;color:#444\"><div style=\"text-align:center\"><h2>연결하지 못했어요</h2><p>Curio로 돌아가 다시 시도해 주세요.</p></div>";

/// Full sign-in: listen on 127.0.0.1, open the Google page in the browser, wait for the redirect
/// (up to 5 minutes), then trade the code for tokens.
pub fn login(client: &OAuthClient, open_browser: &dyn Fn(&str) -> Result<()>) -> Result<Tokens> {
    let listener = TcpListener::bind(("127.0.0.1", 0))?;
    let redirect = format!("http://127.0.0.1:{}", listener.local_addr()?.port());
    let (verifier, ch) = pkce();
    let state = uuid::Uuid::new_v4().simple().to_string();
    open_browser(&auth_url(client, &redirect, &ch, &state))?;

    listener.set_nonblocking(true)?;
    let deadline = Instant::now() + Duration::from_secs(300);
    let code = loop {
        match listener.accept() {
            Ok((stream, _)) => {
                stream.set_nonblocking(false)?;
                stream.set_read_timeout(Some(Duration::from_secs(5)))?;
                let mut line = String::new();
                BufReader::new(&stream).read_line(&mut line)?;
                if line.starts_with("GET /favicon") {
                    continue;
                }
                let res = parse_callback(&line, &state);
                let page = if res.is_ok() { DONE_PAGE } else { FAIL_PAGE };
                let mut s = &stream;
                let _ = write!(s, "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{page}", page.len());
                break res?;
            }
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                if Instant::now() > deadline {
                    return Err(Error::Invalid("로그인 시간이 지났어요. 다시 시도해 주세요".into()));
                }
                std::thread::sleep(Duration::from_millis(150));
            }
            Err(e) => return Err(e.into()),
        }
    };
    let v = token_request(&[
        ("client_id", &client.client_id), ("client_secret", &client.client_secret), ("code", &code),
        ("code_verifier", &verifier), ("grant_type", "authorization_code"), ("redirect_uri", &redirect),
    ])?;
    let refresh = v["refresh_token"].as_str().ok_or_else(|| Error::Invalid("Google이 갱신 토큰을 주지 않았어요".into()))?.to_string();
    let access = v["access_token"].as_str().unwrap_or_default().to_string();
    let email = account_email(&access).ok();
    Ok(Tokens { refresh_token: refresh, access_token: access, expires_at: now_secs() + v["expires_in"].as_i64().unwrap_or(3600) - 60, email })
}

fn token_request(form: &[(&str, &str)]) -> Result<Value> {
    let body = form.iter().map(|(k, v)| format!("{k}={}", urlencode(v))).collect::<Vec<_>>().join("&");
    match agent().post("https://oauth2.googleapis.com/token").set("Content-Type", "application/x-www-form-urlencoded").send_string(&body) {
        Ok(r) => Ok(r.into_json()?),
        Err(ureq::Error::Status(_, r)) => {
            let v: Value = r.into_json().unwrap_or_default();
            let e = v["error"].as_str().unwrap_or("unknown");
            Err(Error::Invalid(if e == "invalid_grant" { "드라이브 연결이 만료됐어요. 다시 연결해 주세요".into() } else { format!("Google 토큰 오류: {e}") }))
        }
        Err(e) => Err(net(e)),
    }
}

/// Fresh access token from the stored refresh token (call when `expires_at` has passed).
pub fn refresh(client: &OAuthClient, t: &Tokens) -> Result<Tokens> {
    let v = token_request(&[("client_id", &client.client_id), ("client_secret", &client.client_secret), ("refresh_token", &t.refresh_token), ("grant_type", "refresh_token")])?;
    Ok(Tokens {
        access_token: v["access_token"].as_str().unwrap_or_default().to_string(),
        expires_at: now_secs() + v["expires_in"].as_i64().unwrap_or(3600) - 60,
        ..t.clone()
    })
}
impl Tokens {
    pub fn expired(&self) -> bool {
        now_secs() >= self.expires_at
    }
}

/// Sign out: Google forgets the permission too.
pub fn revoke(t: &Tokens) {
    let _ = agent().post("https://oauth2.googleapis.com/revoke").set("Content-Type", "application/x-www-form-urlencoded").send_string(&format!("token={}", urlencode(&t.refresh_token)));
}

fn account_email(access: &str) -> Result<String> {
    let v: Value = agent().get("https://openidconnect.googleapis.com/v1/userinfo").set("Authorization", &format!("Bearer {access}")).call().map_err(net)?.into_json()?;
    v["email"].as_str().map(String::from).ok_or_else(|| Error::NotFound("email".into()))
}

// ---------------------------------------------------------------- files

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DriveFile {
    pub id: String,
    pub name: String,
    pub mime_type: String,
    pub size: Option<i64>,
    pub modified: Option<String>,
    pub is_folder: bool,
}

/// Folder id from a Drive link ("…/folders/<id>", "?id=<id>") or a bare id.
pub fn folder_id(link: &str) -> Option<String> {
    let re = regex::Regex::new(r"(?:folders/|[?&]id=)([A-Za-z0-9_-]{10,})").unwrap();
    re.captures(link).map(|c| c[1].to_string()).or_else(|| {
        let t = link.trim();
        (t.len() >= 10 && t.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')).then(|| t.to_string())
    })
}

/// Name of a folder (also checks it is one and that this account can see it).
pub fn folder_name(access: &str, id: &str) -> Result<String> {
    let v = get_json(access, &format!("{API}/{id}"), &[("fields", "name,mimeType"), ("supportsAllDrives", "true")])?;
    if v["mimeType"].as_str() != Some("application/vnd.google-apps.folder") {
        return Err(Error::Invalid("드라이브 폴더 주소가 아니에요".into()));
    }
    Ok(v["name"].as_str().unwrap_or("폴더").to_string())
}

/// Everything directly inside a folder (all pages).
pub fn list_folder(access: &str, id: &str) -> Result<Vec<DriveFile>> {
    let mut out = vec![];
    let mut page: Option<String> = None;
    loop {
        let q = format!("'{id}' in parents and trashed = false");
        let mut params = vec![("q", q.as_str()), ("fields", "nextPageToken,files(id,name,mimeType,size,modifiedTime)"), ("pageSize", "1000"),
            ("supportsAllDrives", "true"), ("includeItemsFromAllDrives", "true"), ("orderBy", "name_natural")];
        if let Some(p) = page.as_deref() {
            params.push(("pageToken", p));
        }
        let v = get_json(access, API, &params)?;
        for f in v["files"].as_array().into_iter().flatten() {
            let mime = f["mimeType"].as_str().unwrap_or("").to_string();
            out.push(DriveFile {
                id: f["id"].as_str().unwrap_or("").into(),
                name: f["name"].as_str().unwrap_or("").into(),
                is_folder: mime == "application/vnd.google-apps.folder",
                size: f["size"].as_str().and_then(|s| s.parse().ok()),
                modified: f["modifiedTime"].as_str().map(String::from),
                mime_type: mime,
            });
        }
        page = v["nextPageToken"].as_str().map(String::from);
        if page.is_none() {
            return Ok(out);
        }
    }
}

/// Download a file to `dest` (streamed, written atomically). Google Docs/Sheets are skipped by callers.
pub fn download(access: &str, file: &DriveFile, dest: &Path) -> Result<PathBuf> {
    if let Some(d) = dest.parent() {
        std::fs::create_dir_all(d)?;
    }
    let res = agent()
        .get(&format!("{API}/{}", file.id))
        .query("alt", "media")
        .query("supportsAllDrives", "true")
        .set("Authorization", &format!("Bearer {access}"))
        .timeout(Duration::from_secs(60 * 60))
        .call()
        .map_err(net)?;
    let tmp = dest.with_extension("part");
    let mut w = std::fs::File::create(&tmp)?;
    std::io::copy(&mut res.into_reader().take(u64::MAX), &mut w)?;
    w.flush()?;
    std::fs::rename(&tmp, dest)?;
    Ok(dest.to_path_buf())
}

fn get_json(access: &str, url: &str, params: &[(&str, &str)]) -> Result<Value> {
    let mut r = agent().get(url).set("Authorization", &format!("Bearer {access}"));
    for (k, v) in params {
        r = r.query(k, v);
    }
    match r.call() {
        Ok(r) => Ok(r.into_json()?),
        Err(ureq::Error::Status(404, _)) => Err(Error::NotFound("드라이브에서 찾을 수 없어요 (주소나 공유 권한을 확인해 주세요)".into())),
        Err(e @ ureq::Error::Status(403, _)) => Err(scope_err(e)),
        Err(e) => Err(net(e)),
    }
}

// ---------------------------------------------------------------- app folder (library sync)

/// A file in the app's hidden Drive folder (invisible in the user's Drive, removed with the app's access).
#[derive(Debug, Clone)]
pub struct AppFile {
    pub id: String,
    pub name: String,
}

pub fn appdata_list(access: &str) -> Result<Vec<AppFile>> {
    let mut out = vec![];
    let mut page: Option<String> = None;
    loop {
        let mut params = vec![("spaces", "appDataFolder"), ("fields", "nextPageToken,files(id,name)"), ("pageSize", "1000")];
        if let Some(p) = page.as_deref() {
            params.push(("pageToken", p));
        }
        let v = get_json(access, API, &params)?;
        for f in v["files"].as_array().into_iter().flatten() {
            out.push(AppFile { id: f["id"].as_str().unwrap_or("").into(), name: f["name"].as_str().unwrap_or("").into() });
        }
        page = v["nextPageToken"].as_str().map(String::from);
        if page.is_none() {
            return Ok(out);
        }
    }
}

pub fn appdata_get(access: &str, id: &str) -> Result<Vec<u8>> {
    let r = agent().get(&format!("{API}/{id}")).query("alt", "media").set("Authorization", &format!("Bearer {access}")).call().map_err(scope_err)?;
    let mut b = vec![];
    r.into_reader().read_to_end(&mut b)?;
    Ok(b)
}

/// Create (or replace, when `existing` is given) a file in the app folder.
pub fn appdata_put(access: &str, name: &str, bytes: &[u8], existing: Option<&str>) -> Result<String> {
    let auth = format!("Bearer {access}");
    let v: Value = if let Some(id) = existing {
        agent().request("PATCH", &format!("https://www.googleapis.com/upload/drive/v3/files/{id}"))
            .query("uploadType", "media").set("Authorization", &auth).set("Content-Type", "application/octet-stream")
            .send_bytes(bytes).map_err(scope_err)?.into_json()?
    } else {
        let boundary = format!("curio{}", uuid::Uuid::new_v4().simple());
        let meta = json!({ "name": name, "parents": ["appDataFolder"] }).to_string();
        let mut body = format!("--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{meta}\r\n--{boundary}\r\nContent-Type: application/octet-stream\r\n\r\n").into_bytes();
        body.extend_from_slice(bytes);
        body.extend_from_slice(format!("\r\n--{boundary}--").as_bytes());
        agent().post("https://www.googleapis.com/upload/drive/v3/files")
            .query("uploadType", "multipart").set("Authorization", &auth)
            .set("Content-Type", &format!("multipart/related; boundary={boundary}"))
            .send_bytes(&body).map_err(scope_err)?.into_json()?
    };
    Ok(v["id"].as_str().unwrap_or_default().to_string())
}

/// Upload a file from disk to the app folder. Small files go in one request; bigger ones use a
/// resumable session and are streamed from disk (no size cap, no whole-file copy in memory).
pub fn appdata_put_path(access: &str, name: &str, path: &Path) -> Result<String> {
    let len = std::fs::metadata(path)?.len();
    if len <= 5 * 1024 * 1024 {
        return appdata_put(access, name, &std::fs::read(path)?, None);
    }
    let auth = format!("Bearer {access}");
    let meta = json!({ "name": name, "parents": ["appDataFolder"] }).to_string();
    let start = agent().post("https://www.googleapis.com/upload/drive/v3/files")
        .query("uploadType", "resumable").set("Authorization", &auth)
        .set("Content-Type", "application/json; charset=UTF-8")
        .set("X-Upload-Content-Type", "application/octet-stream")
        .set("X-Upload-Content-Length", &len.to_string())
        .send_string(&meta).map_err(scope_err)?;
    let Some(session) = start.header("Location").map(String::from) else {
        return Err(Error::Network("Drive did not start the upload".into()));
    };
    // no overall timeout: a large file takes as long as the connection needs
    let slow = ureq::AgentBuilder::new().timeout_connect(Duration::from_secs(15)).timeout_read(Duration::from_secs(120))
        .timeout_write(Duration::from_secs(120)).try_proxy_from_env(true).build();
    let v: Value = slow.put(&session).set("Content-Length", &len.to_string()).set("Content-Type", "application/octet-stream")
        .send(std::fs::File::open(path)?).map_err(scope_err)?.into_json()?;
    Ok(v["id"].as_str().unwrap_or_default().to_string())
}

pub fn appdata_delete(access: &str, id: &str) -> Result<()> {
    match agent().delete(&format!("{API}/{id}")).set("Authorization", &format!("Bearer {access}")).call() {
        Ok(_) | Err(ureq::Error::Status(404, _)) => Ok(()),
        Err(e) => Err(scope_err(e)),
    }
}

/// 403 on the app folder = signed in before sync existed (permission missing).
fn scope_err(e: ureq::Error) -> Error {
    match e {
        ureq::Error::Status(403, r) => {
            let body = r.into_string().unwrap_or_default();
            Error::Invalid(if ["accessNotConfigured", "SERVICE_DISABLED", "has not been used", "is disabled"].iter().any(|k| body.contains(k)) {
                "Google Cloud에서 Google Drive API를 사용 설정해 주세요".into()
            } else if body.contains("nsufficient") || body.contains("SCOPE_INSUFFICIENT") {
                "다시 연결하면서 드라이브 권한을 체크해 주세요".into()
            } else {
                format!("드라이브에서 거절했어요 (403): {}", body.chars().take(200).collect::<String>())
            })
        }
        e => net(e),
    }
}

// ---------------------------------------------------------------- folder colours

/// Drive's folder colour palette (About.folderColorPalette).
pub const DRIVE_PALETTE: [&str; 24] = [
    "#ac725e", "#d06b64", "#f83a22", "#fa573c", "#ff7537", "#ffad46", "#42d692", "#16a765",
    "#7bd148", "#b3dc6c", "#fbe983", "#fad165", "#92e1c0", "#9fe1e7", "#9fc6e7", "#4986e7",
    "#9a9cff", "#b99aff", "#8f8f8f", "#cabdbf", "#cca6ac", "#f691b2", "#cd74e6", "#a47ae2",
];
/// Drive's colour for folders that were never coloured.
pub const DRIVE_DEFAULT: &str = "#8f8f8f";

/// Curio's named folder colours (same values as the app's palette).
const CURIO_PRESETS: [(&str, &str); 9] = [
    ("red", "#ef4444"), ("amber", "#eab308"), ("green", "#22c55e"), ("teal", "#14b8a6"), ("blue", "#3b82f6"),
    ("violet", "#8b5cf6"), ("pink", "#ec4899"), ("slate", "#78716c"), ("orange", "#f97316"),
];
/// Fixed Drive colour for each Curio preset (distinct, so presets survive a round trip).
const PRESET_TO_DRIVE: [(&str, &str); 9] = [
    ("red", "#f83a22"), ("orange", "#ff7537"), ("amber", "#fad165"), ("green", "#16a765"), ("teal", "#92e1c0"),
    ("blue", "#4986e7"), ("violet", "#a47ae2"), ("pink", "#f691b2"), ("slate", "#cabdbf"),
];
/// Colour of a Curio folder without a colour.
const CURIO_DEFAULT: &str = "#f59e0b";

fn rgb(hex: &str) -> Option<(f64, f64, f64)> {
    let h = hex.trim().trim_start_matches('#');
    if h.len() != 6 {
        return None;
    }
    let n = u32::from_str_radix(h, 16).ok()?;
    Some((((n >> 16) & 255) as f64, ((n >> 8) & 255) as f64, (n & 255) as f64))
}

/// Perceptual-ish distance ("redmean"), good enough to pick the closest palette colour.
fn dist(a: (f64, f64, f64), b: (f64, f64, f64)) -> f64 {
    let rm = (a.0 + b.0) / 2.0;
    let (dr, dg, db) = (a.0 - b.0, a.1 - b.1, a.2 - b.2);
    ((2.0 + rm / 256.0) * dr * dr + 4.0 * dg * dg + (2.0 + (255.0 - rm) / 256.0) * db * db).sqrt()
}

fn nearest<'a>(hex: &str, among: impl Iterator<Item = &'a str>) -> Option<&'a str> {
    let c = rgb(hex)?;
    among.filter_map(|p| rgb(p).map(|x| (p, dist(c, x)))).min_by(|a, b| a.1.total_cmp(&b.1)).map(|(p, _)| p)
}

/// "#rrggbb" of a Curio folder colour value (preset name, hex, or none).
pub fn curio_hex(color: Option<&str>) -> String {
    match color {
        None | Some("") => CURIO_DEFAULT.into(),
        Some(c) => CURIO_PRESETS.iter().find(|(n, _)| *n == c).map(|(_, h)| h.to_string()).unwrap_or_else(|| c.to_lowercase()),
    }
}

/// Drive colour for a Curio folder colour.
pub fn to_drive(color: Option<&str>) -> &'static str {
    if color.is_none_or(str::is_empty) {
        return DRIVE_DEFAULT;
    }
    if let Some((_, d)) = PRESET_TO_DRIVE.iter().find(|(n, _)| Some(*n) == color) {
        return d;
    }
    nearest(&curio_hex(color), DRIVE_PALETTE.iter().copied()).unwrap_or(DRIVE_DEFAULT)
}

/// Curio colour for a Drive folder colour: the closest preset name, or None for Drive's grey default.
/// `current` is kept when it already maps to the same Drive colour, so custom colours survive a round trip.
pub fn from_drive(drive: &str, current: Option<&str>) -> Option<String> {
    let d = drive.to_lowercase();
    if d == DRIVE_DEFAULT || rgb(&d).is_none() {
        return None;
    }
    if current.is_some() && to_drive(current) == nearest(&d, DRIVE_PALETTE.iter().copied()).unwrap_or("") {
        return current.map(String::from);
    }
    // a preset's own Drive colour → that preset; any other Drive colour → the closest preset
    let snapped = nearest(&d, DRIVE_PALETTE.iter().copied()).unwrap_or(DRIVE_DEFAULT);
    if let Some((n, _)) = PRESET_TO_DRIVE.iter().find(|(_, x)| *x == snapped) {
        return Some(n.to_string());
    }
    nearest(&d, CURIO_PRESETS.iter().map(|(_, h)| *h))
        .and_then(|h| CURIO_PRESETS.iter().find(|(_, x)| *x == h))
        .map(|(n, _)| n.to_string())
}

// ---------------------------------------------------------------- Drive API

const API: &str = "https://www.googleapis.com/drive/v3/files";

/// Colour of a Drive folder (as Drive reports it).
pub fn folder_color(token: &str, folder_id: &str) -> Result<String> {
    let v: Value = agent()
        .get(&format!("{API}/{folder_id}"))
        .query("fields", "folderColorRgb,mimeType")
        .query("supportsAllDrives", "true")
        .set("Authorization", &format!("Bearer {token}"))
        .call()
        .map_err(net)?
        .into_json()?;
    if v["mimeType"].as_str() != Some("application/vnd.google-apps.folder") {
        return Err(Error::Invalid("not a Drive folder".into()));
    }
    Ok(v["folderColorRgb"].as_str().unwrap_or(DRIVE_DEFAULT).to_string())
}

/// Give a Drive folder the colour of a Curio folder. Returns the colour Drive stored.
pub fn set_folder_color(token: &str, folder_id: &str, curio_color: Option<&str>) -> Result<String> {
    let v: Value = agent()
        .request("PATCH", &format!("{API}/{folder_id}"))
        .query("fields", "folderColorRgb")
        .query("supportsAllDrives", "true")
        .set("Authorization", &format!("Bearer {token}"))
        .set("Content-Type", "application/json")
        .send_string(&json!({ "folderColorRgb": to_drive(curio_color) }).to_string())
        .map_err(net)?
        .into_json()?;
    Ok(v["folderColorRgb"].as_str().unwrap_or_default().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn oauth_pieces() {
        // RFC 7636 appendix B test vector
        assert_eq!(challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
        let (v, c) = pkce();
        assert!(v.len() >= 43 && c.len() == 43);
        assert_eq!(parse_callback("GET /?state=abc&code=4%2F0AX&scope=email HTTP/1.1", "abc").unwrap(), "4/0AX");
        assert!(parse_callback("GET /?state=zzz&code=1 HTTP/1.1", "abc").is_err());
        assert!(parse_callback("GET /?error=access_denied&state=abc HTTP/1.1", "abc").unwrap_err().to_string().contains("취소"));
        let url = auth_url(&OAuthClient { client_id: "id.apps.googleusercontent.com".into(), client_secret: "x".into() }, "http://127.0.0.1:5000", "CH", "ST");
        assert!(url.contains("redirect_uri=http%3A%2F%2F127.0.0.1%3A5000") && url.contains("code_challenge=CH") && url.contains("drive.readonly"));
        assert_eq!(folder_id("https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOp?usp=sharing").as_deref(), Some("1AbCdEfGhIjKlMnOp"));
        assert_eq!(folder_id("https://drive.google.com/open?id=1AbCdEfGhIjKl").as_deref(), Some("1AbCdEfGhIjKl"));
        assert_eq!(folder_id("not a link"), None);
    }

    #[test]
    fn colour_mapping() {
        assert_eq!(to_drive(None), DRIVE_DEFAULT);
        assert_eq!(to_drive(Some("red")), "#f83a22");
        assert_eq!(to_drive(Some("blue")), "#4986e7");
        assert_eq!(to_drive(Some("green")), "#16a765");
        assert_eq!(to_drive(Some("#0ea5e9")), "#4986e7");
        // every preset survives a round trip through Drive
        for (name, _) in CURIO_PRESETS {
            assert_eq!(from_drive(to_drive(Some(name)), None).as_deref(), Some(name), "{name} → {}", to_drive(Some(name)));
        }
        // a custom colour is kept when Drive still shows "its" colour, replaced when Drive was changed
        assert_eq!(from_drive("#4986e7", Some("#0ea5e9")).as_deref(), Some("#0ea5e9"));
        assert_eq!(from_drive("#f83a22", Some("#0ea5e9")).as_deref(), Some("red"));
        assert_eq!(from_drive(DRIVE_DEFAULT, Some("red")), None);
    }

    /// Browser stand-in: follows the auth URL's redirect with a made-up code. Google then refuses
    /// the code, which shows the loopback listener, state check and token request all ran.
    #[test]
    #[ignore = "network"]
    fn live_login_loop() {
        let client = OAuthClient { client_id: "000-test.apps.googleusercontent.com".into(), client_secret: "x".into() };
        let err = login(&client, &|url: &str| {
            let q = |k: &str| url.split(&format!("{k}=")).nth(1).and_then(|r| r.split('&').next()).unwrap_or("").to_string();
            let redirect = q("redirect_uri").replace("%3A", ":").replace("%2F", "/");
            let state = q("state");
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_millis(200));
                let addr = redirect.trim_start_matches("http://");
                let mut s = std::net::TcpStream::connect(addr).unwrap();
                write!(s, "GET /?state={state}&code=fake HTTP/1.1\r\nHost: x\r\n\r\n").unwrap();
                let mut page = String::new();
                let _ = s.read_to_string(&mut page);
                assert!(page.contains("연결됐어요"), "{page}");
            });
            Ok(())
        })
        .unwrap_err();
        assert!(err.to_string().contains("Google 토큰 오류") || err.to_string().contains("만료"), "{err}");
    }
}
