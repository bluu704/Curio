import {
  Clapperboard, Building2, Mic2, Megaphone,
  File, FileArchive, FileAudio, FileCode2, FileImage, FileText, FileVideo, Folder,
  Hash, UserRound, Shapes, Layers, Users, type LucideIcon,
} from "lucide-react";
import { KIND_CONFIG } from "./kinds";
import type { FileKind, Kind, TagCategory } from "@/api/types";

export const KIND_META: Record<Kind, { label: string; icon: LucideIcon }> = Object.fromEntries(
  Object.entries(KIND_CONFIG).map(([k, v]) => [k, { label: v.label, icon: v.icon }]),
) as Record<Kind, { label: string; icon: LucideIcon }>;

export { STATUS_META } from "./statuses";

export const TAG_META: Record<TagCategory, { label: string; icon: LucideIcon }> = {
  author: { label: "작가", icon: UserRound },
  director: { label: "감독", icon: Clapperboard },
  studio: { label: "스튜디오", icon: Building2 },
  publisher: { label: "배급·레이블", icon: Megaphone },
  cast: { label: "출연·성우", icon: Mic2 },
  circle: { label: "서클", icon: Users },
  series: { label: "시리즈", icon: Layers },
  genre: { label: "장르", icon: Shapes },
  tag: { label: "태그", icon: Hash },
};

export const FILE_META: Record<FileKind, LucideIcon> = {
  video: FileVideo,
  audio: FileAudio,
  text: FileCode2,
  archive: FileArchive,
  image: FileImage,
  folder: Folder,
  document: FileText,
  other: File,
};

/** Icon names stored on View.icon / Archive.icon → component */
export { ICONS as VIEW_ICONS } from "./icons";
