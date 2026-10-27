export const DRAWIO_URL = process.env["NEXT_PUBLIC_DRAWIO_URL"] ?? "http://127.0.0.1:8090";
export const DRAWIO_ORIGIN = new URL(DRAWIO_URL).origin;
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
export function readDrawioEvent(
  message: Pick<MessageEvent, "origin" | "source" | "data">,
  frame: unknown,
): { event: string; xml?: string; error?: unknown } | null {
  if (
    !frame ||
    message.origin !== DRAWIO_ORIGIN ||
    message.source !== frame ||
    typeof message.data !== "string" ||
    message.data.length > DRAWIO_MAX_XML_LENGTH + 100_000
  )
    return null;
  try {
    const data: unknown = JSON.parse(message.data);
    if (
      !data ||
      typeof data !== "object" ||
      !("event" in data) ||
      typeof data.event !== "string" ||
      !["init", "load", "layout", "fit", "save", "autosave", "export"].includes(data.event)
    )
      return null;
    if ("xml" in data && (typeof data.xml !== "string" || data.xml.length > DRAWIO_MAX_XML_LENGTH))
      return null;
    return data as { event: string; xml?: string; error?: unknown };
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
    !values.every((number) => typeof number === "number" && Number.isFinite(number) && number > 0)
  )
    return null;
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
