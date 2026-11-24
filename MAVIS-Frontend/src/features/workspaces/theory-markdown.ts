export function smartFormatTheoryMarkdown(raw: string): string {
  const normalized = raw.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return "";
  const output: string[] = [];
  let paragraph: string[] = [];
  let inCode = false;
  const flush = () => {
    if (paragraph.length) output.push(paragraph.join(" "));
    paragraph = [];
  };

  for (const rawLine of normalized.split("\n")) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) {
      flush();
      inCode = !inCode;
      output.push(line);
    } else if (inCode) {
      output.push(line);
    } else if (!trimmed) {
      flush();
      if (output.length && output.at(-1) !== "") output.push("");
    } else if (/^#{1,6}\s+|^>\s+|^\|.*\|$|^([-*+]|\d+[.)])\s+/.test(trimmed)) {
      flush();
      output.push(trimmed);
    } else if (/^[•▪◦●■–—]\s*/.test(trimmed)) {
      flush();
      output.push(`- ${trimmed.replace(/^[•▪◦●■–—]\s*/, "")}`);
    } else if (/^(chapter|chương|phần|section|bài)\s+\d+([.:]\s*|\s+).+/i.test(trimmed)) {
      flush();
      if (output.length && output.at(-1) !== "") output.push("");
      output.push(`## ${trimmed}`, "");
    } else {
      paragraph.push(trimmed);
    }
  }
  flush();
  return output.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
