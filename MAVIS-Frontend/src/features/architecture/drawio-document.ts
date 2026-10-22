import { inspectGeometry, type Rect, type Route } from "@/lib/drawio/geometry";
import { nodeStyle, palette, RULE_VERSION, type DrawioTheme } from "@/lib/drawio/rules";
export function themeDrawioXml(xml: string, theme: DrawioTheme) {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  if (doc.querySelector("parsererror")) throw new Error("Invalid XML");
  const p = palette(theme);
  const model = doc.querySelector("[mavisRuleVersion]");
  if (!model) throw new Error("This legacy draft must be regenerated before applying MAVIS styles");
  if (model.getAttribute("mavisRuleVersion") !== RULE_VERSION)
    throw new Error("Regenerate this legacy draft before applying MAVIS styles");
  model.setAttribute("mavisTheme", theme);
  model.setAttribute("background", p.background);
  doc.querySelector("mxGraphModel")?.setAttribute("background", p.background);
  for (const entry of doc.querySelectorAll("[mavisRole], [id=mavis_title], [id=mavis_scope]")) {
    const cell = entry.localName === "mxCell" ? entry : entry.querySelector("mxCell");
    if (!cell) continue;
    const role = entry.getAttribute("mavisRole");
    let style = cell.getAttribute("style") ?? "";
    const set = (name: string, value: string) => {
      const regex = new RegExp(`(^|;)${name}=[^;]*`);
      style = regex.test(style)
        ? style.replace(regex, `$1${name}=${value}`)
        : `${style}${name}=${value};`;
    };
    if (role && !["boundary", "edge", "edge-label", "legend"].includes(role)) {
      const locks = style
        .split(";")
        .filter((part) =>
          /^(movable|resizable|rotatable|editable|connectable|deletable|locked)=/.test(part),
        )
        .join(";");
      cell.setAttribute("style", nodeStyle(role, theme).replace("html=0", "html=1") + locks + ";");
      continue;
    }
    set("fontColor", p.text);
    if (role === "edge") set("strokeColor", p.line);
    else if (role === "boundary") {
      set("fillColor", p.background);
      set("swimlaneFillColor", p.background);
      set("strokeColor", p.border);
    } else if (role === "edge-label" || role === "legend") set("fillColor", p.background);
    cell.setAttribute("style", style);
  }
  return new XMLSerializer().serializeToString(doc);
}
export function drawioSummary(xml: string) {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const graph = doc.querySelector("[mavisRuleVersion]");
  const version = graph?.getAttribute("mavisRuleVersion") ?? "legacy";
  if (version !== RULE_VERSION) return { version, quality: null };
  try {
    const entries = [...doc.querySelectorAll("mxCell")].map((cell) => {
      const owner = cell.parentElement?.localName === "root" ? cell : cell.parentElement!;
      return {
        cell,
        owner,
        id: owner.getAttribute("id") ?? cell.getAttribute("id") ?? "",
        role: owner.getAttribute("mavisRole") ?? cell.getAttribute("mavisRole") ?? "",
      };
    });
    const map = new Map(entries.map((entry) => [entry.id, entry]));
    const positions = new Map<string, Rect>();
    function rect(id: string, seen = new Set<string>()): Rect {
      if (positions.has(id)) return positions.get(id)!;
      if (seen.has(id)) throw new Error("Invalid parent cycle");
      seen.add(id);
      const entry = map.get(id),
        geometry = entry?.cell.querySelector(":scope > mxGeometry");
      const parent = entry?.cell.getAttribute("parent"),
        base = parent && map.has(parent) ? rect(parent, seen) : { x: 0, y: 0 };
      const result = {
        id,
        x: base.x + Number(geometry?.getAttribute("x") ?? 0),
        y: base.y + Number(geometry?.getAttribute("y") ?? 0),
        width: Number(geometry?.getAttribute("width") ?? 0),
        height: Number(geometry?.getAttribute("height") ?? 0),
      };
      positions.set(id, result);
      return result;
    }
    const nodes: Rect[] = [],
      labels: Rect[] = [],
      routes: Route[] = [];
    for (const entry of entries) {
      const { cell, role, id } = entry;
      if (cell.getAttribute("vertex") === "1") {
        if (role === "edge-label") labels.push(rect(id));
        else if (role !== "boundary" && role !== "legend" && !id.startsWith("mavis_"))
          nodes.push(rect(id));
      }
      if (cell.getAttribute("edge") === "1") {
        const from = cell.getAttribute("source"),
          to = cell.getAttribute("target");
        if (!from || !to) return { version, quality: null };
        const a = rect(from),
          b = rect(to),
          style = cell.getAttribute("style") ?? "";
        const option = (key: string, fallback: number) => {
          const match = style.match(new RegExp(`(?:^|;)${key}=([^;]+)`));
          return match ? Number(match[1]) : fallback;
        };
        const waypoints = [
          ...cell.querySelectorAll('mxGeometry > Array[as="points"] > mxPoint'),
        ].map((point) => ({
          x: Number(point.getAttribute("x")),
          y: Number(point.getAttribute("y")),
        }));
        routes.push({
          id,
          from,
          to,
          points: [
            { x: a.x + a.width * option("exitX", 1), y: a.y + a.height * option("exitY", 0.5) },
            ...waypoints,
            { x: b.x + b.width * option("entryX", 0), y: b.y + b.height * option("entryY", 0.5) },
          ],
        });
      }
    }
    if (nodes.length > 100 || routes.length > 200) return { version, quality: null };
    return { version, quality: inspectGeometry(nodes, labels, routes) };
  } catch {
    return { version, quality: null };
  }
}

export function extractDraftDocument(
  xml: string,
  modelId: string,
  diagramId: string,
  notation: string,
  level: string,
  scope: string,
) {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  if (doc.querySelector("parsererror")) throw new Error("Draft XML is invalid");
  const entries = [...doc.querySelectorAll("mxCell")].map((cell) => {
    const owner = cell.parentElement?.localName === "root" ? cell : cell.parentElement!;
    return {
      cell,
      owner,
      id: owner.getAttribute("id") ?? cell.getAttribute("id") ?? "",
      role: owner.getAttribute("mavisRole") ?? "",
    };
  });
  const ids = new Map<string, string>();
  const text = (value: string) =>
    new DOMParser().parseFromString(value, "text/html").body.textContent ?? value;
  const name = (value: string) => {
    const html = new DOMParser().parseFromString(value, "text/html");
    const first = html.body.firstElementChild?.firstElementChild;
    return first?.textContent?.trim() || text(value).split("\n")[0] || "Untitled";
  };
  const shapes = entries.filter(
    (entry) =>
      entry.cell.getAttribute("vertex") === "1" &&
      !["edge-label", "legend"].includes(entry.role) &&
      !entry.id.startsWith("mavis_"),
  );
  for (const shape of shapes) ids.set(shape.id, shape.owner.getAttribute("mavisId") ?? shape.id);
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  function position(id: string, seen = new Set<string>()): Rect {
    if (seen.has(id)) throw new Error("Invalid parent cycle");
    seen.add(id);
    const entry = byId.get(id),
      geo = entry?.cell.querySelector(":scope > mxGeometry"),
      parent = entry?.cell.getAttribute("parent");
    const base = parent && byId.has(parent) ? position(parent, seen) : { x: 0, y: 0 };
    return {
      id,
      x: base.x + Number(geo?.getAttribute("x") ?? 0),
      y: base.y + Number(geo?.getAttribute("y") ?? 0),
      width: Number(geo?.getAttribute("width") ?? 0),
      height: Number(geo?.getAttribute("height") ?? 0),
    };
  }
  function locked(id: string, seen = new Set<string>()): boolean {
    if (seen.has(id)) throw new Error("Invalid parent cycle");
    seen.add(id);
    const entry = byId.get(id);
    if (!entry) return false;
    if (/(?:^|;)(?:movable=0|locked=1)(?:;|$)/.test(entry.cell.getAttribute("style") ?? ""))
      return true;
    const parent = entry.cell.getAttribute("parent");
    return parent ? locked(parent, seen) : false;
  }
  function pinned(id: string) {
    if (!locked(id)) return undefined;
    const rect = position(id);
    return { ...rect, x: rect.x - 48, y: rect.y - 112 };
  }
  function savedName(entry: (typeof shapes)[number]) {
    const current = name(
      entry.owner.getAttribute("label") ?? entry.cell.getAttribute("value") ?? "",
    );
    const original = entry.owner.getAttribute("mavisName");
    return original && current.replace(/\s+/g, "") === original.replace(/\s+/g, "")
      ? original
      : current;
  }
  const nodes = shapes.map((entry) => ({
    pinned: pinned(entry.id),
    id: ids.get(entry.id)!,
    name:
      entry.role === "boundary"
        ? (entry.owner.getAttribute("mavisName") ??
          name(entry.owner.getAttribute("label") ?? entry.cell.getAttribute("value") ?? "").replace(
            / · component scope$/,
            "",
          ))
        : savedName(entry),
    kind: entry.role === "boundary" ? "SERVICE_CONTAINER" : entry.role || "UNKNOWN",
    parentId: ids.get(entry.cell.getAttribute("parent") ?? ""),
    languageStack: entry.owner.getAttribute("mavisTechnology") ?? "",
    description: entry.owner.getAttribute("mavisDescription") ?? "",
  }));
  const edges = entries
    .filter((entry) => entry.cell.getAttribute("edge") === "1")
    .map((entry) => {
      const from = ids.get(entry.cell.getAttribute("source") ?? ""),
        to = ids.get(entry.cell.getAttribute("target") ?? "");
      if (!from || !to)
        throw new Error("Every connector must attach to two shapes before relayout");
      return {
        id: entry.owner.getAttribute("mavisId") ?? entry.id,
        from,
        to,
        relationType:
          entry.owner.getAttribute("mavisRelationType") ||
          text(entry.owner.getAttribute("label") ?? entry.cell.getAttribute("value") ?? "") ||
          "Manual relationship",
        originLayer: entry.owner.getAttribute("mavisOriginLayer") ?? "MANUAL",
      };
    });
  if (!nodes.length) throw new Error("There are no shapes to lay out");
  return {
    omittedNodes: Number(
      doc.querySelector("[mavisOmittedNodes]")?.getAttribute("mavisOmittedNodes") ?? 0,
    ),
    omittedEdges: Number(
      doc.querySelector("[mavisOmittedEdges]")?.getAttribute("mavisOmittedEdges") ?? 0,
    ),
    modelVersionId: modelId,
    diagramId,
    notation,
    level,
    scopeContainerId: scope.split(":")[0] === "overview" ? undefined : scope.split(":")[0],
    layoutJson: { nodes, edges },
  };
}
