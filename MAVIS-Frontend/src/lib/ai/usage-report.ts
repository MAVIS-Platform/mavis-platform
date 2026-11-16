import { randomUUID } from "node:crypto";

type Provider = "openai" | "gemini";

// Only the server reports usage; prompts and API keys never enter telemetry.
export async function reportAiUsage(
  provider: Provider,
  model: string,
  inputTokens: unknown,
  outputTokens: unknown,
  userId?: string,
): Promise<void> {
  const key = process.env["MAVIS_AI_USAGE_INGEST_KEY"]?.trim();
  if (!key || key.length < 32) return;
  if (
    !Number.isSafeInteger(inputTokens) ||
    !Number.isSafeInteger(outputTokens) ||
    (inputTokens as number) < 0 ||
    (outputTokens as number) < 0
  )
    return;
  const base =
    process.env["MAVIS_JAVA_URL"] ?? process.env["MAVIS_BACKEND_URL"] ?? "http://127.0.0.1:8081";
  try {
    await fetch(`${base.replace(/\/$/, "")}/api/v1/internal/ai-usage`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-MAVIS-AI-USAGE-KEY": key },
      body: JSON.stringify({
        provider,
        model,
        requestId: randomUUID(),
        inputTokens,
        outputTokens,
        ...(userId ? { userId } : {}),
      }),
      signal: AbortSignal.timeout(1500),
    });
  } catch {
    // A telemetry outage must not break the user's AI request.
  }
}
