"use client";

import { useEffect, useRef, useState } from "react";
import { AlarmClock, Clock3 } from "lucide-react";
import { useLocale } from "@/lib/i18n/locale-context";

/** Scales Quiz time allowance sensibly with question count (min 5 min, 1.5 min per question). */
export function calculateQuizDurationMinutes(questionCount: number): number {
  const normalized = Number.isFinite(questionCount) ? Math.max(1, questionCount) : 1;
  return Math.max(5, Math.ceil(normalized * 1.5));
}

export function formatCountdown(remainingSeconds: number): string {
  const safe = Math.max(0, Math.floor(remainingSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function computeRemainingSeconds(
  startedAtIso: string | undefined,
  durationSeconds: number,
  nowMs = Date.now(),
): number {
  if (!startedAtIso || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return Math.max(0, durationSeconds);
  }
  const startedMs = Date.parse(startedAtIso);
  if (!Number.isFinite(startedMs)) return Math.max(0, durationSeconds);
  const elapsedSec = Math.floor(Math.max(0, nowMs - startedMs) / 1000);
  return Math.max(0, durationSeconds - elapsedSec);
}

export function QuizCountdownBanner({
  startedAt,
  durationSeconds,
  stopped = false,
  onExpire,
}: {
  startedAt: string | undefined;
  durationSeconds: number;
  stopped?: boolean | undefined;
  onExpire?: (() => void) | undefined;
}) {
  const { t } = useLocale();
  const [remainingSeconds, setRemainingSeconds] = useState(() =>
    computeRemainingSeconds(startedAt, durationSeconds),
  );
  const expiredFiredRef = useRef(false);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    expiredFiredRef.current = false;
    setRemainingSeconds(computeRemainingSeconds(startedAt, durationSeconds));
  }, [startedAt, durationSeconds]);

  useEffect(() => {
    if (stopped || !startedAt) return;
    const tick = () => {
      const next = computeRemainingSeconds(startedAt, durationSeconds);
      setRemainingSeconds(next);
      if (next === 0 && !expiredFiredRef.current) {
        expiredFiredRef.current = true;
        onExpireRef.current?.();
      }
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [startedAt, durationSeconds, stopped]);

  const isExpired = remainingSeconds <= 0;
  const isCritical = !isExpired && remainingSeconds <= 60;
  const isWarning = !isExpired && !isCritical && remainingSeconds <= Math.max(120, Math.round(durationSeconds * 0.2));

  const toneClass = isExpired || isCritical
    ? "border-destructive/60 bg-destructive/12 text-destructive"
    : isWarning
      ? "border-amber-500/70 bg-amber-50/90 text-amber-950 dark:border-amber-600 dark:bg-amber-950/35 dark:text-amber-200"
      : "border-teal-300/80 bg-teal-50/80 text-teal-950 dark:border-teal-800 dark:bg-teal-950/30 dark:text-teal-200";

  return (
    <div
      role="timer"
      aria-live="polite"
      className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 ${toneClass}`}
    >
      <div className="flex items-center gap-2.5 text-sm font-semibold">
        {isExpired || isCritical ? (
          <AlarmClock className="size-5 shrink-0" aria-hidden="true" />
        ) : (
          <Clock3 className="size-5 shrink-0" aria-hidden="true" />
        )}
        <span>
          {isExpired
            ? t(
                "Time's up — auto-submitting your quiz…",
                "Đã hết giờ — đang tự động nộp bài…",
              )
            : t("Time left:", "Còn lại:")}
        </span>
      </div>
      <span className="rounded-lg bg-background/90 px-3.5 py-1 font-mono text-2xl font-extrabold tracking-tight tabular-nums shadow-xs sm:text-3xl">
        {formatCountdown(remainingSeconds)}
      </span>
    </div>
  );
}
