import type { ApiClient } from "./client";
import { createTauriClient } from "./adapters/tauri";
import { createHttpClient } from "./adapters/http";
import { createMockClient } from "./adapters/mock";
import { createWebClient } from "./adapters/web";

/**
 * Adapter selection:
 *  - inside Tauri            → IPC to Rust (local SQLite + filesystem)
 *  - VITE_API_URL is set     → REST server (crates/server, self-hosted)
 *  - VITE_CURIO_WEB = 1      → browser-only web version (IndexedDB + Google Drive sync)
 *  - otherwise (plain vite)  → in-browser mock, for UI work without a backend
 */
function pick(): ApiClient {
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) return createTauriClient();
  const url = import.meta.env.VITE_API_URL as string | undefined;
  if (url) return createHttpClient(url);
  if (import.meta.env.VITE_CURIO_WEB === "1") return createWebClient();
  return createMockClient();
}

export const api: ApiClient = pick();
export type { ApiClient } from "./client";
export * from "./types";
