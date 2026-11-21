/** Presentation only: retain separators, diacritics and intentional camel case. */
export function formatStatusLabel(value: string) {
  let first = true;
  return value.replace(/\p{L}[\p{L}\p{M}]*/gu, (word) => {
    const conventionalCase =
      word === word.toUpperCase() ||
      word === word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    const normalized = conventionalCase ? word.toLowerCase() : word;
    const display = first ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : normalized;
    first = false;
    return display;
  });
}

export function translatedStatusLabel(value: string, translate: (value: string) => string) {
  const spaced = value.replace(/_/g, " ");
  const normalizedUpper = spaced.replace(/\s+/g, "").toUpperCase();
  const timedOutAlias = normalizedUpper === "TIMEDOUT" ? ["Timed out"] : [];
  for (const candidate of [
    ...timedOutAlias,
    value,
    spaced,
    formatStatusLabel(value),
    formatStatusLabel(spaced),
    value.toLowerCase(),
    spaced.toLowerCase(),
  ]) {
    const translated = translate(candidate);
    if (translated !== candidate) return formatStatusLabel(translated);
  }
  return timedOutAlias.length ? "Timed out" : formatStatusLabel(spaced);
}
