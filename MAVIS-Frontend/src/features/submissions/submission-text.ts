/** Strips legacy synthetic preview/checklist tokens from legacy seeded submission text. */
export function stripLegacySubmissionNoise(text: string): string {
  return text
    .replace(
      /\[[^\]\n]*(?:CB=|DBPerService=|Idempotency=|RubricPreview=|MITIGATION)[^\]\n]*\]/gi,
      "",
    )
    .replace(/\s*ScorePreview\s*=\s*[\d.]+\/10(?:\s*\([A-Z_]+\))?/gi, "")
    .replace(/\(\s*\)/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
