// Lexical helpers for legacy source previews. They preserve offsets and avoid
// interpreting strings/comments/annotation arguments as member syntax.
export function sourceMask(source: string, maskStrings: boolean): string {
  const out = source.split("");
  const blank = (from: number, to: number) => {
    for (let i = from; i < to; i++) if (source[i] !== "\n" && source[i] !== "\r") out[i] = " ";
  };
  for (let i = 0; i < source.length;) {
    const start = i;
    if (source.startsWith("//", i)) {
      i = source.indexOf("\n", i);
      if (i < 0) i = source.length;
      blank(start, i);
    } else if (source.startsWith("/*", i)) {
      const end = source.indexOf("*/", i + 2);
      i = end < 0 ? source.length : end + 2;
      blank(start, i);
    } else if (source[i] === '"' || source[i] === "'") {
      const quote = source[i]!,
        triple = source.startsWith('"""', i);
      const delimiter = triple ? '"""' : quote;
      const verbatim = source[i - 1] === "@" && quote === '"';
      i += delimiter.length;
      while (i < source.length) {
        if (source[i] === "\\" && !verbatim) {
          i += 2;
          continue;
        }
        if (verbatim && source.startsWith('""', i)) {
          i += 2;
          continue;
        }
        if (source.startsWith(delimiter, i)) {
          i += delimiter.length;
          break;
        }
        i++;
      }
      if (maskStrings) blank(start, i);
    } else i++;
  }
  return out.join("");
}

export function topLevelAssignment(header: string): number {
  const mask = sourceMask(header, true);
  let parens = 0,
    brackets = 0,
    angles = 0;
  for (let i = 0; i < mask.length; i++) {
    const ch = mask[i];
    if (ch === "(") parens++;
    else if (ch === ")") parens--;
    else if (ch === "[") brackets++;
    else if (ch === "]") brackets--;
    else if (ch === "<") angles++;
    else if (ch === ">") angles = Math.max(0, angles - 1);
    else if (ch === "=" && parens === 0 && brackets === 0 && angles === 0 && mask[i + 1] !== "=")
      return i;
  }
  return -1;
}

export function stripSourceAnnotations(source: string): string {
  const mask = sourceMask(source, true),
    out = source.split("");
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] !== "@" || !/[\w$]/.test(mask[i + 1] ?? "")) continue;
    const start = i++;
    while (/[\w.$]/.test(mask[i] ?? "")) i++;
    while (/\s/.test(mask[i] ?? "") && i < mask.length) i++;
    if (mask[i] === "(") {
      let depth = 1;
      i++;
      while (i < mask.length && depth > 0) {
        if (mask[i] === "(") depth++;
        else if (mask[i] === ")") depth--;
        i++;
      }
    }
    for (let j = start; j < i; j++) out[j] = " ";
    i--;
  }
  let result = out.join("").trim();
  // C# attributes occur before a declaration/parameter; array suffixes do not.
  while (result.startsWith("[")) {
    const masked = sourceMask(result, true);
    let depth = 0,
      end = -1;
    for (let i = 0; i < masked.length; i++) {
      if (masked[i] === "[") depth++;
      else if (masked[i] === "]" && --depth === 0) {
        end = i;
        break;
      }
    }
    if (end < 0) break;
    result = result.slice(end + 1).trim();
  }
  return result.replace(/\s+/g, " ").trim();
}

export function scanSourceMembers(
  source: string,
  bodyStart: number,
): Array<{ header: string; hasBody: boolean }> {
  const mask = sourceMask(source, true),
    result: Array<{ header: string; hasBody: boolean }> = [];
  let depth = 1,
    parens = 0,
    start = bodyStart + 1,
    fieldBody = false;
  for (let i = start; i < mask.length && depth > 0; i++) {
    const ch = mask[i];
    if (depth === 1 && ch === "(") parens++;
    else if (depth === 1 && ch === ")") parens--;
    else if (ch === "{" && (depth > 1 || parens === 0)) {
      if (depth === 1) {
        const header = source.slice(start, i).trim();
        fieldBody = topLevelAssignment(header) >= 0;
        if (!fieldBody) result.push({ header, hasBody: true });
      }
      depth++;
    } else if (ch === "}" && (depth > 1 || parens === 0)) {
      depth--;
      if (depth === 1 && !fieldBody) {
        start = i + 1;
        parens = 0;
      }
    } else if (ch === ";" && depth === 1 && parens === 0) {
      const header = source.slice(start, i).trim();
      if (header) result.push({ header, hasBody: false });
      start = i + 1;
      fieldBody = false;
    }
  }
  return result;
}
