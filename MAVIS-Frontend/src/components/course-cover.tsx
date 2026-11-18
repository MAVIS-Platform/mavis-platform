import { Building2, Compass, Layers, Network, ShieldCheck, Workflow } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

const coverColors = ["#0056d2", "#7b2cbf", "#0b807c", "#c54108", "#254cda", "#bd1960"];
const coverIcons = [Building2, Compass, Network, Layers, ShieldCheck, Workflow];

function courseCoverIndex(courseId: string) {
  const hash = Array.from(courseId).reduce(
    (value, character) => (value * 31 + character.charCodeAt(0)) >>> 0,
    0,
  );
  return hash % coverColors.length;
}

export function CourseCover({
  courseId,
  className,
  children,
}: {
  courseId: string;
  className?: string;
  children?: ReactNode;
}) {
  const index = courseCoverIndex(courseId);
  const CoverIcon = coverIcons[index] ?? Building2;
  return (
    <div
      className={cn("relative h-28 shrink-0 overflow-hidden", className)}
      style={{ backgroundColor: coverColors[index] }}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/10 to-transparent" />
      <CoverIcon
        className="pointer-events-none absolute -bottom-4 -right-3 size-32 -rotate-12 text-white/15"
        aria-hidden="true"
      />
      {children}
    </div>
  );
}
