import { Calendar, CircleCheck, Hash, Link, List, ListChecks, Type, type LucideIcon } from "lucide-react";
import type { FieldType } from "@/api/types";

export const FIELD_ICONS: Record<FieldType, LucideIcon> = {
  text: Type,
  number: Hash,
  select: List,
  multi_select: ListChecks,
  date: Calendar,
  url: Link,
  checkbox: CircleCheck,
};

export const FIELD_LABELS: Record<FieldType, string> = {
  text: "텍스트",
  number: "숫자",
  select: "선택",
  multi_select: "다중 선택",
  date: "날짜",
  url: "링크",
  checkbox: "체크박스",
};
