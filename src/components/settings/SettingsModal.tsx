import { CircleDot, LayoutTemplate, Cloud, Database, FolderSearch, HardDrive, Info, Keyboard, Monitor, Moon, Palette, Plus, RefreshCw, Server, Shapes, Sun, Trash2, Type, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/api";
import type { FieldDef, FieldType, Kind, ListKind, WatchFolder } from "@/api/types";
import { KINDS } from "@/api/types";
import { KIND_CONFIG } from "@/lib/kinds";
import { date } from "@/lib/format";
import { useApp } from "@/store/app";
import { ACCENTS, FONTS, useTheme, type ThemeMode, type Weight } from "@/store/theme";
import { STATUS_ICONS, TONES, TONE_HEX } from "@/lib/statuses";
import { ICON_CHOICES, iconOf } from "@/lib/icons";
import { Popover } from "@/components/ui/Popover";
import { ColorPicker } from "@/components/ui/ColorPicker";
import { FormatsTab } from "./FormatsTab";
import { CloudTab } from "./CloudTab";
import { IconGrid } from "@/components/ui/IconGrid";
import { ACTIONS, FIXED, comboOf, prettyCombo, recording, useKeymap, type ActionId } from "@/hooks/useShortcuts";
import { uid } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Modal } from "@/components/ui/Modal";
import { FIELD_ICONS, FIELD_LABELS } from "./fieldIcons";

type Tab = "general" | "text" | "status" | "formats" | "fields" | "watch" | "cloud" | "keys" | "storage" | "about";
const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: "general", label: "일반", icon: Palette },
  { id: "text", label: "글자", icon: Type },
  { id: "status", label: "상태", icon: CircleDot },
  { id: "formats", label: "형식", icon: LayoutTemplate },
  { id: "fields", label: "속성", icon: Shapes },
  { id: "watch", label: "감시 폴더", icon: FolderSearch },
  { id: "cloud", label: "클라우드", icon: Cloud },
  { id: "keys", label: "단축키", icon: Keyboard },
  { id: "storage", label: "저장소", icon: HardDrive },
  { id: "about", label: "정보", icon: Info },
];

export function SettingsModal() {
  const { settingsOpen, setSettingsOpen } = useApp();
  const [tab, setTab] = useState<Tab>("general");
  return (
    <Modal open={settingsOpen} onClose={() => setSettingsOpen(false)} title="설정" width={680}>
      <div className="-m-5 flex min-h-[380px] max-md:flex-col">
        <nav className="flex w-40 shrink-0 gap-0.5 border-line p-2 max-md:w-full max-md:overflow-x-auto max-md:border-b md:flex-col md:border-r">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={cn("menu-item max-md:w-auto", tab === t.id && "bg-subtle font-medium")}>
              <t.icon size={15} className="text-muted" />{t.label}
            </button>
          ))}
        </nav>
        <div className="min-w-0 flex-1 p-5 max-md:p-4">
          {tab === "general" && <General />}
          {tab === "text" && <TextSettings />}
          {tab === "status" && <Statuses />}
          {tab === "formats" && <FormatsTab />}
          {tab === "keys" && <Keys />}
          {tab === "fields" && <Fields />}
          {tab === "watch" && <Watch />}
          {tab === "cloud" && <CloudTab />}
          {tab === "storage" && <Storage />}
          {tab === "about" && <About />}
        </div>
      </div>
    </Modal>
  );
}

function General() {
  const { mode, set, accent, setAccent } = useTheme();
  const opts: { m: ThemeMode; label: string; icon: LucideIcon }[] = [
    { m: "light", label: "라이트", icon: Sun }, { m: "dark", label: "다크", icon: Moon }, { m: "system", label: "시스템", icon: Monitor },
  ];
  return (
    <div>
      <div className="label mb-2">테마</div>
      <div className="grid grid-cols-3 gap-2">
        {opts.map((o) => (
          <button key={o.m} onClick={() => set(o.m)}
            className={cn("flex flex-col items-center gap-2 rounded-xl border p-4 transition-colors",
              mode === o.m ? "border-accent bg-accent/10 text-accent" : "border-line hover:bg-subtle")}>
            <o.icon size={22} strokeWidth={1.7} />
            <span className="text-[length:calc(12px*var(--ts))] font-medium">{o.label}</span>
          </button>
        ))}
      </div>

      <div className="label mb-2 mt-6">강조색</div>
      <div className="flex flex-wrap items-center gap-1.5">
        {ACCENTS.map((a) => {
          const on = (accent ?? "#6366f1").toLowerCase() === a.hex;
          return (
            <button key={a.hex} data-tip={a.name} onClick={() => setAccent(a.hex === "#6366f1" ? null : a.hex)}
              className={cn("h-7 w-7 shrink-0 rounded-full ring-offset-2 ring-offset-elevated transition-transform hover:scale-110", on && "ring-2 ring-fg/60")}
              style={{ background: a.hex }} />
          );
        })}
        {/* rainbow wheel → the app's own colour picker for any other colour */}
        <Popover trigger={({ toggle, open }) => (
          <button onClick={toggle} data-tip="다른 색 고르기"
            className={cn("h-7 w-7 shrink-0 rounded-full ring-offset-2 ring-offset-elevated transition-transform hover:scale-110",
              (open || (accent && !ACCENTS.some((a) => a.hex === accent.toLowerCase()))) && "ring-2 ring-fg/60")}
            style={{ background: "conic-gradient(#f43f5e, #f97316, #eab308, #22c55e, #06b6d4, #3b82f6, #8b5cf6, #ec4899, #f43f5e)" }} />
        )}>
          {(close) => <ColorPicker value={accent ?? "#6366f1"} onChange={(hex) => setAccent(hex)} onDone={close} />}
        </Popover>
      </div>
    </div>
  );
}

function TextSettings() {
  const { text, setText } = useTheme();
  const weights: { w: Weight; label: string }[] = [{ w: "light", label: "얇게" }, { w: "normal", label: "보통" }, { w: "bold", label: "진하게" }];
  return (
    <div className="space-y-6">
      <div>
        <div className="label mb-2">글꼴</div>
        <div className="grid grid-cols-2 gap-1.5">
          {FONTS.map((f) => (
            <button key={f.id} onClick={() => setText({ font: f.id })} style={{ fontFamily: f.stack }}
              className={cn("flex h-11 items-center justify-between whitespace-nowrap rounded-lg border px-3 text-left", text.font === f.id ? "border-accent bg-accent/10 text-accent" : "border-line hover:bg-subtle")}>
              <span className="truncate">{f.name}</span><span className="text-muted">가나 Aa</span>
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="label mb-2">글자 진하기</div>
        <div className="inline-flex rounded-lg bg-subtle p-0.5">
          {weights.map(({ w, label }) => (
            <button key={w} onClick={() => setText({ weight: w })}
              className={cn("h-8 whitespace-nowrap rounded-md px-4", text.weight === w ? "bg-surface text-fg shadow-card" : "text-muted hover:text-fg")}
              style={{ fontWeight: w === "light" ? 300 : w === "bold" ? 700 : 400 }}>{label}</button>
          ))}
        </div>
      </div>
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="label">글자 크기</span>
          <span className="text-[length:calc(12px*var(--ts))] tabular-nums text-muted">{Math.round(text.scale * 100)}%</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-muted">가</span>
          <input type="range" min={0.85} max={1.3} step={0.05} value={text.scale} onChange={(e) => setText({ scale: Number(e.target.value) })} className="flex-1 accent-[rgb(var(--accent))]" />
          <span className="text-[17px] text-muted">가</span>
          <button className="btn h-7 border border-line" onClick={() => setText({ scale: 1 })}>기본</button>
        </div>
      </div>
      <div className="rounded-xl border border-line p-4">
        <div className="text-[length:calc(15px*var(--ts))] font-semibold">제목</div>
        <div className="mt-1 text-[length:calc(12px*var(--ts))] text-muted">작가</div>
        <p className="mt-2 text-[length:calc(13px*var(--ts))] leading-relaxed">테스트용 문장입니다. Test · テスト · 测试 · Тест</p>
      </div>
    </div>
  );
}

function Statuses() {
  const { statuses, saveStatus, deleteStatus } = useApp();
  const [name, setName] = useState("");
  const add = async () => {
    if (!name.trim()) return;
    await saveStatus({ id: uid(), label: name.trim(), icon: "star", color: TONES[statuses.length % TONES.length], position: statuses.length });
    setName("");
  };
  return (
    <div className="space-y-4">
      <p className="text-[length:calc(12px*var(--ts))] text-muted">모든 아카이브에서 함께 써요. 아이콘·색을 눌러 바꾸고, 지운 상태의 항목은 첫 번째 상태로 옮겨져요.</p>
      <div className="space-y-1">
        {statuses.map((d) => {
          const I = STATUS_ICONS[d.icon] ?? iconOf(d.icon);
          const fallback = statuses.find((x) => x.id !== d.id)?.id ?? "";
          return (
            <div key={d.id} className={cn("flex items-center gap-2 rounded-lg border border-line p-1.5", `tone-${d.color}`)}>
              <Popover width={252} trigger={({ toggle }) => (
                <button onClick={toggle} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md tone-bg" data-tip="아이콘·색"><I size={16} /></button>
              )}>
                <div className="p-1.5">
                  <div className="label mb-1">아이콘</div>
                  <IconGrid value={d.icon} onChange={(icon) => void saveStatus({ ...d, icon })} choices={[...Object.keys(STATUS_ICONS), ...ICON_CHOICES.filter((k) => !(k in STATUS_ICONS))]} cols={7} />
                  <div className="label mb-1 mt-2">색</div>
                  <div className="flex gap-1">
                    {TONES.map((t) => (
                      <button key={t} onClick={() => void saveStatus({ ...d, color: t })} style={{ background: TONE_HEX[t] }}
                        className={cn("h-6 w-6 rounded-full ring-offset-1 ring-offset-elevated", d.color === t && "ring-2 ring-fg/60")} />
                    ))}
                  </div>
                </div>
              </Popover>
              <input className="input h-8 flex-1 border-transparent bg-transparent hover:border-line" defaultValue={d.label}
                onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== d.label && void saveStatus({ ...d, label: e.target.value.trim() })}
                onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
              <button className="btn-icon h-8 w-8 hover:text-danger" disabled={statuses.length <= 1} data-tip="삭제"
                onClick={() => void deleteStatus(d.id, fallback)}><Trash2 size={14} /></button>
            </div>
          );
        })}
      </div>
      <div className="flex gap-2">
        <input className="input flex-1" placeholder="새 상태 이름" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void add()} />
        <button className="btn btn-primary" onClick={() => void add()}><Plus size={15} />추가</button>
      </div>
    </div>
  );
}

function Keys() {
  const { map, bind, reset } = useKeymap();
  const [rec, setRec] = useState<ActionId | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { recording.on = rec !== null; return () => { recording.on = false; }; }, [rec]);
  const Cap = ({ k }: { k: string }) => (
    <kbd className="rounded-md border border-line bg-surface px-1.5 py-0.5 font-mono text-[length:calc(11px*var(--ts))] text-muted shadow-card">{k}</kbd>
  );
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-[length:calc(12px*var(--ts))] text-muted">
        <span className="flex-1">단축키를 눌러 바꾼 뒤 새 키를 누르세요. Esc를 누르면 취소돼요.</span>
        <button className="btn h-7 border border-line" onClick={() => { reset(); setMsg("모두 기본값으로 되돌렸어요"); }}>모두 기본값</button>
      </div>
      {msg && <div className="rounded-lg bg-accent/10 px-3 py-1.5 text-[length:calc(12px*var(--ts))] text-accent">{msg}</div>}
      <div className="space-y-0.5">
        {ACTIONS.map((a) => (
          <div key={a.id} className="group flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-subtle">
            <span className="min-w-0 flex-1 truncate">{a.label}</span>
            <button
              className={cn("flex h-8 min-w-24 items-center justify-end gap-1 rounded-md px-2", rec === a.id ? "bg-accent/15 ring-1 ring-accent" : "hover:bg-line/50")}
              onClick={() => { setMsg(null); setRec(rec === a.id ? null : a.id); }}
              onKeyDown={(e) => {
                if (rec !== a.id) return;
                e.preventDefault(); e.stopPropagation();
                if (e.key === "Escape") return setRec(null);
                const c = comboOf(e);
                if (!c) return;
                const taken = bind(a.id, c);
                setRec(null);
                setMsg(taken ? `${prettyCombo(c)} — "${ACTIONS.find((x) => x.id === taken)?.label}"에서 옮겨왔어요` : `${a.label}: ${prettyCombo(c)}`);
              }}
            >
              {rec === a.id ? <span className="whitespace-nowrap text-[length:calc(12px*var(--ts))] text-accent">새 키를 누르세요…</span>
                : map[a.id].length ? map[a.id].map((c) => <Cap key={c} k={prettyCombo(c)} />) : <span className="text-[length:calc(12px*var(--ts))] text-muted">없음</span>}
            </button>
            <button className="btn-icon h-7 w-7 opacity-0 group-hover:opacity-100" data-tip="기본값" onClick={() => reset(a.id)}><RefreshCw size={13} /></button>
          </div>
        ))}
        {FIXED.map(([k, label]) => (
          <div key={k} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-muted">
            <span className="flex-1">{label}</span><Cap k={k} /><span className="w-7" />
          </div>
        ))}
      </div>
    </div>
  );
}

function Fields() {
  const { fields, saveField, deleteField } = useApp();
  const [name, setName] = useState("");
  const [type, setType] = useState<FieldType>("text");
  const add = async () => {
    if (!name.trim()) return;
    const f: FieldDef = { id: uid(), name: name.trim(), type, options: [], position: fields.length };
    await saveField(f);
    setName("");
  };
  return (
    <div className="space-y-4">
      <p className="text-[length:calc(12px*var(--ts))] text-muted">모든 항목에 공통으로 붙는 사용자 정의 속성이에요. 상세 패널에 표시돼요.</p>
      <div className="space-y-1">
        {fields.map((f) => {
          const I = FIELD_ICONS[f.type];
          const hasOptions = f.type === "select" || f.type === "multi_select";
          return (
            <div key={f.id} className="rounded-lg border border-line p-2">
              <div className="flex items-center gap-2">
                <I size={15} className="text-muted" />
                <input className="input h-7 flex-1 border-transparent bg-transparent hover:border-line" defaultValue={f.name}
                  onBlur={(e) => e.target.value.trim() && e.target.value !== f.name && void saveField({ ...f, name: e.target.value.trim() })} />
                <span className="text-[length:calc(11px*var(--ts))] text-muted">{FIELD_LABELS[f.type]}</span>
                <button className="btn-icon h-7 w-7 hover:text-danger" onClick={() => void deleteField(f.id)} data-tip="삭제"><Trash2 size={14} /></button>
              </div>
              {hasOptions && (
                <input className="input mt-1.5 h-7 text-[length:calc(12px*var(--ts))]" placeholder="옵션 (쉼표로 구분)" defaultValue={f.options.join(", ")}
                  onBlur={(e) => void saveField({ ...f, options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />
              )}
            </div>
          );
        })}
      </div>
      <div className="flex gap-2">
        <input className="input flex-1" placeholder="새 속성 이름" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void add()} />
        <select className="input w-32" value={type} onChange={(e) => setType(e.target.value as FieldType)}>
          {(Object.keys(FIELD_LABELS) as FieldType[]).map((t) => <option key={t} value={t}>{FIELD_LABELS[t]}</option>)}
        </select>
        <button className="btn btn-primary" onClick={() => void add()}><Plus size={15} />추가</button>
      </div>
    </div>
  );
}

function Watch() {
  const [list, setList] = useState<WatchFolder[]>([]);
  const [kind, setKind] = useState<Kind>("illust");
  const [lk, setLk] = useState<ListKind>("archive");
  const [busy, setBusy] = useState(false);
  const { refresh, notify } = useApp();
  const load = () => void api.listWatchFolders().then(setList);
  useEffect(load, []);
  const add = async () => {
    const p = await api.pickPaths({ directory: true, multiple: false });
    if (!p?.[0]) return;
    await api.addWatchFolder(p[0], kind, lk);
    load();
  };
  const rescan = async () => {
    setBusy(true);
    try { const n = await api.rescan(); notify(`새 항목 ${n}개`); await refresh(); load(); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-4">
      <p className="text-[length:calc(12px*var(--ts))] leading-relaxed text-muted">
        지정한 폴더 <b className="text-fg">바로 아래</b>에 파일·폴더가 생기면 자동으로 항목이 추가돼요 (하나당 한 항목).
        앱이 켜져 있는 동안 실시간으로 감시하고, 시작할 때도 한 번 확인해요.
      </p>
      <div className="space-y-1">
        {list.map((w) => (
          <div key={w.id} className="flex items-center gap-2 rounded-lg border border-line p-2">
            <FolderSearch size={15} className="shrink-0 text-muted" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-mono text-[length:calc(12px*var(--ts))]">{w.path}</div>
              <div className="text-[length:calc(11px*var(--ts))] text-muted">{KIND_CONFIG[w.kind].label} · {w.list === "wishlist" ? "위시리스트" : "아카이브"}{w.lastScan ? ` · ${date(w.lastScan)} 확인` : ""}</div>
            </div>
            <button className="btn-icon h-7 w-7 hover:text-danger" onClick={async () => { await api.removeWatchFolder(w.id); load(); }} data-tip="감시 해제"><Trash2 size={14} /></button>
          </div>
        ))}
        {!list.length && <div className="rounded-lg border border-dashed border-line p-4 text-center text-[length:calc(12px*var(--ts))] text-muted">감시 중인 폴더가 없어요</div>}
      </div>
      <div className="flex gap-2">
        <select className="input w-36" value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
          {KINDS.map((k) => <option key={k} value={k}>{KIND_CONFIG[k].label}</option>)}
        </select>
        <select className="input w-32" value={lk} onChange={(e) => setLk(e.target.value as ListKind)}>
          <option value="archive">아카이브</option><option value="wishlist">위시리스트</option>
        </select>
        <button className="btn btn-primary" onClick={() => void add()}><Plus size={15} />폴더 추가</button>
        <button className="btn ml-auto border border-line" disabled={busy} onClick={() => void rescan()}><RefreshCw size={14} className={busy ? "animate-spin" : ""} />지금 확인</button>
      </div>
    </div>
  );
}

function Storage() {
  const rows: { icon: LucideIcon; title: string; desc: string; status: string; on: boolean }[] = [
    { icon: Database, title: "로컬 라이브러리", desc: "SQLite · 앱 데이터 폴더/curio.db", status: api.caps.platform === "tauri" ? "사용 중" : "미리보기 모드", on: true },
    { icon: HardDrive, title: "로컬 파일 연결", desc: "원본을 복사하지 않고 경로만 기록", status: api.caps.localFiles ? "사용 가능" : "데스크톱 앱 필요", on: api.caps.localFiles },
    { icon: Server, title: "개인 서버 (웹 접속)", desc: "curio-server · CURIO_TOKEN 으로 접속 보호", status: api.caps.platform === "http" ? "연결됨" : "사용 가능", on: api.caps.platform === "http" },
  ];
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.title} className="flex items-center gap-3 rounded-xl border border-line p-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-subtle"><r.icon size={18} className="text-muted" /></div>
          <div className="min-w-0 flex-1">
            <div className="font-medium">{r.title}</div>
            <div className="truncate text-[length:calc(12px*var(--ts))] text-muted">{r.desc}</div>
          </div>
          <span className={cn("rounded-md px-2 py-0.5 text-[length:calc(11px*var(--ts))] font-medium", r.on ? "bg-green-500/15 text-green-600 dark:text-green-400" : "bg-subtle text-muted")}>{r.status}</span>
        </div>
      ))}
    </div>
  );
}

function About() {
  return (
    <div className="space-y-2 text-[length:calc(13px*var(--ts))]">
      <div className="text-[length:calc(15px*var(--ts))] font-semibold">Curio 0.1.0</div>
      <div className="text-muted">개인 콘텐츠 아카이브 · Tauri + React + SQLite</div>
      <div className="text-muted">백엔드: <code className="rounded bg-subtle px-1">{api.caps.platform}</code></div>
      {api.caps.platform === "mock" && (
        <button className="btn mt-2 border border-line" onClick={() => { localStorage.removeItem("curio.mock.v3"); location.reload(); }}>
          샘플 데이터 초기화
        </button>
      )}
    </div>
  );
}
