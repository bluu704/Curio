import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { defineConfig, mergeConfig, type Plugin } from "vite";
import base from "./vite.config";

/**
 * Security headers for the static host (Cloudflare Pages reads `_headers`). The page may only run its
 * own scripts (plus Google sign-in) and talk to the services it uses, so text stored in the library can
 * never load or send anything elsewhere. The inline theme script is allowed by its hash, computed here.
 */
function securityHeaders(outDir: string): Plugin {
  return {
    name: "curio-security-headers",
    apply: "build",
    closeBundle() {
      const html = readFileSync(join(outDir, "index.html"), "utf8");
      const hashes = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
        .map((m) => `'sha256-${createHash("sha256").update(m[1]).digest("base64")}'`);
      const csp = [
        "default-src 'self'",
        `script-src 'self' ${hashes.join(" ")} https://accounts.google.com/gsi/client`,
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com/gsi/style",
        "font-src 'self' data: https://fonts.gstatic.com",
        "img-src 'self' data: blob: https:",
        "media-src 'self' data: blob: https:",
        [
          "connect-src 'self' blob: data:",
          "https://www.googleapis.com https://openidconnect.googleapis.com https://*.googleusercontent.com https://accounts.google.com/gsi/",
          "https://fonts.googleapis.com https://lrclib.net https://itunes.apple.com https://www.youtube.com https://graphql.anilist.co https://ltn.gold-usergeneratedcontent.net",
        ].join(" "),
        "frame-src https://www.youtube-nocookie.com https://accounts.google.com/gsi/",
        "worker-src 'self' blob:",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
      ].join("; ");
      const headers = [
        "/*",
        `  Content-Security-Policy: ${csp}`,
        "  X-Content-Type-Options: nosniff",
        "  X-Frame-Options: DENY",
        "  Referrer-Policy: strict-origin-when-cross-origin",
        // the Google sign-in popup has to report back to this page
        "  Cross-Origin-Opener-Policy: same-origin-allow-popups",
        "  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()",
        "  Strict-Transport-Security: max-age=31536000",
        "",
      ].join("\n");
      writeFileSync(join(outDir, "_headers"), headers);
    },
  };
}

/**
 * Browser-only Curio for a static host (GitHub Pages): library in the browser, synced with Google Drive.
 * VITE_BASE = path the site is served from (default "/"; GitHub Pages: "/<repository>/").
 * VITE_GOOGLE_CLIENT_ID = Google OAuth "Web application" client id (public; no secret).
 */
export default mergeConfig(base, defineConfig({
  // site at the root of its address (Cloudflare Pages, own domain); GitHub Pages sets "/<repository>/"
  base: process.env.VITE_BASE || "/",
  define: { "import.meta.env.VITE_API_URL": "undefined", "import.meta.env.VITE_CURIO_WEB": JSON.stringify("1") },
  build: { outDir: "dist-web", chunkSizeWarningLimit: 4000 },
  plugins: [securityHeaders("dist-web")],
}));
