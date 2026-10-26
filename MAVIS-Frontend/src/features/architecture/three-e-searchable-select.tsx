"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Search, ChevronDown, Check, X } from "lucide-react";

export interface ThreeESelectOption {
  value: string;
  label: string;
  badge?: string | undefined;
  sublabel?: string | undefined;
  testId?: string | undefined;
}

export function SearchableThreeESelect({
  label,
  placeholder = "Select or search…",
  selectedValue,
  onSelect,
  options,
  testId,
}: {
  label: string;
  placeholder?: string | undefined;
  selectedValue?: string | null | undefined;
  onSelect: (value: string) => void;
  options: readonly ThreeESelectOption[];
  testId?: string | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedOption = useMemo(
    () => options.find((opt) => opt.value === selectedValue) ?? null,
    [options, selectedValue],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(q) ||
        (opt.badge && opt.badge.toLowerCase().includes(q)) ||
        (opt.sublabel && opt.sublabel.toLowerCase().includes(q)) ||
        opt.value.toLowerCase().includes(q),
    );
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 10);
    function handleOutsideClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative min-w-0 space-y-1.5" data-testid={testId}>
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs font-medium text-foreground">{label}</label>
        <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] font-medium text-muted-foreground">
          {options.length} item{options.length === 1 ? "" : "s"}
        </span>
      </div>

      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={options.length === 0}
        onClick={() => setOpen((prev) => !prev)}
        className="flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-lg border bg-background px-3 text-left text-xs transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      >
        {selectedOption ? (
          <span className="flex min-w-0 items-center gap-1.5 truncate font-medium text-foreground">
            {selectedOption.badge && (
              <span className="shrink-0 rounded bg-primary/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-primary">
                {selectedOption.badge}
              </span>
            )}
            <span className="truncate">{selectedOption.label}</span>
          </span>
        ) : (
          <span className="truncate text-muted-foreground">
            {options.length === 0 ? "No items in this scope" : placeholder}
          </span>
        )}
        <ChevronDown
          className={`size-4 shrink-0 text-muted-foreground transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div className="absolute right-0 left-0 z-50 mt-1 rounded-xl border bg-popover p-2 text-popover-foreground shadow-xl">
          <div className="relative flex items-center">
            <Search className="pointer-events-none absolute left-2.5 size-3.5 text-muted-foreground" />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  setOpen(false);
                } else if (e.key === "Enter" && filtered.length > 0) {
                  e.preventDefault();
                  onSelect(filtered[0]!.value);
                  setOpen(false);
                }
              }}
              placeholder="Filter items…"
              className="h-8 w-full rounded-md border bg-background pr-7 pl-8 text-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            />
            {query && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => {
                  setQuery("");
                  inputRef.current?.focus();
                }}
                className="absolute right-2 rounded p-0.5 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          <div className="mt-1.5 flex items-center justify-between px-1 text-[10px] text-muted-foreground">
            <span>
              Showing <strong>{filtered.length}</strong> / {options.length}
            </span>
            <span>Select to inspect</span>
          </div>

          <ul
            role="listbox"
            className="mt-1.5 max-h-64 space-y-1 overflow-y-auto pr-0.5"
          >
            {filtered.length === 0 ? (
              <li className="rounded-md px-3 py-4 text-center text-xs text-muted-foreground">
                No items matching &ldquo;{query}&rdquo;
              </li>
            ) : (
              filtered.map((opt) => {
                const isSelected = opt.value === selectedValue;
                return (
                  <li key={opt.value} role="option" aria-selected={isSelected}>
                    <button
                      type="button"
                      data-testid={opt.testId}
                      onClick={() => {
                        onSelect(opt.value);
                        setOpen(false);
                      }}
                      className={`flex w-full min-w-0 items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors ${
                        isSelected
                          ? "bg-primary text-primary-foreground font-medium"
                          : "hover:bg-muted"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {opt.badge && (
                            <span
                              className={`shrink-0 rounded px-1.5 py-0.2 font-mono text-[10px] font-semibold ${
                                isSelected
                                  ? "bg-primary-foreground/20 text-primary-foreground"
                                  : "bg-muted text-muted-foreground"
                              }`}
                            >
                              {opt.badge}
                            </span>
                          )}
                          <span className="break-all">{opt.label}</span>
                        </div>
                        {opt.sublabel && (
                          <p
                            className={`mt-0.5 truncate text-[11px] ${
                              isSelected ? "text-primary-foreground/80" : "text-muted-foreground"
                            }`}
                          >
                            {opt.sublabel}
                          </p>
                        )}
                      </div>
                      {isSelected && <Check className="size-3.5 shrink-0" />}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
