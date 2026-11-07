import { defineConfig, mergeConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import base from "./vite.config";

/** One self-contained HTML (JS/CSS inlined) running on the in-browser sample backend — for design review. */
export default mergeConfig(base, defineConfig({
  plugins: [viteSingleFile()],
  define: { "import.meta.env.VITE_API_URL": "undefined" },
  build: { outDir: "dist-preview", assetsInlineLimit: 100_000_000, chunkSizeWarningLimit: 10_000 },
}));
