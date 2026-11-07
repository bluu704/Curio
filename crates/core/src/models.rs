//! Wire types. JSON shape must match `src/api/types.ts`.

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

macro_rules! str_enum {
    ($name:ident { $($var:ident = $s:literal),+ $(,)? }) => {
        #[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
        pub enum $name { $(#[serde(rename = $s)] $var),+ }
        impl $name {
            pub fn as_str(&self) -> &'static str { match self { $(Self::$var => $s),+ } }
            pub fn parse(s: &str) -> Option<Self> { match s { $($s => Some(Self::$var),)+ _ => None } }
        }
        impl rusqlite::ToSql for $name {
            fn to_sql(&self) -> rusqlite::Result<rusqlite::types::ToSqlOutput<'_>> { Ok(self.as_str().into()) }
        }
        impl rusqlite::types::FromSql for $name {
            fn column_result(v: rusqlite::types::ValueRef<'_>) -> rusqlite::types::FromSqlResult<Self> {
                let s = v.as_str()?;
                Self::parse(s).ok_or_else(|| rusqlite::types::FromSqlError::Other(format!("bad {}: {s}", stringify!($name)).into()))
            }
        }
    };
}

str_enum!(Kind {
    Illust = "illust", Game = "game", Anime = "anime", Webtoon = "webtoon", LightNovel = "light_novel",
    WebNovel = "web_novel", Music = "music", Doujin = "doujin", Catalog = "catalog", Manga = "manga",
    Movie = "movie", Drama = "drama", Book = "book", Other = "other",
});
str_enum!(ListKind { Archive = "archive", Wishlist = "wishlist" });
/// Status id (user-defined, see `StatusDef`). Built-ins: planned, in_progress, completed, on_hold, dropped.
pub type Status = String;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusDef {
    pub id: String,
    pub label: String,
    /// Icon key (UI registry)
    pub icon: String,
    /// Tone key: slate | blue | green | amber | red | violet | pink | teal
    pub color: String,
    pub position: i64,
}
str_enum!(TagCategory {
    Author = "author", Director = "director", Studio = "studio", Publisher = "publisher", Cast = "cast",
    Circle = "circle", Series = "series", Genre = "genre", Tag = "tag",
});
str_enum!(FileKind { Video = "video", Audio = "audio", Archive = "archive", Image = "image", Folder = "folder", Document = "document", Text = "text", Other = "other" });
str_enum!(Provider { Local = "local", GDrive = "gdrive", Http = "http" });

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Tag {
    pub id: String,
    pub name: String,
    pub category: TagCategory,
    pub color: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileRef {
    pub id: String,
    pub item_id: String,
    pub provider: Provider,
    pub uri: String,
    pub name: String,
    pub kind: FileKind,
    pub size: Option<i64>,
    pub mtime: Option<i64>,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    pub id: String,
    pub title: String,
    pub kind: Kind,
    pub archive_id: Option<String>,
    pub list: ListKind,
    pub status: Status,
    pub rating: Option<f64>,
    pub favorite: bool,
    pub pinned: bool,
    pub cover_uri: Option<String>,
    pub banner_uri: Option<String>,
    pub summary: Option<String>,
    pub year: Option<i64>,
    pub url: Option<String>,
    pub code: Option<String>,
    pub source: Option<Value>,
    pub category_ids: Vec<String>,
    pub tags: Vec<Tag>,
    pub props: Map<String, Value>,
    pub files: Vec<FileRef>,
    /// Page body. Only filled by `get_item`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub blocks: Option<Vec<Value>>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum SortField {
    #[default]
    UpdatedAt,
    CreatedAt,
    Title,
    Rating,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum SortDir {
    Asc,
    #[default]
    Desc,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Sort {
    pub field: SortField,
    pub dir: SortDir,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct ItemQuery {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub search: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kinds: Option<Vec<Kind>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub archive_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub list: Option<ListKind>,
    /// Includes all descendant categories.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub statuses: Option<Vec<Status>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tag_ids: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub favorite: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub min_rating: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sort: Option<Sort>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
#[derive(Default)]
pub struct NewItem {
    pub title: String,
    pub kind: Option<Kind>,
    /// Defaults to the built-in archive of `kind`.
    pub archive_id: Option<String>,
    pub list: Option<ListKind>,
    pub status: Option<Status>,
    pub cover_uri: Option<String>,
    pub url: Option<String>,
    pub code: Option<String>,
    pub year: Option<i64>,
    pub summary: Option<String>,
    pub rating: Option<f64>,
    /// Tags created/linked on insert: (name, category).
    #[serde(default)]
    pub tags: Vec<NewTag>,
    #[serde(default)]
    pub category_ids: Vec<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct NewTag {
    pub name: String,
    pub category: TagCategory,
}

/// Partial update. `Option<Option<T>>` distinguishes "absent" from "set to null".
#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct ItemPatch {
    pub title: Option<String>,
    pub kind: Option<Kind>,
    pub archive_id: Option<String>,
    pub list: Option<ListKind>,
    pub status: Option<Status>,
    pub pinned: Option<bool>,
    #[serde(deserialize_with = "double_option")]
    pub rating: Option<Option<f64>>,
    #[serde(deserialize_with = "double_option")]
    pub banner_uri: Option<Option<String>>,
    #[serde(deserialize_with = "double_option")]
    pub summary: Option<Option<String>>,
    #[serde(deserialize_with = "double_option")]
    pub year: Option<Option<i64>>,
    #[serde(deserialize_with = "double_option")]
    pub url: Option<Option<String>>,
    #[serde(deserialize_with = "double_option")]
    pub code: Option<Option<String>>,
    pub category_ids: Option<Vec<String>>,
    pub favorite: Option<bool>,
    #[serde(deserialize_with = "double_option")]
    pub cover_uri: Option<Option<String>>,
    pub tag_ids: Option<Vec<String>>,
    pub props: Option<Map<String, Value>>,
    pub blocks: Option<Vec<Value>>,
}

fn double_option<'de, T: Deserialize<'de>, D: serde::Deserializer<'de>>(d: D) -> Result<Option<Option<T>>, D::Error> {
    Option::<T>::deserialize(d).map(Some)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FieldDef {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub field_type: String,
    pub options: Vec<String>,
    pub position: i64,
}

/// Saved view. Presentation config (`card`, `columns`, `layout`) is opaque JSON owned by the UI.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct View {
    pub id: String,
    pub name: String,
    pub icon: String,
    pub position: i64,
    pub layout: String,
    pub query: ItemQuery,
    pub card: Value,
    pub columns: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Category {
    pub id: String,
    pub parent_id: Option<String>,
    pub kind: Option<Kind>,
    pub name: String,
    pub position: i64,
    /// Folder color (tone key). None = default.
    #[serde(default)]
    pub color: Option<String>,
}

/// An item in the trash, with when it was deleted.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrashedItem {
    #[serde(flatten)]
    pub item: Item,
    pub deleted_at: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveCount {
    pub archive_id: Option<String>,
    pub list: ListKind,
    pub count: i64,
}

/// A user-editable archive (sidebar entry). `kind` is its template.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Archive {
    pub id: String,
    pub name: String,
    pub icon: String,
    pub kind: Kind,
    /// User-defined format id (Settings → 형식); None = the built-in format of `kind`.
    #[serde(default)]
    pub format: Option<String>,
    pub position: i64,
    pub pinned: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchFolder {
    pub id: String,
    pub path: String,
    pub kind: Kind,
    pub list: ListKind,
    pub last_scan: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Person {
    pub name: String,
    pub category: TagCategory,
    /// Original role text from the source (e.g. "Director", "Original Creator").
    pub role: Option<String>,
}

/// A metadata search hit. `search` may return partial data; `fetch` returns full details.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Candidate {
    pub provider: String,
    pub id: String,
    pub title: String,
    pub alt_titles: Vec<String>,
    pub kind: Option<Kind>,
    pub year: Option<i64>,
    pub cover_url: Option<String>,
    pub banner_url: Option<String>,
    pub summary: Option<String>,
    pub people: Vec<Person>,
    pub genres: Vec<String>,
    pub series: Option<String>,
    pub url: Option<String>,
    pub code: Option<String>,
    /// One-line extra info shown in the picker (e.g. "TV · 2023 가을 · 28화", "극장판").
    pub detail: Option<String>,
}
