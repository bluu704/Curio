import {
  Bookmark, BookOpen, CircleCheck, CirclePause, CirclePlay, CircleX, Clock, Eye, Flag, Flame, Gamepad2, Headphones, Heart,
  Hourglass, Repeat, Sparkles, Star, Trophy, type LucideIcon,
} from "lucide-react";
import type { StatusDef } from "@/api/types";
import { useApp } from "@/store/app";
import { iconOf } from "./icons";

/** Icons a status can use (key stored in DB). */
export const STATUS_ICONS: Record<string, LucideIcon> = {
  bookmark: Bookmark, play: CirclePlay, check: CircleCheck, pause: CirclePause, x: CircleX, clock: Clock, hourglass: Hourglass,
  eye: Eye, repeat: Repeat, star: Star, heart: Heart, flame: Flame, flag: Flag, trophy: Trophy, sparkles: Sparkles,
  book: BookOpen, game: Gamepad2, headphones: Headphones,
};

/** Color keys → `.tone-*` classes in styles/index.css */
export const TONES = ["slate", "blue", "green", "amber", "red", "violet", "pink", "teal"] as const;
export const TONE_HEX: Record<string, string> = {
  slate: "#78716c", blue: "#3b82f6", green: "#22c55e", amber: "#f59e0b", red: "#ef4444", violet: "#8b5cf6", pink: "#ec4899", teal: "#14b8a6",
};

export const DEFAULT_STATUSES: StatusDef[] = [
  { id: "planned", label: "볼 예정", icon: "bookmark", color: "slate", position: 0 },
  { id: "in_progress", label: "감상 중", icon: "play", color: "blue", position: 1 },
  { id: "completed", label: "완료", icon: "check", color: "green", position: 2 },
  { id: "on_hold", label: "보류", icon: "pause", color: "amber", position: 3 },
  { id: "dropped", label: "중단", icon: "x", color: "red", position: 4 },
];

export interface StatusMeta { label: string; icon: LucideIcon; tone: string }

export function statusMeta(id: string): StatusMeta {
  const list = useApp.getState().statuses;
  const d = list.find((s) => s.id === id) ?? DEFAULT_STATUSES.find((s) => s.id === id);
  return d
    ? { label: d.label, icon: STATUS_ICONS[d.icon] ?? iconOf(d.icon), tone: `tone-${d.color}` }
    : { label: id, icon: Bookmark, tone: "tone-slate" };
}

/** `STATUS_META[id]` → live lookup into the user's status list (falls back to built-ins). */
export const STATUS_META = new Proxy({} as Record<string, StatusMeta>, { get: (_, id) => statusMeta(String(id)) });

/** Folder colors (category tree). null = default amber. */
export const FOLDER_COLORS = ["red", "amber", "green", "teal", "blue", "violet", "pink", "slate", "orange"] as const;
export const FOLDER_NAMES: Record<string, string> = {
  red: "빨강", amber: "노랑", green: "초록", teal: "청록", blue: "파랑", violet: "보라", pink: "분홍", slate: "회색", orange: "주황",
};
const FOLDER_HEX: Record<string, string> = { ...TONE_HEX, orange: "#f97316", amber: "#eab308" };
export const folderColor = (c: string | null | undefined) => (c ? FOLDER_HEX[c] ?? c : "#f59e0b");
