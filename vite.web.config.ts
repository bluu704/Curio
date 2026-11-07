import { defineConfig, mergeConfig } from "vite";
import base from "./vite.config";

/**
 * Browser-only Curio for a static host (GitHub Pages): library in the browser, synced with Google Drive.
 * VITE_BASE = path the site is served from (GitHub Pages: "/<repository>/").
 * VITE_GOOGLE_CLIENT_ID = Google OAuth "Web application" client id (public; no secret).
 */
export default mergeConfig(base, defineConfig({
  base: process.env.VITE_BASE ?? "/Curio/",
  define: { "import.meta.env.VITE_API_URL": "undefined", "import.meta.env.VITE_CURIO_WEB": JSON.stringify("1") },
  build: { outDir: "dist-web", chunkSizeWarningLimit: 4000 },
}));
