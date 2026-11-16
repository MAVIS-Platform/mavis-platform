export function assessReadability(input: {
  width: number;
  height: number;
  minimumFontPx: number;
  viewportWidth: number;
  viewportHeight: number;
}) {
  const values = Object.values(input);
  if (values.some((value) => !Number.isFinite(value) || value <= 0))
    throw Error("Invalid readability dimensions");
  const fit = Math.min(1, input.viewportWidth / input.width, input.viewportHeight / input.height);
  const paperFit = Math.min((396 * 96) / 25.4 / input.width, (270 * 96) / 25.4 / input.height);
  const screenFont = input.minimumFontPx * fit,
    printFont = (input.minimumFontPx * paperFit * 72) / 96;
  return {
    fitScale: fit,
    minimumScreenFontPx: screenFont,
    minimumA3FontPt: printFont,
    screenReadable: screenFont >= 12,
    printReadable: printFont >= 10,
  };
}

export function minimumSvgFont(root: Element) {
  const fonts: number[] = [];
  for (const element of root.querySelectorAll("text, tspan, foreignObject *")) {
    if (
      !Array.from(element.childNodes).some(
        (node) => node.nodeType === 3 && node.textContent?.trim(),
      )
    )
      continue;
    // draw.io includes an inactive 10px fallback for viewers without foreignObject support.
    if (
      element.closest("switch")?.querySelector("foreignObject") &&
      !element.closest("foreignObject")
    )
      continue;
    let current: Element | null = element,
      value: number | undefined;
    while (current) {
      const raw =
        current.getAttribute("font-size") ??
        current.getAttribute("style")?.match(/font-size:\s*([0-9.]+)/)?.[1];
      if (raw !== undefined && raw !== null) {
        value = parseFloat(raw);
        break;
      }
      current = current.parentElement;
    }
    if (value === undefined) value = 12;
    if (Number.isFinite(value) && value > 0) fonts.push(value);
  }
  return fonts.length ? Math.min(...fonts) : 12;
}
