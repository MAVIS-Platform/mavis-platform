import { z } from "zod";
const configuration = z.object({
  MAVIS_API_MODE: z.enum(["mock", "backend"]).default("backend"),
  MAVIS_MOCK_SCENARIO: z
    .enum([
      "normal",
      "empty",
      "error",
      "analysis-failed",
      "incomplete-evidence",
      "runtime-failed",
      "unsupported",
      "invalid-source",
    ])
    .default("normal"),
});
// Import only from server entrypoints. Upstream URLs and cookie configuration
// never become provider props or NEXT_PUBLIC environment variables.
export function readAppConfiguration(environment: Record<string, string | undefined>) {
  const parsed = configuration.safeParse(environment);
  if (!parsed.success)
    throw new Error(
      "Invalid MAVIS mode configuration. Use mock or backend and a documented mock scenario.",
    );
  return { mode: parsed.data.MAVIS_API_MODE, mockScenario: parsed.data.MAVIS_MOCK_SCENARIO };
}
