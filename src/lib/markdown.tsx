import type { ReactNode } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import type { Block, BlockType } from "@/api/types";
import { uid } from "./format";

/**
 * Inline markdown → React nodes (no innerHTML, so nothing in a note can inject markup).
 * **bold**  *italic* / _italic_  ~~strike~~  `code`  [text](url)  bare https://links  $LaTeX$
 * (KaTeX output is generated markup with `trust: false`, so user text cannot inject HTML through it.)
 */
export function tex(src: string, display: boolean): string {
  return katex.renderToString(src, { displayMode: display, throwOnError: false, trust: false, strict: "ignore", output: "htmlAndMathml" });
}

const INLINE = /(\$[^\s$](?:[^$]*?[^\s$])?\$|\*\*[^*]+\*\*|__[^_]+__|~~[^~]+~~|`[^`]+`|\[[^\]]+\]\((?:https?:\/\/|mailto:)[^)\s]+\)|https?:\/\/[^\s<>()]+|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g;

export function renderInline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(INLINE)) {
    const t = m[0];
    if (m.index! > last) out.push(text.slice(last, m.index));
    const k = i++;
    if (t.startsWith("$")) out.push(<span key={k} className="katex-inline" dangerouslySetInnerHTML={{ __html: tex(t.slice(1, -1), false) }} />);
    else if (t.startsWith("**") || t.startsWith("__")) out.push(<strong key={k} className="font-semibold">{renderInline(t.slice(2, -2))}</strong>);
    else if (t.startsWith("~~")) out.push(<s key={k} className="text-muted">{renderInline(t.slice(2, -2))}</s>);
    else if (t.startsWith("`")) out.push(<code key={k} className="rounded bg-subtle px-1 py-0.5 font-mono text-[0.9em] text-pink-600 dark:text-pink-400">{t.slice(1, -1)}</code>);
    else if (t.startsWith("[")) {
      const [, label, href] = t.match(/^\[([^\]]+)\]\(([^)]+)\)$/)!;
      out.push(<a key={k} href={href} target="_blank" rel="noreferrer" className="text-accent underline underline-offset-2" onClick={(e) => e.stopPropagation()}>{renderInline(label)}</a>);
    } else if (t.startsWith("http")) out.push(<a key={k} href={t} target="_blank" rel="noreferrer" className="break-all text-accent underline underline-offset-2" onClick={(e) => e.stopPropagation()}>{t}</a>);
    else out.push(<em key={k}>{renderInline(t.slice(1, -1))}</em>);
    last = m.index! + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Line prefixes that turn a paragraph into another block type while typing. Longest first. */
export const PREFIXES: [RegExp, BlockType][] = [
  [/^### /, "h3"], [/^## /, "heading"], [/^# /, "h1"],
  [/^\[[ xX]?\] /, "todo"], [/^[-*+] /, "bullet"], [/^\d+[.)] /, "numbered"],
  [/^> /, "quote"], [/^! /, "callout"], [/^```/, "code"], [/^\$\$/, "math"], [/^(---|\*\*\*)$/, "divider"],
];

/** Markdown text (pasted or typed) → blocks. */
export function parseMarkdown(md: string): Block[] {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const out: Block[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("$$")) {
      const one = line.match(/^\$\$(.+)\$\$$/);
      if (one) { out.push({ id: uid(), type: "math", text: one[1].trim() }); continue; }
      const body: string[] = [line.slice(2)].filter(Boolean);
      while (++i < lines.length && !lines[i].trim().endsWith("$$")) body.push(lines[i]);
      if (i < lines.length) { const last = lines[i].trim().slice(0, -2); if (last) body.push(last); }
      out.push({ id: uid(), type: "math", text: body.join("\n") });
      continue;
    }
    if (line.startsWith("```")) {
      const body: string[] = [];
      while (++i < lines.length && !lines[i].startsWith("```")) body.push(lines[i]);
      out.push({ id: uid(), type: "code", text: body.join("\n") });
      continue;
    }
    if (!line.trim()) continue;
    const hit = PREFIXES.find(([re]) => re.test(line));
    if (!hit) { out.push({ id: uid(), type: "paragraph", text: line }); continue; }
    const [re, type] = hit;
    const checked = type === "todo" ? /^\[[xX]\]/.test(line) : undefined;
    out.push({ id: uid(), type, text: type === "divider" ? "" : line.replace(re, ""), ...(type === "todo" ? { checked } : {}) });
  }
  return out;
}
