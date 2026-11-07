import type {
  Archive, ArchiveCount, Candidate, DriveImport, DriveStatus, SyncReport, Capabilities, Category, FieldDef, FileRef, ID, ImportTarget, Item, ItemPatch, ItemQuery, Kind,
  ListKind, NewItem, StatusDef, TrashedItem, Tag, TagCategory, View, WatchFolder,
} from "./types";

/**
 * The ONLY contract between UI and backend.
 * UI code never imports Tauri or fetch directly — it calls `api.*`.
 * Swap the adapter to move from desktop → web/server without touching components.
 */
export interface ApiClient {
  readonly caps: Capabilities;

  listItems(q: ItemQuery): Promise<Item[]>;
  /** Per (kind, list) counts — sidebar hides empty wishlists. */
  counts(): Promise<ArchiveCount[]>;

  /** Trash: deleteItem moves items here; kept 30 days. */
  listTrash(): Promise<TrashedItem[]>;
  trashCount(): Promise<number>;
  restoreItem(id: ID): Promise<Item>;
  purgeItem(id: ID): Promise<void>;
  emptyTrash(): Promise<number>;
  /** Small JSON settings stored in the library (e.g. user-defined formats). */
  getSettings<T = unknown>(key: string): Promise<T | null>;
  setSettings(key: string, value: unknown): Promise<void>;

  listArchives(): Promise<Archive[]>;
  saveArchive(a: Archive): Promise<Archive>;
  /** Deletes the archive and its items (linked files on disk stay). Returns deleted item count. */
  deleteArchive(id: ID): Promise<number>;
  bulkCreate(inputs: NewItem[]): Promise<ID[]>;
  getItem(id: ID): Promise<Item>;
  createItem(input: NewItem): Promise<Item>;
  updateItem(id: ID, patch: ItemPatch): Promise<Item>;
  deleteItem(id: ID): Promise<void>;

  listTags(): Promise<Tag[]>;
  upsertTag(name: string, category: TagCategory): Promise<Tag>;

  listCategories(): Promise<Category[]>;
  saveCategory(c: Category): Promise<Category>;
  deleteCategory(id: ID): Promise<void>;
  addToCategory(itemIds: ID[], categoryId: ID): Promise<void>;

  listStatuses(): Promise<StatusDef[]>;
  saveStatus(s: StatusDef): Promise<StatusDef>;
  /** Items with this status move to `fallback`. Returns moved item count. */
  deleteStatus(id: string, fallback: string): Promise<number>;

  listFields(): Promise<FieldDef[]>;
  saveField(field: FieldDef): Promise<FieldDef>;
  deleteField(id: ID): Promise<void>;

  listViews(): Promise<View[]>;
  saveView(view: View): Promise<View>;
  deleteView(id: ID): Promise<void>;

  /** Link existing paths to an item (no copy — files stay where they are). */
  attachPaths(itemId: ID, paths: string[]): Promise<FileRef[]>;
  detachFile(fileId: ID): Promise<void>;
  /** Create one item per path (auto-detect kind, extract cover from CBZ/ZIP/images). */
  importPaths(paths: string[], target?: ImportTarget): Promise<Item[]>;

  /** Online metadata (AniList / Steam / YouTube+Deezer / DLsite). Query may be a title, URL or code. */
  searchMetadata(kind: Kind, query: string): Promise<Candidate[]>;
  /** Fetch details, download hi-res images locally, link people/genres. */
  applyMetadata(itemId: ID, candidate: Candidate, overwriteTitle: boolean): Promise<Item>;
  autofill(itemId: ID): Promise<boolean>;
  /** Find lyrics (YouTube Music → LRCLIB) and store them in props._lyrics. null = none found. */
  fetchLyrics(itemId: ID): Promise<Item | null>;

  // ---- Google Drive (desktop app signs in; the web version uses a library that is already connected)
  driveStatus(): Promise<DriveStatus>;
  /** Opens Google sign-in in the browser; resolves when the user has finished. */
  driveLogin(): Promise<DriveStatus>;
  driveLogout(): Promise<DriveStatus>;
  driveFolder(link: string): Promise<{ id: string; name: string }>;
  /** Download a Drive folder to this PC and add its files as items (new files only on repeat). */
  driveImport(link: string, target?: ImportTarget): Promise<DriveImport>;
  /** Merge this library with its copy in Drive (other devices' changes in, this device's out). */
  driveSync(): Promise<SyncReport>;
  /** Cover = frame of one of the item's videos (server side, ffmpeg). Absent where the browser can capture it. */
  coverFromVideo?(itemId: ID, fileId: ID, seconds: number): Promise<Item>;

  /** Reader: page names of a zip/cbz/image folder; PDFs use `fileUrl`. */
  listPages(file: FileRef): Promise<string[]>;
  pageUrl(file: FileRef, index: number): string;
  /** URL to the raw file (PDF reader, video/audio playback). */
  fileUrl(file: FileRef): string | null;
  /** Text files (txt, md…): read for the viewer and save edits back to the original file. */
  readText(file: FileRef): Promise<string>;
  writeText(file: FileRef, content: string): Promise<FileRef>;
  /** Save a copy of a linked/uploaded file (desktop: save dialog; web: browser download). */
  downloadFile(file: FileRef): Promise<void>;

  listWatchFolders(): Promise<WatchFolder[]>;
  addWatchFolder(path: string, kind: Kind, list: ListKind): Promise<WatchFolder>; // eslint-disable-line
  removeWatchFolder(id: ID): Promise<void>;
  rescan(): Promise<number>;
  /** Called when the backend changed the library on its own (folder watcher). */
  onLibraryChanged(cb: () => void): () => void;

  openFile(file: FileRef): Promise<void>;
  revealFile(file: FileRef): Promise<void>;
  /** Native picker. Returns null when cancelled or unsupported. */
  pickPaths(opts: { directory?: boolean; multiple?: boolean }): Promise<string[] | null>;

  /**
   * Browser-only: real File objects (drag & drop / <input type=file>) when there are no paths.
   * Present on the mock adapter (preview); the desktop app uses paths instead.
   */
  importBlobs?(files: File[], target?: ImportTarget): Promise<Item[]>;
  attachBlobs?(itemId: ID, files: File[]): Promise<FileRef[]>;

  /** Turn a stored media URI into something an <img>/<video> can load. */
  mediaUrl(uri: string | null | undefined): string | null;
}
