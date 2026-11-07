import { Plus, X } from "lucide-react";
import type { Block } from "@/api/types";
import { cn } from "@/lib/cn";

/** Editable table block: first row is the header. Hover to add/remove rows and columns. */
export function TableBlock({ block, onPatch }: { block: Block; onPatch: (p: Partial<Block>) => void }) {
  const rows = block.rows?.length ? block.rows : [["", ""], ["", ""]];
  const cols = Math.max(...rows.map((r) => r.length));
  const set = (next: string[][]) => onPatch({ rows: next });
  const cell = (r: number, c: number, v: string) => set(rows.map((row, i) => (i === r ? Array.from({ length: cols }, (_, j) => (j === c ? v : row[j] ?? "")) : row)));
  const addRow = () => set([...rows, Array(cols).fill("")]);
  const addCol = () => set(rows.map((r) => [...r, ""]));
  const delRow = (r: number) => rows.length > 1 && set(rows.filter((_, i) => i !== r));
  const delCol = (c: number) => cols > 1 && set(rows.map((r) => r.filter((_, j) => j !== c)));
  return (
    <div className="group/table py-1">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <tbody>
            {rows.map((row, r) => (
              <tr key={r} className="group/row">
                {Array.from({ length: cols }, (_, c) => (
                  <td key={c} className={cn("relative min-w-24 border border-line p-0", r === 0 && "bg-subtle")}>
                    <input value={row[c] ?? ""} onChange={(e) => cell(r, c, e.target.value)} placeholder={r === 0 ? `열 ${c + 1}` : ""}
                      className={cn("h-8 w-full bg-transparent px-2 outline-none placeholder:text-muted/40 focus:bg-accent/5", r === 0 && "font-medium")} />
                    {r === 0 && cols > 1 && (
                      <button onClick={() => delCol(c)} className="touch-show absolute -top-2.5 right-1 hidden h-5 w-5 items-center justify-center rounded-full border border-line bg-elevated text-muted hover:text-danger group-hover/table:flex" data-tip="열 삭제"><X size={11} /></button>
                    )}
                  </td>
                ))}
                <td className="w-6 border-0 p-0">
                  {rows.length > 1 && <button onClick={() => delRow(r)} className="touch-show ml-1 hidden h-5 w-5 items-center justify-center rounded-full text-muted hover:text-danger group-hover/row:flex" data-tip="행 삭제"><X size={12} /></button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="touch-show mt-1 flex gap-1 opacity-0 transition-opacity group-hover/table:opacity-100">
        <button className="btn h-7 px-2 text-[length:calc(12px*var(--ts))] text-muted" onClick={addRow}><Plus size={13} />행</button>
        <button className="btn h-7 px-2 text-[length:calc(12px*var(--ts))] text-muted" onClick={addCol}><Plus size={13} />열</button>
      </div>
    </div>
  );
}
