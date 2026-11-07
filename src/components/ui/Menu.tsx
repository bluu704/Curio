import { Check, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function MenuItem({ icon: Icon, children, onClick, checked, danger, className }: {
  icon?: LucideIcon; children: ReactNode; onClick?: () => void; checked?: boolean; danger?: boolean; className?: string;
}) {
  return (
    <button className={cn("menu-item", danger && "text-danger", className)} onClick={onClick}>
      {Icon && <Icon size={15} className={danger ? "" : "text-muted"} />}
      <span className="flex-1 truncate">{children}</span>
      {checked && <Check size={14} className="text-accent" />}
    </button>
  );
}

export const MenuSep = () => <div className="my-1 h-px bg-line" />;
export const MenuLabel = ({ children }: { children: ReactNode }) => (
  <div className="label px-2 pb-1 pt-2">{children}</div>
);
