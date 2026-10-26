import {
  contracts,
  type ApiAdapter,
  type Operation,
  type Request,
  type Response,
} from "./contracts";
import { ApiError, fromStatus, normalizeError, publicErrorCode } from "@/lib/errors/api-error";
import { validateResponse } from "./validate-response";

export class BackendAdapter implements ApiAdapter {
  readonly mode = "backend" as const;
  async execute<K extends Operation>(
    operation: K,
    input: Request<K>,
    signal?: AbortSignal,
  ): Promise<Response<K>> {
    if (!contracts[operation].input.safeParse(input).success) throw new ApiError("validation", 422);
    const controller = new AbortController();
    const cancel = () => controller.abort();
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) controller.abort();
    let timedOut = false;
    const timer = setTimeout(
      () => {
        timedOut = true;
        controller.abort();
      },
      ["importSource", "importGithub", "renderArchitectureView"].includes(operation)
        ? 120000
        : ["explain", "elementEvidenceContext", "model"].includes(operation)
          ? 60000
          : 20000,
    );
    try {
      const mutation = contracts[operation].mutation;
      let multipart: FormData | undefined;
      if (operation === "importSource") {
        const upload = contracts.importSource.input.parse(input);
        multipart = new FormData();
        multipart.set("file", upload.archive, upload.fileName);
        multipart.set(
          "input",
          JSON.stringify({
            projectId: upload.projectId,
            name: upload.name,
            fileName: upload.fileName,
            size: upload.size,
          }),
        );
      }
      const url = `/api/mavis/${operation}${mutation ? "" : `?input=${encodeURIComponent(JSON.stringify(input))}`}`;
      const response = await fetch(url, {
        method: mutation ? "POST" : "GET",
        credentials: "same-origin",
        cache: "no-store",
        signal: controller.signal,
        ...(multipart
          ? { body: multipart }
          : mutation
            ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }
            : {}),
      });
      if (operation === "session" && response.status === 401) return { user: null } as Response<K>;
      if (!response.ok) {
        {
          try {
            const error: unknown = await response.json();
            const code = publicErrorCode(
              error && typeof error === "object" && "code" in error ? error.code : undefined,
            );
            if (code) throw new ApiError(fromStatus(response.status).kind, response.status, code);
          } catch (error) {
            if (error instanceof ApiError) throw error;
          }
        }
        throw fromStatus(response.status);
      }
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        throw new ApiError("contract");
      }
      return validateResponse(operation, input, body);
    } catch (error) {
      throw timedOut ? new ApiError("timeout") : normalizeError(error);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
    }
  }
}
