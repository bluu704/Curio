import { parseMarkdown, renderInline, tex } from "@/lib/markdown";
import { cn } from "@/lib/cn";

/** Read-only markdown (same dialect as memos: headings, lists, todo, quote, code, $$math$$, tables). */
export function MarkdownView({ text }: { text: string }) {
  const blocks = parseMarkdown(text);
  let n = 0;
  return (
    <div className="space-y-1.5 leading-relaxed">
      {blocks.map((b) => {
        n = b.type === "numbered" ? n + 1 : 0;
        switch (b.type) {
          case "h1": return <h1 key={b.id} className="pt-2 text-[length:calc(22px*var(--ts))] font-bold">{renderInline(b.text)}</h1>;
          case "heading": return <h2 key={b.id} className="pt-2 text-[length:calc(18px*var(--ts))] font-semibold">{renderInline(b.text)}</h2>;
          case "h3": return <h3 key={b.id} className="pt-1 text-[length:calc(15px*var(--ts))] font-semibold">{renderInline(b.text)}</h3>;
          case "bullet": return <div key={b.id} className="flex gap-2"><span className="text-muted">•</span><div>{renderInline(b.text)}</div></div>;
          case "numbered": return <div key={b.id} className="flex gap-2"><span className="text-muted">{n}.</span><div>{renderInline(b.text)}</div></div>;
          case "todo": return <div key={b.id} className="flex gap-2"><input type="checkbox" readOnly checked={!!b.checked} className="mt-1.5" /><div className={cn(b.checked && "text-muted line-through")}>{renderInline(b.text)}</div></div>;
          case "quote": return <blockquote key={b.id} className="border-l-[3px] border-fg/25 pl-3 italic text-fg/80">{renderInline(b.text)}</blockquote>;
          case "callout": return <div key={b.id} className="rounded-lg bg-subtle px-3 py-2">{renderInline(b.text)}</div>;
          case "code": return <pre key={b.id} className="overflow-x-auto rounded-lg bg-subtle p-3 font-mono text-[length:calc(12px*var(--ts))]">{b.text}</pre>;
          case "math": return <div key={b.id} className="overflow-x-auto" dangerouslySetInnerHTML={{ __html: tex(b.text, true) }} />;
          case "divider": return <hr key={b.id} className="border-line" />;
          case "table": return <TableView key={b.id} rows={b.rows ?? []} />;
          default: return <p key={b.id} className="whitespace-pre-wrap">{renderInline(b.text)}</p>;
        }
      })}
    </div>
  );
}

export function TableView({ rows }: { rows: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={cn(i === 0 && "bg-subtle font-medium")}>
              {r.map((c, j) => <td key={j} className="border border-line px-2 py-1">{renderInline(c)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
