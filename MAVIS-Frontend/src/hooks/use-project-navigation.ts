"use client";
import { useEffect, useState } from "react";
import type { AppRole } from "@/types/domain";

export function useProjectNavigation(
  role: AppRole,
  activeId: string,
  activeGroup: string | undefined,
  enabled: boolean,
) {
  const key = `mavis.project-sidebar.groups.${role}`;
  const [snapshot, setSnapshot] = useState<{
    key: string;
    route: string;
    groups: Record<string, boolean>;
  }>({
    key,
    route: activeId,
    groups: activeGroup ? { [activeGroup]: true } : {},
  });
  useEffect(() => {
    if (!enabled) return;
    let saved: Record<string, boolean> = {};
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? "{}");
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        saved = Object.fromEntries(
          Object.entries(parsed).filter(
            (entry): entry is [string, boolean] => typeof entry[1] === "boolean",
          ),
        );
      }
    } catch {
      /* Preferences are optional when storage is denied or corrupt. */
    }
    setSnapshot({
      key,
      route: activeId,
      groups: { ...saved, ...(activeGroup ? { [activeGroup]: true } : {}) },
    });
  }, [key, activeId, activeGroup, enabled]);
  const groups =
    snapshot.key === key && snapshot.route === activeId
      ? snapshot.groups
      : {
          ...(snapshot.key === key ? snapshot.groups : {}),
          ...(activeGroup ? { [activeGroup]: true } : {}),
        };
  return {
    groups,
    toggle(group: string, open: boolean) {
      const next = { ...groups, [group]: open };
      setSnapshot({ key, route: activeId, groups: next });
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* Session-only fallback. */
      }
    },
  };
}
