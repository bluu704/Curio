//! curio-server — same `Library`, served over HTTP.
//!
//!   CURIO_DB=./curio.db CURIO_CACHE=./cache CURIO_ADDR=127.0.0.1:8787 CURIO_TOKEN=secret cargo run -p curio-server
//!   VITE_API_URL=http://127.0.0.1:8787 npm run dev
//!
//! Routes mirror the Tauri commands 1:1 (see src/api/adapters/http.ts).
//! Auth: when CURIO_TOKEN is set every request needs `Authorization: Bearer <token>`
//! (or `?token=` for <img>/<video> URLs that cannot send headers).

use std::{path::PathBuf, sync::Arc};

use axum::{
    body::Body,
    extract::{Path, Query, Request, State},
    http::{header, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{delete, get, post, put},
    Json, Router,
};
use curio_core::{models::*, Error, Library};
use serde::Deserialize;
use tower_http::cors::CorsLayer;

#[derive(Clone)]
struct AppState {
    lib: Arc<Library>,
    token: Option<Arc<str>>,
}
type S = State<AppState>;

struct ApiError(Error);
impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let code = match self.0 {
            Error::NotFound(_) => StatusCode::NOT_FOUND,
            Error::Invalid(_) | Error::Unsupported(_) => StatusCode::BAD_REQUEST,
            Error::Network(_) => StatusCode::BAD_GATEWAY,
            _ => StatusCode::INTERNAL_SERVER_ERROR,
        };
        (code, self.0.to_string()).into_response()
    }
}

/// Run blocking SQLite / filesystem / network work off the async runtime.
async fn run<T: Send + 'static>(s: &AppState, f: impl FnOnce(&Library) -> curio_core::Result<T> + Send + 'static) -> Result<T, ApiError> {
    let lib = s.lib.clone();
    tokio::task::spawn_blocking(move || f(&lib)).await.map_err(|e| ApiError(Error::Invalid(e.to_string())))?.map_err(ApiError)
}
macro_rules! json { ($s:expr, $f:expr) => { run(&$s, $f).await.map(Json) }; }
macro_rules! empty { ($s:expr, $f:expr) => { run(&$s, $f).await.map(|_| StatusCode::NO_CONTENT) }; }

async fn auth(State(s): S, req: Request, next: Next) -> Response {
    if let Some(tok) = &s.token {
        let bearer = req.headers().get(header::AUTHORIZATION).and_then(|v| v.to_str().ok()).and_then(|v| v.strip_prefix("Bearer "));
        let query_tok = req.uri().query().and_then(|q| q.split('&').find_map(|kv| kv.strip_prefix("token=")));
        if bearer != Some(tok) && query_tok != Some(tok) {
            return (StatusCode::UNAUTHORIZED, "unauthorized").into_response();
        }
    }
    next.run(req).await
}

#[tokio::main]
async fn main() {
    let db = PathBuf::from(std::env::var("CURIO_DB").unwrap_or_else(|_| "curio.db".into()));
    let cache = PathBuf::from(std::env::var("CURIO_CACHE").unwrap_or_else(|_| "cache".into()));
    let addr = std::env::var("CURIO_ADDR").unwrap_or_else(|_| "127.0.0.1:8787".into());
    let token = std::env::var("CURIO_TOKEN").ok().filter(|t| !t.is_empty()).map(Arc::from);
    let state = AppState { lib: Arc::new(Library::open(&db, &cache).expect("open library")), token };

    {
        let s = state.clone();
        tokio::task::spawn_blocking(move || s.lib.rescan_watch_folders());
    }

    let api = Router::new()
        .route("/items/query", post(|State(s): S, Json(q): Json<ItemQuery>| async move { json!(s, move |l| l.list_items(&q)) }))
        .route("/counts", get(|State(s): S| async move { json!(s, |l| l.counts()) }))
        .route("/archives", get(|State(s): S| async move { json!(s, |l| l.list_archives()) }))
        .route(
            "/archives/:id",
            put(|State(s): S, Json(a): Json<Archive>| async move { json!(s, move |l| l.save_archive(a)) })
                .delete(|State(s): S, Path(id): Path<String>| async move { json!(s, move |l| l.delete_archive(&id)) }),
        )
        .route("/items", post(|State(s): S, Json(i): Json<NewItem>| async move { json!(s, move |l| l.create_item(i)) }))
        .route("/items/bulk", post(|State(s): S, Json(i): Json<Vec<NewItem>>| async move { json!(s, move |l| l.bulk_create(i)) }))
        .route(
            "/items/:id",
            get(|State(s): S, Path(id): Path<String>| async move { json!(s, move |l| l.get_item(&id)) })
                .patch(|State(s): S, Path(id): Path<String>, Json(p): Json<ItemPatch>| async move { json!(s, move |l| l.update_item(&id, p)) })
                .delete(|State(s): S, Path(id): Path<String>| async move { empty!(s, move |l| l.delete_item(&id)) }),
        )
        .route("/items/:id/files", post(|State(s): S, Path(id): Path<String>, Json(b): Json<Paths>| async move { json!(s, move |l| l.attach_paths(&id, &b.paths)) }))
        .route("/items/:id/metadata", post(|State(s): S, Path(id): Path<String>, Json(b): Json<Apply>| async move {
            json!(s, move |l| l.apply_metadata(&id, &b.provider, &b.id, b.overwrite_title))
        }))
        .route("/items/:id/autofill", post(|State(s): S, Path(id): Path<String>| async move { json!(s, move |l| l.autofill(&id)) }))
        .route("/metadata/search", post(|State(s): S, Json(b): Json<Search>| async move { json!(s, move |l| l.search_metadata(b.kind, &b.query)) }))
        .route("/files/:id", delete(|State(s): S, Path(id): Path<String>| async move { empty!(s, move |l| l.detach_file(&id)) }))
        .route("/files/:id/raw", get(raw_file))
        .route("/files/:id/pages", get(|State(s): S, Path(id): Path<String>| async move { json!(s, move |l| l.list_pages(&id)) }))
        .route("/files/:id/pages/:idx", get(page))
        .route("/tags", get(|State(s): S| async move { json!(s, |l| l.list_tags()) }).post(|State(s): S, Json(t): Json<NewTag>| async move {
            json!(s, move |l| l.upsert_tag(&t.name, t.category))
        }))
        .route("/categories", get(|State(s): S| async move { json!(s, |l| l.list_categories()) }))
        .route(
            "/categories/:id",
            put(|State(s): S, Json(c): Json<Category>| async move { json!(s, move |l| l.save_category(c)) })
                .delete(|State(s): S, Path(id): Path<String>| async move { empty!(s, move |l| l.delete_category(&id)) }),
        )
        .route("/categories/:id/items", post(|State(s): S, Path(id): Path<String>, Json(b): Json<Ids>| async move {
            empty!(s, move |l| l.add_to_category(&b.item_ids, &id))
        }))
        .route("/statuses", get(|State(s): S| async move { json!(s, |l| l.list_statuses()) }))
        .route(
            "/statuses/:id",
            put(|State(s): S, Json(d): Json<StatusDef>| async move { json!(s, move |l| l.save_status(d)) })
                .delete(|State(s): S, Path(id): Path<String>, Query(q): Query<Fallback>| async move { json!(s, move |l| l.delete_status(&id, &q.fallback)) }),
        )
        .route("/fields", get(|State(s): S| async move { json!(s, |l| l.list_fields()) }))
        .route(
            "/fields/:id",
            put(|State(s): S, Json(f): Json<FieldDef>| async move { json!(s, move |l| l.save_field(f)) })
                .delete(|State(s): S, Path(id): Path<String>| async move { empty!(s, move |l| l.delete_field(&id)) }),
        )
        .route("/views", get(|State(s): S| async move { json!(s, |l| l.list_views()) }))
        .route(
            "/views/:id",
            put(|State(s): S, Json(v): Json<View>| async move { json!(s, move |l| l.save_view(v)) })
                .delete(|State(s): S, Path(id): Path<String>| async move { empty!(s, move |l| l.delete_view(&id)) }),
        )
        .route("/watch", get(|State(s): S| async move { json!(s, |l| l.list_watch_folders()) }).post(|State(s): S, Json(b): Json<Watch>| async move {
            json!(s, move |l| l.add_watch_folder(&b.path, b.kind, b.list))
        }))
        .route("/watch/:id", delete(|State(s): S, Path(id): Path<String>| async move { empty!(s, move |l| l.remove_watch_folder(&id)) }))
        .route("/watch/rescan", post(|State(s): S| async move { json!(s, |l| l.rescan_watch_folders()) }))
        .route("/import", post(|State(s): S, Json(b): Json<Import>| async move { json!(s, move |l| l.import_paths_as(&b.paths, b.kind, b.list, b.archive_id)) }))
        .route("/media", get(media))
        .layer(middleware::from_fn_with_state(state.clone(), auth));

    let app = Router::new().nest("/api", api).layer(CorsLayer::permissive()).with_state(state);
    let listener = tokio::net::TcpListener::bind(&addr).await.expect("bind");
    println!("curio-server listening on http://{addr}");
    axum::serve(listener, app).await.expect("serve");
}

#[derive(Deserialize)]
struct Paths { paths: Vec<String> }
#[derive(Deserialize)]
struct Fallback { fallback: String }
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Import { paths: Vec<String>, kind: Option<Kind>, list: Option<ListKind>, archive_id: Option<String> }
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Ids { item_ids: Vec<String> }
#[derive(Deserialize)]
struct Search { kind: Kind, query: String }
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Apply { provider: String, id: String, #[serde(default)] overwrite_title: bool }
#[derive(Deserialize)]
struct Watch { path: String, kind: Kind, list: ListKind }

async fn stream_path(path: String) -> Result<Response, ApiError> {
    let file = tokio::fs::File::open(&path).await.map_err(|e| ApiError(e.into()))?;
    let mime = curio_core::media::mime_of(&path);
    let body = Body::from_stream(tokio_util::io::ReaderStream::new(file));
    Ok(([(header::CONTENT_TYPE, mime), (header::CACHE_CONTROL, "private, max-age=3600")], body).into_response())
}

async fn raw_file(State(s): S, Path(id): Path<String>) -> Result<Response, ApiError> {
    let f = run(&s, move |l| l.get_file(&id)).await?;
    stream_path(f.uri).await
}

async fn page(State(s): S, Path((id, idx)): Path<(String, usize)>) -> Result<Response, ApiError> {
    let (bytes, mime) = run(&s, move |l| l.read_page(&id, idx)).await?;
    Ok(([(header::CONTENT_TYPE, mime), (header::CACHE_CONTROL, "private, max-age=3600")], bytes).into_response())
}

#[derive(Deserialize)]
struct MediaQ { uri: String }
/// Covers / banners / linked files only — arbitrary paths are refused.
async fn media(State(s): S, Query(q): Query<MediaQ>) -> Result<Response, ApiError> {
    let uri = q.uri.clone();
    if !run(&s, move |l| Ok(l.is_known_media(&uri))).await? {
        return Err(ApiError(Error::NotFound("media".into())));
    }
    stream_path(q.uri).await
}
