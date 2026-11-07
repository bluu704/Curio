//! Embeds the Google OAuth client (desktop app type) into the build, so people using the app only
//! click "구글 계정으로 연결" — nobody has to handle a client_secret file.
//!
//! Put the JSON downloaded from Google Cloud ("client_secret_….json", or renamed to
//! "google-oauth.json") in the repository root before building. Both names are git-ignored, so the
//! file never reaches GitHub. Alternatively set CURIO_GOOGLE_CLIENT_ID / CURIO_GOOGLE_CLIENT_SECRET.
use std::path::Path;

fn main() {
    println!("cargo:rerun-if-env-changed=CURIO_GOOGLE_CLIENT_ID");
    println!("cargo:rerun-if-env-changed=CURIO_GOOGLE_CLIENT_SECRET");
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    println!("cargo:rerun-if-changed={}", root.display());
    if std::env::var("CURIO_GOOGLE_CLIENT_ID").is_ok() {
        return; // explicit env vars win; option_env! reads them directly
    }
    let Ok(entries) = std::fs::read_dir(&root) else { return };
    let mut files: Vec<_> = entries
        .flatten()
        .map(|e| e.path())
        .filter(|p| {
            let n = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
            n == "google-oauth.json" || (n.starts_with("client_secret") && n.ends_with(".json"))
        })
        .collect();
    files.sort();
    for f in files {
        println!("cargo:rerun-if-changed={}", f.display());
        let Ok(text) = std::fs::read_to_string(&f) else { continue };
        let (Some(id), Some(secret)) = (field(&text, "client_id"), field(&text, "client_secret")) else { continue };
        println!("cargo:rustc-env=CURIO_GOOGLE_CLIENT_ID={id}");
        println!("cargo:rustc-env=CURIO_GOOGLE_CLIENT_SECRET={secret}");
        return;
    }
}

/// `"key": "value"` from the JSON text (no JSON crate needed in a build script).
fn field(json: &str, key: &str) -> Option<String> {
    let at = json.find(&format!("\"{key}\""))?;
    let rest = &json[at + key.len() + 2..];
    let start = rest.find('"')? + 1;
    let end = rest[start..].find('"')?;
    Some(rest[start..start + end].to_string())
}
