import { ImageOff } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/api";
import type { Item } from "@/api/types";
import { KIND_META } from "@/lib/meta";
import { cn } from "@/lib/cn";

/** Cover image with lazy loading + graceful fallback (kind icon). */
export function Cover({ item, fit = "cover", className, iconSize = 28 }: {
  item: Pick<Item, "coverUri" | "kind" | "title">; fit?: "cover" | "contain"; className?: string; iconSize?: number;
}) {
  const [broken, setBroken] = useState(false);
  const src = api.mediaUrl(item.coverUri);
  useEffect(() => setBroken(false), [src]);
  const Icon = broken && src ? ImageOff : KIND_META[item.kind].icon;
  return (
    <div className={cn("overflow-hidden bg-subtle", className)}>
      {src && !broken ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setBroken(true)}
          className={cn("h-full w-full", fit === "cover" ? "object-cover" : "object-contain")}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-muted/50">
          <Icon size={iconSize} strokeWidth={1.5} />
        </div>
      )}
    </div>
  );
}
