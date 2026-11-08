import { create } from "zustand";

export type ThemeMode = "light" | "dark" | "system";
const KEY = "curio.theme";

const ACCENT_KEY = "curio.accent";
const TEXT_KEY = "curio.text";

export type Weight = "light" | "normal" | "bold";
export interface TextPrefs { font: string; weight: Weight; scale: number }
const DEFAULT_TEXT: TextPrefs = { font: "system", weight: "normal", scale: 1 };

/**
 * Multilingual fallback chain appended to every font: Japanese, Simplified/Traditional Chinese,
 * Latin/Greek/Cyrillic, Thai, Arabic, Hebrew, Devanagari, symbols and emoji. The browser picks the first
 * font that has each glyph, so mixed-language titles (日本語 · 中文 · Ελληνικά · 😀) all render.
 */
const FALLBACK =
  '"Noto Sans JP", "Hiragino Sans", "Yu Gothic UI", "Meiryo", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", "Noto Sans TC", ' +
  '"Noto Sans", "Noto Sans Thai", "Noto Sans Arabic", "Noto Sans Hebrew", "Noto Sans Devanagari", "Noto Sans Symbols 2", ' +
  '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
const SERIF_FALLBACK = '"Noto Serif JP", "Hiragino Mincho ProN", "Yu Mincho", "Noto Serif SC", "Noto Serif TC", "Noto Serif", serif';

/** Google Fonts serves these as unicode-range subsets, so only the glyphs actually shown are downloaded. */
const FALLBACK_GOOGLE = ["Noto+Sans+JP:wght@300;400;500;700", "Noto+Sans+SC:wght@300;400;500;700", "Noto+Sans+TC:wght@400;700", "Noto+Sans:wght@300;400;500;700", "Noto+Sans+Thai", "Noto+Sans+Arabic"];

/** Fonts offered in Settings. `google` = family loaded from Google Fonts on demand. */
/**
 * `fix` = vertical metrics (em) that put Hangul in the middle of its line box. Nanum fonts ship metrics
 * that leave text sitting high in buttons, chips and rows; these replace them (ascent/descent-override).
 */
export const FONTS: { id: string; name: string; stack: string; google?: string; fix?: { ascent: number; descent: number; size?: number } }[] = [
  { id: "system", name: "기본 (시스템)", stack: `"Pretendard", "Inter", system-ui, -apple-system, "Segoe UI", "Apple SD Gothic Neo", "Malgun Gothic", ${FALLBACK}` },
  { id: "noto", name: "본고딕 (Noto Sans)", stack: `"Noto Sans KR", ${FALLBACK}`, google: "Noto+Sans+KR:wght@300;400;500;600;700;800" },
  { id: "nanum", name: "나눔고딕", stack: `"Nanum Gothic", "Noto Sans KR", ${FALLBACK}`, google: "Nanum+Gothic:wght@400;700;800", fix: { ascent: 1, descent: 0.15 } },
  { id: "gothic", name: "Gothic A1", stack: `"Gothic A1", "Noto Sans KR", ${FALLBACK}`, google: "Gothic+A1:wght@300;400;500;600;700;800" },
  { id: "plex", name: "IBM Plex Sans KR", stack: `"IBM Plex Sans KR", "Noto Sans KR", ${FALLBACK}`, google: "IBM+Plex+Sans+KR:wght@300;400;500;600;700" },
  { id: "myeongjo", name: "나눔명조 (세리프)", stack: `"Nanum Myeongjo", "Noto Serif KR", ${SERIF_FALLBACK}`, google: "Nanum+Myeongjo:wght@400;700;800", fix: { ascent: 1, descent: 0.15, size: 1.04 } },
];

function ensureFont(id: string, families: string[], fix?: { ascent: number; descent: number; size?: number }) {
  if (document.getElementById(id)) return;
  const href = `https://fonts.googleapis.com/css2?${families.map((f) => `family=${f}`).join("&")}&display=swap`;
  const link = () => document.head.appendChild(Object.assign(document.createElement("link"), { id, rel: "stylesheet", href }));
  if (!fix) { link(); return; }
  // same stylesheet, with corrected metrics added to every @font-face
  const style = document.head.appendChild(Object.assign(document.createElement("style"), { id }));
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
  const extra = `ascent-override: ${pct(fix.ascent)}; descent-override: ${pct(fix.descent)}; line-gap-override: 0%;${fix.size ? ` size-adjust: ${pct(fix.size)};` : ""}`;
  fetch(href)
    .then((r) => (r.ok ? r.text() : Promise.reject()))
    .then((css) => { style.textContent = css.replace(/@font-face\s*{/g, `@font-face { ${extra}`); })
    .catch(() => { style.remove(); link(); });
}

function initialText(): TextPrefs {
  try { return { ...DEFAULT_TEXT, ...JSON.parse(localStorage.getItem(TEXT_KEY) ?? "{}") }; } catch { return DEFAULT_TEXT; }
}

function applyText(t: TextPrefs) {
  const root = document.documentElement;
  const f = FONTS.find((x) => x.id === t.font) ?? FONTS[0];
  if (f.google) ensureFont(`font-${f.id}`, [f.google], f.fix);
  ensureFont("font-fallback", f.id === "myeongjo" ? [...FALLBACK_GOOGLE, "Noto+Serif+JP:wght@400;700", "Noto+Serif+SC:wght@400;700"] : FALLBACK_GOOGLE);
  root.style.setProperty("--font", f.stack);
  root.style.setProperty("--ts", String(t.scale));
  root.classList.toggle("fw-light", t.weight === "light");
  root.classList.toggle("fw-bold", t.weight === "bold");
}
const mq = typeof window !== "undefined" ? window.matchMedia("(prefers-color-scheme: dark)") : null;

/** Preset accent colors (hex). null = the built-in indigo. */
export const ACCENTS: { name: string; hex: string }[] = [
  { name: "인디고", hex: "#6366f1" }, { name: "보라", hex: "#8b5cf6" }, { name: "핑크", hex: "#ec4899" }, { name: "로즈", hex: "#f43f5e" },
  { name: "주황", hex: "#f97316" }, { name: "앰버", hex: "#d97706" }, { name: "에메랄드", hex: "#10b981" }, { name: "청록", hex: "#14b8a6" },
  { name: "하늘", hex: "#0ea5e9" }, { name: "파랑", hex: "#3b82f6" }, { name: "슬레이트", hex: "#64748b" },
];

const rgb = (hex: string) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const mix = (c: number[], w: number) => c.map((v) => Math.round(v + (255 - v) * w));
const lum = ([r, g, b]: number[]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

/** Accent = inline CSS variables on <html>; dark mode gets a lighter tint so it reads on dark surfaces. */
function applyAccent(hex: string | null, dark: boolean) {
  const st = document.documentElement.style;
  if (!hex) { st.removeProperty("--accent"); st.removeProperty("--accent-fg"); return; }
  const c = dark ? mix(rgb(hex), 0.22) : rgb(hex);
  st.setProperty("--accent", c.join(" "));
  st.setProperty("--accent-fg", lum(c) > 0.62 ? "17 17 19" : "255 255 255");
}

function apply(mode: ThemeMode) {
  const host = document.documentElement.getAttribute("data-theme"); // set by an embedding viewer
  const sys = host === "dark" || host === "light" ? host === "dark" : !!mq?.matches;
  const dark = mode === "dark" || (mode === "system" && sys);
  document.documentElement.classList.toggle("dark", dark);
  applyAccent(useTheme?.getState?.().accent ?? initialAccent(), dark);
}

function initialAccent(): string | null {
  try { const v = localStorage.getItem(ACCENT_KEY); return v && /^#[0-9a-f]{6}$/i.test(v) ? v : null; } catch { return null; }
}

function initial(): ThemeMode {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch { /* ignore */ }
  return "system";
}

const CUSTOM_KEY = "curio.customColors";
let paletteTimer: ReturnType<typeof setTimeout> | undefined;

/** Load "내 색" from the library (shared by every device using it); first run uploads this device's. */
export async function loadLibraryPalette() {
  const { api } = await import("@/api");
  const saved = await api.getSettings<{ custom?: string[] }>("palette").catch(() => null);
  if (saved?.custom) {
    try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(saved.custom)); } catch { /* ignore */ }
    useTheme.setState({ custom: saved.custom });
  } else if (useTheme.getState().custom.length) {
    await api.setSettings("palette", { custom: useTheme.getState().custom }).catch(() => undefined);
  }
}
const initialCustom = (): string[] => {
  try { const v = JSON.parse(localStorage.getItem(CUSTOM_KEY) ?? "[]"); return Array.isArray(v) ? v.filter((x) => typeof x === "string") : []; } catch { return []; }
};

export const useTheme = create<{
  mode: ThemeMode; accent: string | null; text: TextPrefs;
  /** colours the user made with the colour picker (shown as extra swatches) */
  custom: string[];
  set(m: ThemeMode): void; cycle(): void; setAccent(hex: string | null): void; setText(p: Partial<TextPrefs>): void;
  setCustom(list: string[]): void;
}>((set, get) => ({
  mode: initial(),
  accent: initialAccent(),
  text: initialText(),
  custom: initialCustom(),
  setCustom(list) {
    const custom = [...new Set(list.map((c) => c.toLowerCase()))].slice(0, 24);
    try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(custom)); } catch { /* ignore */ }
    set({ custom });
    // kept in the library too, so other devices / the web version show the same colours
    clearTimeout(paletteTimer);
    paletteTimer = setTimeout(() => void import("@/api").then(({ api }) => api.setSettings("palette", { custom })).catch(() => undefined), 400);
  },
  setText(p) {
    const text = { ...get().text, ...p };
    try { localStorage.setItem(TEXT_KEY, JSON.stringify(text)); } catch { /* ignore */ }
    applyText(text);
    set({ text });
  },
  setAccent(accent) {
    try { if (accent) localStorage.setItem(ACCENT_KEY, accent); else localStorage.removeItem(ACCENT_KEY); } catch { /* ignore */ }
    set({ accent });
    apply(get().mode);
  },
  set(mode) {
    try { localStorage.setItem(KEY, mode); } catch { /* ignore */ }
    apply(mode);
    set({ mode });
  },
  cycle() {
    const order: ThemeMode[] = ["light", "dark", "system"];
    get().set(order[(order.indexOf(get().mode) + 1) % order.length]);
  },
}));

apply(useTheme.getState().mode);
applyText(useTheme.getState().text);
mq?.addEventListener("change", () => apply(useTheme.getState().mode));
new MutationObserver(() => apply(useTheme.getState().mode)).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
