import Image from "next/image";
import { cn } from "@/lib/utils";

export function MavisLogo({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <Image
      src="/mavis-logo.png"
      alt="MAVIS"
      width={574}
      height={582}
      priority
      className={cn(compact ? "w-10" : "w-24", "h-auto shrink-0 rounded-full object-cover", className)}
    />
  );
}
