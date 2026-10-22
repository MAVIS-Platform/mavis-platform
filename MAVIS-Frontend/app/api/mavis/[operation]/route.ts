import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { contracts, isOperation } from "@/lib/api/contracts";
import { validateResponse } from "@/lib/api/validate-response";

export const dynamic = "force-dynamic";
const routeConfiguration = z.record(
  z.object({
    path: z
      .string()
      .startsWith("/")
      .refine(
        (p) =>
          !p.startsWith("//") &&
          !p.includes("\\") &&
          !p.includes("..") &&
          !p.includes("?") &&
          !p.includes("#"),
      ),
    method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  }),
);

async function handle(request: NextRequest, context: { params: Promise<{ operation: string }> }) {
  const { operation } = await context.params;
  const fail = (status: number) =>
    NextResponse.json(
      { error: "Request unavailable" },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  if (
    process.env["MAVIS_API_MODE"] !== "backend" ||
    !isOperation(operation) ||
    operation === "mockLogin"
  )
    return fail(501);
  const contract = contracts[operation];
  if (request.method !== (contract.mutation ? "POST" : "GET")) return fail(405);
  // Cookie-authenticated writes require an exact same-origin request. Backend
  // authorization and CSRF protection remain mandatory on the real service.
  if (contract.mutation && request.headers.get("origin") !== request.nextUrl.origin)
    return fail(403);
  let input: unknown;
  try {
    if (operation === "importSource") {
      const form = await request.formData();
      const metadata: unknown = JSON.parse(String(form.get("input")));
      if (!metadata || typeof metadata !== "object") return fail(400);
      input = { ...metadata, archive: form.get("file") };
    } else
      input = contract.mutation
        ? await request.json()
        : JSON.parse(request.nextUrl.searchParams.get("input") ?? "{}");
  } catch {
    return fail(400);
  }
  const parsed = contract.input.safeParse(input);
  if (!parsed.success) return fail(422);
  let multipart: FormData | undefined;
  if (operation === "importSource") {
    const upload = contracts.importSource.input.parse(input);
    if (upload.archive.size !== upload.size) return fail(422);
    multipart = new FormData();
    multipart.set("file", upload.archive, upload.fileName);
    multipart.set("projectId", upload.projectId);
    multipart.set("name", upload.name);
  }
  let routes: z.infer<typeof routeConfiguration>;
  try {
    routes = routeConfiguration.parse(JSON.parse(process.env["MAVIS_API_OPERATIONS"] ?? "{}"));
  } catch {
    return fail(501);
  }
  const route = routes[operation];
  const base = process.env["MAVIS_BACKEND_URL"];
  if (
    !base ||
    !route ||
    (!contract.mutation && route.method !== "GET") ||
    (contract.mutation && route.method === "GET")
  )
    return fail(501);
  let target: URL;
  try {
    const upstream = new URL(base);
    if (!["http:", "https:"].includes(upstream.protocol) || upstream.username || upstream.password)
      return fail(501);
    target = new URL(route.path, upstream);
    if (target.origin !== upstream.origin) return fail(501);
  } catch {
    return fail(501);
  }
  if (route.method === "GET")
    for (const [key, value] of Object.entries(parsed.data)) {
      if (value !== null && value !== undefined) target.searchParams.set(key, String(value));
    }
  const cookieNames = (process.env["MAVIS_SESSION_COOKIES"] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const cookie = request.cookies
    .getAll()
    .filter((c) => cookieNames.includes(c.name))
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 18000);
  const cancel = () => controller.abort();
  request.signal.addEventListener("abort", cancel, { once: true });
  try {
    const upstream = await fetch(target, {
      method: route.method,
      headers: {
        Accept: "application/json",
        ...(route.method === "GET" || multipart ? {} : { "Content-Type": "application/json" }),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      ...(route.method === "GET" ? {} : { body: multipart ?? JSON.stringify(parsed.data) }),
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
    });
    if (!upstream.ok)
      return fail(
        [400, 401, 403, 404, 409, 422, 429].includes(upstream.status) ? upstream.status : 502,
      );
    let body: unknown;
    try {
      body = await upstream.json();
    } catch {
      return fail(502);
    }
    let validated: unknown;
    try {
      validated = validateResponse(operation, parsed.data, body);
    } catch {
      return fail(502);
    }
    const response = NextResponse.json(validated, {
      headers: { "Cache-Control": "no-store" },
    });
    for (const value of upstream.headers.getSetCookie()) {
      const name = value.split("=")[0];
      if (name && cookieNames.includes(name)) response.headers.append("Set-Cookie", value);
    }
    return response;
  } catch {
    return fail(controller.signal.aborted ? 504 : 502);
  } finally {
    clearTimeout(timer);
    request.signal.removeEventListener("abort", cancel);
  }
}
export const GET = handle;
export const POST = handle;
