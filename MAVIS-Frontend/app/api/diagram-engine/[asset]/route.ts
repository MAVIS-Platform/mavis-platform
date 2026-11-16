import { readFile } from "node:fs/promises";
import path from "node:path";
export const runtime = "nodejs";
const assets = new Set(["plantuml.js", "viz-global.js", "themes.js", "elk-worker.min.js"]);
export async function GET(_request: Request, context: { params: Promise<{ asset: string }> }) {
  const { asset } = await context.params;
  if (!assets.has(asset)) return new Response("Not found", { status: 404 });
  const content = await readFile(
    asset === "elk-worker.min.js"
      ? path.join(process.cwd(), "node_modules", "elkjs", "lib", asset)
      : path.join(process.cwd(), "node_modules", "@plantuml", "core", asset),
  );
  return new Response(content, {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
