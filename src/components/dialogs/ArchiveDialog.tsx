import { useEffect, useState } from "react";
import { useApp } from "@/store/app";
import { suggestIcons } from "@/lib/icons";
import { Modal } from "@/components/ui/Modal";
import { IconGrid } from "@/components/ui/IconGrid";

/** New archive: a name and an icon (icons matching the name are suggested). */
export function ArchiveDialog() {
  const { dialog, setDialog, createArchive } = useApp();
  const open = dialog?.type === "archive";
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<string | null>(null);
  useEffect(() => { if (open) { setName(""); setIcon(null); } }, [open]);
  if (!open) return null;
  const suggested = suggestIcons(name);
  const shown = icon ?? suggested[0] ?? "library";
  const submit = async () => { await createArchive(name, shown); setDialog(null); };
  return (
    <Modal open onClose={() => setDialog(null)} title="새 아카이브" width={560}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <div>
          <div className="label mb-1.5">이름</div>
          <input autoFocus className="input h-9" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <div className="label mb-1.5">아이콘</div>
          <IconGrid value={shown} onChange={setIcon} suggested={suggested} cols={14} />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn border border-line" onClick={() => setDialog(null)}>취소</button>
          <button className="btn btn-primary" disabled={!name.trim()}>만들기</button>
        </div>
      </form>
    </Modal>
  );
}
