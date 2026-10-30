/** Accept only internal paths, retaining role-based defaults for invalid destinations. */
function hasUnsafeCharacters(value: string) {
  return Array.from(value).some(
    (character) =>
      character === "\\" || character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127,
  );
}
export function safeLoginRedirect(next: string | null): string | null {
  if (!next?.startsWith("/") || next.startsWith("//") || hasUnsafeCharacters(next)) return null;
  try {
    const url = new URL(next, "https://mavis.invalid");
    const path = decodeURIComponent(url.pathname);
    if (
      url.origin !== "https://mavis.invalid" ||
      path.startsWith("//") ||
      hasUnsafeCharacters(path)
    )
      return null;
    if (path === "/" || /^\/(login|auth|api|_next)(\/|$)/i.test(path)) return null;
    return url.pathname + url.search + url.hash;
  } catch {
    return null;
  }
}
