import type { Locale } from "@/lib/i18n/locale-context";

export type DateInput = Date | string | number | null | undefined;

export function resolveDateLocale(locale: Locale | string | null | undefined): string {
  return locale === "vi" ? "vi-VN" : "en-US";
}

function parseValidDate(input: DateInput): Date | null {
  if (input == null || input === "") return null;
  const date = input instanceof Date ? input : new Date(input);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatLocalizedDate(
  input: DateInput,
  locale: Locale | string | null | undefined,
  fallback = "—",
): string {
  const date = parseValidDate(input);
  if (!date) return fallback;
  return date.toLocaleDateString(resolveDateLocale(locale));
}

export function formatLocalizedTime(
  input: DateInput,
  locale: Locale | string | null | undefined,
  options?: { seconds?: boolean; fallback?: string },
): string {
  const fallback = options?.fallback ?? "—";
  const date = parseValidDate(input);
  if (!date) return fallback;
  const includeSeconds = options?.seconds ?? true;
  return date.toLocaleTimeString(resolveDateLocale(locale), {
    hour: "2-digit",
    minute: "2-digit",
    ...(includeSeconds ? { second: "2-digit" } : {}),
    hour12: locale === "vi" ? false : undefined,
  });
}

export function formatLocalizedDateTime(
  input: DateInput,
  locale: Locale | string | null | undefined,
  options?: { seconds?: boolean; fallback?: string },
): string {
  const fallback = options?.fallback ?? "—";
  const date = parseValidDate(input);
  if (!date) return fallback;
  const includeSeconds = options?.seconds ?? true;
  return date.toLocaleString(resolveDateLocale(locale), {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    ...(includeSeconds ? { second: "2-digit" } : {}),
    hour12: locale === "vi" ? false : undefined,
  });
}
