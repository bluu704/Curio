import { Check } from "lucide-react";
import { Select } from "@/components/ui/Select";
import type { FieldDef, Item } from "@/api/types";
import { useApp } from "@/store/app";
import { cn } from "@/lib/cn";

/** Editor for one custom property value (stored in item.props[field.id]). */
export function FieldInput({ item, field }: { item: Item; field: FieldDef }) {
  const update = useApp((s) => s.updateItem);
  const value = item.props[field.id];
  const setValue = (v: unknown) => {
    const props = { ...item.props };
    if (v === "" || v == null || (Array.isArray(v) && !v.length)) delete props[field.id];
    else props[field.id] = v;
    void update(item.id, { props });
  };
  const ghost = "h-8 w-full rounded-md bg-transparent px-1.5 outline-none hover:bg-subtle focus:bg-subtle";

  switch (field.type) {
    case "checkbox":
      return (
        <button
          onClick={() => setValue(!value || undefined)}
          className={cn("flex h-4 w-4 items-center justify-center rounded border", value ? "border-accent bg-accent text-accent-fg" : "border-line")}
        >
          {!!value && <Check size={12} strokeWidth={3} />}
        </button>
      );
    case "select":
      return (
        <Select bare className={ghost} value={(value as string) ?? ""} onChange={setValue}
          options={[{ value: "", label: "—" }, ...field.options.map((o) => ({ value: o, label: o }))]} />
      );
    case "multi_select": {
      const arr = (value as string[] | undefined) ?? [];
      return (
        <div className="flex flex-wrap gap-1 py-1">
          {field.options.map((o) => (
            <button key={o} onClick={() => setValue(arr.includes(o) ? arr.filter((x) => x !== o) : [...arr, o])}
              className={cn("chip cursor-pointer", arr.includes(o) && "bg-accent/15 text-accent")}>{o}</button>
          ))}
        </div>
      );
    }
    default:
      return (
        <input
          key={`${item.id}:${field.id}`}
          className={ghost}
          type={field.type === "number" ? "number" : field.type === "date" ? "date" : field.type === "url" ? "url" : "text"}
          defaultValue={(value as string | number | undefined) ?? ""}
          placeholder="비어 있음"
          onBlur={(e) => {
            const raw = e.target.value;
            const v = field.type === "number" ? (raw === "" ? undefined : Number(raw)) : raw;
            if (v !== value) setValue(v);
          }}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        />
      );
  }
}
