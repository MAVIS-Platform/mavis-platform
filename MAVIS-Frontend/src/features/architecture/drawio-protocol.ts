export const DRAWIO_URL =
  process.env["NEXT_PUBLIC_DRAWIO_URL"] ?? "http://127.0.0.1:8090";
export const DRAWIO_ORIGIN = new URL(DRAWIO_URL).origin;

export const FALLBACK_DRAWIO_URL = "https://embed.diagrams.net";
export const FALLBACK_DRAWIO_ORIGIN = new URL(FALLBACK_DRAWIO_URL).origin;

export const ALLOWED_DRAWIO_ORIGINS = new Set<string>([
  DRAWIO_ORIGIN,
  "http://127.0.0.1:8090",
  "http://localhost:8090",
  FALLBACK_DRAWIO_ORIGIN,
  "https://app.diagrams.net",
]);

// Arrange and route connectors locally, without changing element IDs or labels.
export const DRAWIO_LAYOUT = [
  {
    layout: "elkLayered",
    config: {
      "elk.direction": "RIGHT",
      "elk.spacing.nodeNode": "70",
      "elk.layered.spacing.nodeNodeBetweenLayers": "150",
      "elk.edgeRouting": "ORTHOGONAL",
      edgeStyle: "orthogonal",
      corners: "rounded",
    },
  },
];

export const DRAWIO_MAX_XML_LENGTH = 2_000_000;

const ALLOWED_DRAWIO_EVENTS = new Set<string>([
  "configure",
  "init",
  "load",
  "layout",
  "fit",
  "save",
  "autosave",
  "export",
]);

export function readDrawioEvent(
  message: Pick<MessageEvent, "origin" | "source" | "data">,
  frame: unknown,
  allowedOrigins?: Set<string> | string,
): { event: string; xml?: string; data?: string; error?: unknown } | null {
  const isOriginAllowed = allowedOrigins
    ? typeof allowedOrigins === "string"
      ? message.origin === allowedOrigins
      : allowedOrigins.has(message.origin)
    : message.origin === DRAWIO_ORIGIN;

  if (
    !frame ||
    !isOriginAllowed ||
    message.source !== frame ||
    typeof message.data !== "string" ||
    message.data.length > DRAWIO_MAX_XML_LENGTH * 3
  ) {
    return null;
  }
  try {
    const data: unknown = JSON.parse(message.data);
    if (
      !data ||
      typeof data !== "object" ||
      !("event" in data) ||
      typeof data.event !== "string" ||
      !ALLOWED_DRAWIO_EVENTS.has(data.event)
    ) {
      return null;
    }
    if (
      "xml" in data &&
      data.xml !== undefined &&
      (typeof data.xml !== "string" || data.xml.length > DRAWIO_MAX_XML_LENGTH)
    ) {
      return null;
    }
    return data as { event: string; xml?: string; data?: string; error?: unknown };
  } catch {
    return null;
  }
}

export function drawioFitRequest(
  value: unknown,
): { action: "fit"; border: number; maxScale: number } | null {
  if (!value || typeof value !== "object") return null;
  const data = value as {
    modelBounds?: { width?: unknown; height?: unknown };
    containerSize?: { width?: unknown; height?: unknown };
  };
  const values = [
    data.modelBounds?.width,
    data.modelBounds?.height,
    data.containerSize?.width,
    data.containerSize?.height,
  ];
  if (
    !values.every(
      (number) => typeof number === "number" && Number.isFinite(number) && number > 0,
    )
  ) {
    return null;
  }
  const [modelWidth, modelHeight, width, height] = values as number[];
  return {
    action: "fit",
    border: 24,
    maxScale: Math.max(
      0.01,
      Math.min(1, (width! - 48) / modelWidth!, (height! - 48) / modelHeight!),
    ),
  };
}
