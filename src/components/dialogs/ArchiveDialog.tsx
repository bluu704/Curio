import { useEffect, useState } from "react";
import type { Kind } from "@/api/types";
import { KINDS } from "@/api/types";
import { useApp } from "@/store/app";
import { KIND_CONFIG } from "@/lib/kinds";
import { cn } from "@/lib/cn";
import { Modal } from "@/components/ui/Modal";
import { IconGrid } from "@/components/ui/IconGrid";

/** Create a new archive: name, icon and a template (decides card shape, fields and search sources). */
export function ArchiveDialog() {
  const { dialog, setDialog, createArchive } = useApp();
  const open = dialog?.type === "archive";
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Kind>("other");
  const [icon, setIcon] = useState("heart");
  useEffect(() => { if (open) { setName(""); setKind("other"); setIcon("heart"); } }, [open]);
  if (!open) return null;
  const submit = async () => { await createArchive(name, icon, kind); setDialog(null); };
  return (
    <Modal open onClose={() => setDialog(null)} title="새 아카이브" width={520}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <div>
          <div className="label mb-1.5">이름</div>
          <input autoFocus className="input h-9" value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 보컬로이드, 피규어, 굿즈" />
        </div>
        <div>
          <div className="label mb-1.5">아이콘</div>
          <IconGrid value={icon} onChange={setIcon} cols={12} />
        </div>
        <div>
          <div className="label mb-1.5">형식 (카드 모양 · 표시 항목 · 자동 검색 소스)</div>
          <div className="grid grid-cols-3 gap-1.5">
            {KINDS.map((k) => {
              const C = KIND_CONFIG[k];
              return (
                <button key={k} type="button" onClick={() => { setKind(k); if (icon === "heart" || KINDS.includes(icon as Kind)) setIcon(k); }}
                  className={cn("flex h-9 items-center gap-2 whitespace-nowrap rounded-lg border px-2.5 text-[length:calc(12px*var(--ts))]", kind === k ? "border-accent bg-accent/10 text-accent" : "border-line hover:bg-subtle")}>
                  <C.icon size={14} />{C.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn border border-line" onClick={() => setDialog(null)}>취소</button>
          <button className="btn btn-primary" disabled={!name.trim()}>만들기</button>
        </div>
      </form>
    </Modal>
  );
}
