/** Accept only internal paths, retaining role-based defaults for invalid destinations. */
export function safeLoginRedirect(next: string | null): string | null {
  if (!next?.startsWith("/") || next.startsWith("//") || /[\\\x00-\x20\x7f]/.test(next))
    return null;
  try {
    const url = new URL(next, "https://mavis.invalid");
    const path = decodeURIComponent(url.pathname);
    if (
      url.origin !== "https://mavis.invalid" ||
      path.startsWith("//") ||
      /[\\\x00-\x20\x7f]/.test(path)
    )
      return null;
    if (path === "/" || /^\/login\/?$/i.test(path)) return null;
    return url.pathname + url.search + url.hash;
  } catch {
    return null;
  }
}
