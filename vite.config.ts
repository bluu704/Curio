import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Tauri expects a fixed port and no clearing of the screen.
/** `npm run dev`: answers /api/ytm like the web site's Cloudflare function (functions/api/ytm.ts). */
const ytmDev = (): Plugin => ({
  name: "curio-ytm-dev",
  configureServer(server) {
    server.middlewares.use("/api/ytm", (req, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", async () => {
        try {
          const q = JSON.parse(raw) as { path: string; body: Record<string, unknown>; hl?: string };
          if (!["search", "next", "browse"].includes(q.path)) throw new Error("not allowed");
          const r = await fetch(`https://music.youtube.com/youtubei/v1/${q.path}?prettyPrint=false`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Origin: "https://music.youtube.com" },
            body: JSON.stringify({ context: { client: { clientName: "WEB_REMIX", clientVersion: "1.20241106.01.00", hl: "ko", gl: "KR" } }, ...q.body }),
          });
          res.setHeader("Content-Type", "application/json");
          res.statusCode = r.status;
          res.end(await r.text());
        } catch (e) {
          res.statusCode = 400;
          res.end(String(e));
        }
      });
    });
  },
});

export default defineConfig({
  plugins: [react(), ytmDev()],
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  envPrefix: ["VITE_", "TAURI_"],
  build: { target: "es2021", sourcemap: false },
});
