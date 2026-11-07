import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/store/app";
import { useFormats } from "@/lib/formats";
import { iconOf } from "@/lib/icons";
import { cn } from "@/lib/cn";
import { Modal } from "@/components/ui/Modal";
import { IconGrid } from "@/components/ui/IconGrid";

/** Create a new archive: name, icon and a format (card shape, properties, online sources — Settings → 형식). */
export function ArchiveDialog() {
  const { dialog, setDialog, createArchive, setSettingsOpen } = useApp();
  const stored = useFormats((f) => f.stored); // subscribe to the stable stored object, derive the list
  const formats = useMemo(() => useFormats.getState().all(), [stored]);
  const open = dialog?.type === "archive";
  const [name, setName] = useState("");
  const [fmt, setFmt] = useState("other");
  const [icon, setIcon] = useState("heart");
  const [iconTouched, setIconTouched] = useState(false);
  useEffect(() => { if (open) { setName(""); setFmt("other"); setIcon("heart"); setIconTouched(false); } }, [open]);
  if (!open) return null;
  const submit = async () => { await createArchive(name, icon, fmt); setDialog(null); };
  return (
    <Modal open onClose={() => setDialog(null)} title="새 아카이브" width={560}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <div>
          <div className="label mb-1.5">이름</div>
          <input autoFocus className="input h-9" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <div className="label mb-1.5">아이콘</div>
          <IconGrid value={icon} onChange={(k) => { setIcon(k); setIconTouched(true); }} cols={14} />
        </div>
        <div>
          <div className="mb-1.5 flex items-center">
            <span className="label flex-1">형식</span>
            <button type="button" className="text-[length:calc(12px*var(--ts))] text-accent hover:underline" onClick={() => { setDialog(null); setSettingsOpen(true); }}>형식 관리</button>
          </div>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {formats.map((f) => {
              const I = iconOf(f.icon);
              return (
                <button key={f.id} type="button" onClick={() => { setFmt(f.id); if (!iconTouched) setIcon(f.icon); }}
                  className={cn("flex h-9 items-center gap-2 whitespace-nowrap rounded-lg border px-2.5 text-[length:calc(12px*var(--ts))]", fmt === f.id ? "border-accent bg-accent/10 text-accent" : "border-line hover:bg-subtle")}>
                  <I size={14} /><span className="truncate">{f.name}</span>
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
