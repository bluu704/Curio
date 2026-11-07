// Shared domain types. Mirrors `crates/core/src/models.rs` (serde camelCase).
// Keep these in sync: the same JSON shape travels over Tauri IPC and HTTP.

export type ID = string;

export const KINDS = [
  "illust", "game", "anime", "webtoon", "light_novel", "web_novel", "music", "doujin", "catalog", "manga", "movie", "drama", "book", "other",
] as const;
export type Kind = (typeof KINDS)[number];

export const LISTS = ["archive", "wishlist"] as const;
export type ListKind = (typeof LISTS)[number];

/** Status id. User-defined (see StatusDef); built-ins: planned, in_progress, completed, on_hold, dropped. */
export type Status = string;

export interface StatusDef {
  id: string;
  label: string;
  /** key in STATUS_ICONS */
  icon: string;
  /** tone key: slate | blue | green | amber | red | violet | pink | teal */
  color: string;
  position: number;
}

export const TAG_CATEGORIES = ["author", "director", "studio", "publisher", "cast", "circle", "series", "genre", "tag"] as const;
export type TagCategory = (typeof TAG_CATEGORIES)[number];

export interface Tag {
  id: ID;
  name: string;
  category: TagCategory;
  color: string | null;
}

export type FileKind = "video" | "audio" | "archive" | "image" | "folder" | "document" | "text" | "other";

/** Where the bytes live. `local` = absolute path on this machine. */
export type StorageProvider = "local" | "gdrive" | "http";

export interface FileRef {
  id: ID;
  itemId: ID;
  provider: StorageProvider;
  /** Absolute path for `local`, remote file id for `gdrive`, URL for `http`. */
  uri: string;
  name: string;
  kind: FileKind;
  size: number | null;
  mtime: number | null;
  createdAt: number;
}

export type FieldType = "text" | "number" | "select" | "multi_select" | "date" | "url" | "checkbox";

export interface FieldDef {
  id: ID;
  name: string;
  type: FieldType;
  options: string[];
  position: number;
}

/** "heading" = H2 (kept for older notes). */
export type BlockType = "paragraph" | "h1" | "heading" | "h3" | "bullet" | "numbered" | "quote" | "todo" | "callout" | "code" | "math" | "table" | "divider"
  | "toggle" | "image" | "video" | "bookmark" | "calendar" | "toc" | "file";

export interface Block {
  id: ID;
  type: BlockType;
  text: string;
  checked?: boolean;
  /** table blocks: rows × cells (first row = header) */
  rows?: string[][];
  /** extra data for rich blocks (toggle body, image src, video/bookmark url, calendar notes…) */
  data?: Record<string, unknown>;
}

export interface Item {
  id: ID;
  title: string;
  kind: Kind;
  archiveId: ID | null;
  list: ListKind;
  status: Status;
  /** 0–5, 0.5 steps. null = unrated. */
  rating: number | null;
  favorite: boolean;
  /** Pinned items are listed first inside their archive. */
  pinned: boolean;
  /** Media URI (local path / data URI / URL). Resolve with `api.mediaUrl()`. */
  coverUri: string | null;
  bannerUri: string | null;
  summary: string | null;
  year: number | null;
  /** Main external link (YouTube, store page…) */
  url: string | null;
  /** Product code / 품번 (normalized by the backend) */
  code: string | null;
  /** Applied metadata source */
  source: { provider: string; id: string; url?: string | null; altTitles?: string[] } | null;
  categoryIds: ID[];
  tags: Tag[];
  /** Custom field values keyed by FieldDef.id */
  props: Record<string, unknown>;
  files: FileRef[];
  /** Page body. Only populated by `getItem` (omitted from list for speed). */
  blocks?: Block[];
  createdAt: number;
  updatedAt: number;
}

export type SortField = "updatedAt" | "createdAt" | "title" | "rating";

export interface ItemQuery {
  search?: string;
  kinds?: Kind[];
  archiveId?: ID;
  list?: ListKind;
  /** Includes descendant categories */
  categoryId?: ID;
  statuses?: Status[];
  tagIds?: ID[];
  favorite?: boolean;
  minRating?: number;
  sort?: { field: SortField; dir: "asc" | "desc" };
}

export interface NewTag { name: string; category: TagCategory }

export interface NewItem {
  title: string;
  kind?: Kind;
  archiveId?: ID;
  list?: ListKind;
  status?: Status;
  coverUri?: string | null;
  url?: string | null;
  code?: string | null;
  year?: number | null;
  summary?: string | null;
  rating?: number | null;
  tags?: NewTag[];
  categoryIds?: ID[];
}

export interface ItemPatch {
  title?: string;
  kind?: Kind;
  archiveId?: ID;
  pinned?: boolean;
  list?: ListKind;
  status?: Status;
  rating?: number | null;
  favorite?: boolean;
  coverUri?: string | null;
  bannerUri?: string | null;
  summary?: string | null;
  year?: number | null;
  url?: string | null;
  code?: string | null;
  tagIds?: ID[];
  categoryIds?: ID[];
  props?: Record<string, unknown>;
  blocks?: Block[];
}

export type Layout = "gallery" | "masonry" | "table" | "list";
export type CardSize = "s" | "m" | "l";
export type CardAspect = "2/3" | "3/4" | "1/1" | "16/9";
export type CardField = "kind" | "status" | "rating" | "author" | "tags" | "files";

export interface CardConfig {
  size: CardSize;
  aspect: CardAspect;
  fit: "cover" | "contain";
  showTitle: boolean;
  fields: CardField[];
  /** Detail-panel properties for this archive: hidden keys and extra (added) keys. */
  props?: { hidden?: string[]; extra?: string[] };
}

/**
 * Table column. Built-ins plus dynamic keys: "tag:<category>" (director, studio, cast…),
 * "field:<id>" (custom properties). Legacy "author" | "genre" | "tag" are kept for saved views.
 */
export type ColumnKey = string;

/** A saved view = query + presentation. Stored in DB so it syncs like any other data. */
export interface View {
  id: ID;
  name: string;
  icon: string;
  layout: Layout;
  query: ItemQuery;
  card: CardConfig;
  columns: ColumnKey[];
  position: number;
}

export interface Capabilities {
  platform: "tauri" | "http" | "mock";
  /** Can we touch the local filesystem (open, reveal, scan)? */
  localFiles: boolean;
}

export interface Category {
  id: ID;
  parentId: ID | null;
  /** null = shared by every archive */
  kind: Kind | null;
  name: string;
  position: number;
  /** Folder color (tone key). null = default */
  color?: string | null;
}

export interface TrashedItem extends Item { deletedAt: number }

export interface ArchiveCount { archiveId: ID | null; list: ListKind; count: number }

/** User-editable archive (sidebar entry). `kind` is its template (fields, sources, layout). */
export interface Archive {
  id: ID;
  name: string;
  icon: string;
  kind: Kind;
  /** User-defined format id (Settings → 형식). null/undefined = built-in format of `kind`. */
  format?: string | null;
  position: number;
  pinned: boolean;
}

/** Where imported files go. */
/** Google Drive connection of this library. */
export interface DriveStatus { available: boolean; builtin: boolean; connected: boolean; email: string | null }
export interface DriveImport { items: Item[]; skipped: number }
export interface SyncReport { pulled: number; pushed: number; imagesUp: number; imagesDown: number; at: number }

export interface ImportTarget { archiveId?: ID; kind?: Kind; list?: ListKind }

export interface WatchFolder { id: ID; path: string; kind: Kind; list: ListKind; lastScan: number | null }

export interface Person { name: string; category: TagCategory; role: string | null }

/** Metadata search hit (AniList / Steam / YouTube+Deezer / DLsite). */
export interface Candidate {
  provider: string;
  id: string;
  title: string;
  altTitles: string[];
  kind: Kind | null;
  year: number | null;
  coverUrl: string | null;
  bannerUrl: string | null;
  summary: string | null;
  people: Person[];
  genres: string[];
  series: string | null;
  url: string | null;
  code: string | null;
  /** one-line extra info, e.g. "TV · 2023 가을 · 28화", "극장판" */
  detail?: string | null;
}
