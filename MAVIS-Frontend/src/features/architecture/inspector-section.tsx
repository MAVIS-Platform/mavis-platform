"use client";
import { useId, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useLocale } from "@/lib/i18n/locale-context";
import { cn } from "@/lib/utils";

export function InspectorSection({
  title,
  open,
  onOpenChange,
  children,
  meta,
  className,
  ...props
}: Omit<ComponentPropsWithoutRef<"section">, "title"> & {
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meta?: ReactNode;
}) {
  const { t } = useLocale();
  const contentId = useId();
  return (
    <Collapsible open={open} onOpenChange={onOpenChange} asChild>
      <section {...props} className={cn("min-w-0 rounded-xl border bg-card", className)}>
        <h3>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              aria-controls={contentId}
              className="group flex min-h-11 w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-semibold transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="min-w-0 flex-1 break-words">{t(title)}</span>
              {meta}
              <ChevronDown
                aria-hidden="true"
                className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none group-data-[state=closed]:-rotate-90"
              />
            </button>
          </CollapsibleTrigger>
        </h3>
        <CollapsibleContent id={contentId} forceMount hidden={!open}>
          <div className="min-w-0 space-y-3 px-4 pb-4">{children}</div>
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}
