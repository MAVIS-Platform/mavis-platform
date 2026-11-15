// Explicit public BFF surface; never proxy admin/internal/runner routes generically.
export function allowedBackendPath(path: string): boolean {
  return /^(workspaces\/[a-f0-9-]+\/(?:course-roadmap|course-setup|(?:course-labs\/seed-curated|course-labs\/[a-f0-9-]+\/(?:publish|freeze-topology|quiz(?:\/(?:attempts|curriculum))?))|course-passkey(?:\/revoke)?)|course-curriculum|course-enrollments\/redeem|assignments\/[a-f0-9-]+\/reference-source|notifications(?:\/(?:read-all|[a-f0-9-]+\/read))?|auth\/login|auth\/me|projects(?:\/[a-f0-9-]+(?:\/(?:snapshots|jobs))?)?|analyzer\/(?:upload|import\/github|snapshots\/[a-f0-9-]+(?:\/analyze)?|jobs\/[a-f0-9-]+(?:\/cancel)?|projects\/[a-f0-9-]+\/(?:models|runtime-setup-readiness)|models\/[a-f0-9-]+(?:\/(?:graph|impact|diagrams|elements(?:\/[a-f0-9-]+)?|evaluate|evaluations|revisions))?|evaluations\/[a-f0-9-]+(?:\/findings)?|evidences\/(?:element|relationship)\/[a-f0-9-]+|ai\/explain|diagrams\/[a-f0-9-]+\/export))$/.test(
    path,
  );
}
