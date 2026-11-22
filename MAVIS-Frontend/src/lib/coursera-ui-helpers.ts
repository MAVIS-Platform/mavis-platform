export type CourseLabProgressItem = {
  assignmentId: string;
  title?: string;
  position?: number;
  state?: "PASSED" | "UNLOCKED" | "LOCKED" | string;
  status?: string | null;
  quizPassed?: boolean;
  studioCompleted?: boolean;
  reason?: string | null;
  score?: number | null;
};

export type CourseProgressSummary<T extends CourseLabProgressItem = CourseLabProgressItem> = {
  totalLabs: number;
  completedLabs: number;
  inProgressLabs: number;
  lockedLabs: number;
  completionPercent: number;
  nextActiveLab: T | null;
};

export function isCourseLabCompleted(item: CourseLabProgressItem): boolean {
  if (item.state === "PASSED") return true;
  if (item.status === "GRADED" || item.status === "SUBMITTED") return true;
  return Boolean(item.quizPassed && item.studioCompleted);
}

export function computeCourseProgressSummary<T extends CourseLabProgressItem>(
  items: ReadonlyArray<T>,
): CourseProgressSummary<T> {
  const totalLabs = items.length;
  let completedLabs = 0;
  let inProgressLabs = 0;
  let lockedLabs = 0;
  let nextActiveLab: T | null = null;

  for (const item of items) {
    if (isCourseLabCompleted(item)) {
      completedLabs += 1;
    } else if (item.state === "LOCKED") {
      lockedLabs += 1;
    } else {
      inProgressLabs += 1;
      if (!nextActiveLab) nextActiveLab = item;
    }
  }

  const completionPercent = totalLabs > 0 ? Math.round((completedLabs / totalLabs) * 100) : 0;
  return {
    totalLabs,
    completedLabs,
    inProgressLabs,
    lockedLabs,
    completionPercent,
    nextActiveLab,
  };
}

export type LabStepStatusBadge = {
  labelVi: string;
  labelEn: string;
  className: string;
};

export function getLabStepStatusBadge(
  stepDone: boolean,
  isCurrent: boolean,
  isLocked: boolean,
): LabStepStatusBadge {
  if (stepDone) {
    return {
      labelVi: "Đã hoàn thành",
      labelEn: "Completed",
      className: "border border-emerald-200 bg-emerald-50 text-emerald-700",
    };
  }
  if (isLocked) {
    return {
      labelVi: "Đang khóa",
      labelEn: "Locked",
      className: "border border-slate-200 bg-slate-100 text-slate-500",
    };
  }
  if (isCurrent) {
    return {
      labelVi: "Đang học",
      labelEn: "In Progress",
      className: "border border-teal-200 bg-teal-50 text-teal-700",
    };
  }
  return {
    labelVi: "Sẵn sàng",
    labelEn: "Ready",
    className: "border border-teal-200 bg-teal-50 text-teal-700",
  };
}

export function formatPasskeyCode(code?: string | null): string {
  const normalized = (code ?? "").trim().toUpperCase();
  if (!normalized) return "—";
  if (normalized.length === 8) return `${normalized.slice(0, 4)}-${normalized.slice(4)}`;
  return normalized;
}

// shortcut: persisted per user/workspace in localStorage since backend has no standalone reading-progress endpoint; upgrade to API if cross-device sync is required.
export function theoryCompletionStorageKey(
  userId: string | null | undefined,
  workspaceId: string,
): string {
  const userScope = (userId ?? "anonymous").trim() || "anonymous";
  return `mavis:theory-completed:${userScope}:${workspaceId}`;
}

export function readCompletedTheoryIds(storageKey: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string" && id.length > 0)
      : [];
  } catch {
    return [];
  }
}

export function toggleCompletedTheoryId(
  storageKey: string,
  currentIds: ReadonlyArray<string>,
  itemId: string,
): string[] {
  const next = currentIds.includes(itemId)
    ? currentIds.filter((id) => id !== itemId)
    : [...currentIds, itemId];
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // Ignore denied storage or quota failures cleanly.
    }
  }
  return next;
}
