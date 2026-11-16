import { inspectGeometry, type Rect, type Route } from "@/lib/drawio/geometry";
import { nodeStyle, palette, RULE_VERSION, type DrawioTheme } from "@/lib/drawio/rules";
function getXmlAttr(tag: string, name: string): string {
  const m = new RegExp(`\\b${name}="([^"]*)"`).exec(tag);
  return m?.[1] ?? "";
}

function setXmlAttr(tag: string, name: string, value: string): string {
  const re = new RegExp(`(\\b${name}=)"[^"]*"`);
  if (re.test(tag)) return tag.replace(re, `$1"${value}"`);
  return tag.replace(/(\/?>)$/, ` ${name}="${value}"$1`);
}

export function themeDrawioXml(xml: string, theme: DrawioTheme, cleanXml?: string) {
  if (!/<mxGraphModel\b/.test(xml) || /<parsererror\b/.test(xml)) {
    throw new Error("Invalid XML");
  }
  const p = palette(theme);
  const ruleMatch = /\bmavisRuleVersion="([^"]*)"/.exec(xml);
  const hasC4Context = /\bmavisC4Context="[^"]*"/.test(xml);
  const hasUmlOrSeq =
    /\b(?:mavisUmlDocument|mavisUmlDiagramKind|mavisUmlRole|mavisInteraction|mavisScenario)="[^"]*"/.test(
      xml,
    );
  if (!ruleMatch && !hasC4Context && !hasUmlOrSeq) {
    throw new Error("This legacy draft must be regenerated before applying MAVIS styles");
  }
  if (ruleMatch && !hasC4Context && !hasUmlOrSeq && ruleMatch[1] !== RULE_VERSION) {
    throw new Error("Regenerate this legacy draft before applying MAVIS styles");
  }

  let nextXml = xml.replace(/<mxGraphModel\b[^>]*>/, (tag) => {
    let updated = setXmlAttr(tag, "mavisTheme", theme);
    updated = setXmlAttr(updated, "background", p.background);
    return updated;
  });

  if (theme === "clean" && cleanXml && /<mxGraphModel\b/.test(cleanXml)) {
    const cleanStylesById = new Map<string, string>();
    for (const m of cleanXml.matchAll(/<mxCell\b[^>]*>/g)) {
      const id = getXmlAttr(m[0], "id");
      const style = getXmlAttr(m[0], "style");
      if (id && style) cleanStylesById.set(id, style);
    }
    if (cleanStylesById.size > 0) {
      return nextXml.replace(/<mxCell\b[^>]*>/g, (tag) => {
        const id = getXmlAttr(tag, "id");
        const cleanStyle = id ? cleanStylesById.get(id) : undefined;
        return cleanStyle ? setXmlAttr(tag, "style", cleanStyle) : tag;
      });
    }
  }

  if (hasUmlOrSeq) {
    return nextXml.replace(/<mxCell\b[^>]*>/g, (tag) => {
      let style = getXmlAttr(tag, "style");
      if (!style) return tag;
      const role = getXmlAttr(tag, "mavisRole");
      const umlRole = getXmlAttr(tag, "mavisUmlRole");
      const nodeKind = getXmlAttr(tag, "mavisNodeKind") || getXmlAttr(tag, "mavisStateKind");
      const set = (name: string, value: string) => {
        const regex = new RegExp(`(^|;)${name}=[^;]*`);
        style = regex.test(style)
          ? style.replace(regex, `$1${name}=${value}`)
          : `${style}${style.endsWith(";") ? "" : ";"}${name}=${value};`;
      };
      if (role === "operand-divider") {
        set("strokeColor", p.border);
      } else if (getXmlAttr(tag, "edge") === "1") {
        set("strokeColor", p.line);
        set("fontColor", p.text);
        set("labelBackgroundColor", "none");
      } else if (getXmlAttr(tag, "vertex") === "1") {
        if (
          role === "combined-fragment" ||
          role === "sd-frame" ||
          (style.includes("shape=umlFrame") && role !== "interaction-use")
        ) {
          set("fillColor", "none");
          set("strokeColor", p.border);
          set("fontColor", p.text);
        } else if (role === "interaction-use") {
          set("fillColor", p.background);
          set("strokeColor", p.border);
          set("fontColor", p.text);
        } else if (role === "lifeline-destroy" || style.includes("shape=umlDestroy")) {
          set("fillColor", "none");
          set("strokeColor", theme === "monochrome" ? "#000000" : "#b91c1c");
        } else if (
          role === "found-message-origin" ||
          role === "lost-message-target" ||
          nodeKind === "INITIAL" ||
          nodeKind === "ACTIVITY_FINAL" ||
          nodeKind === "FINAL_STATE" ||
          nodeKind === "FORK" ||
          nodeKind === "JOIN"
        ) {
          set("fillColor", p.text);
          set("strokeColor", p.border);
          set("fontColor", p.background);
        } else if (
          nodeKind === "FLOW_FINAL" ||
          nodeKind === "SHALLOW_HISTORY" ||
          nodeKind === "DEEP_HISTORY"
        ) {
          set("fillColor", p.background);
          set("strokeColor", p.text);
          set("fontColor", p.text);
        } else if (nodeKind === "DECISION" || nodeKind === "MERGE" || nodeKind === "CHOICE") {
          set("fillColor", p.data);
          set("strokeColor", p.border);
          set("fontColor", p.nodeText);
        } else if (umlRole === "deployment-artifact" || nodeKind === "OBJECT_NODE") {
          set("fillColor", p.system);
          set("strokeColor", p.border);
          set("fontColor", p.nodeText);
        } else if (role === "execution-spec") {
          const execFill =
            theme === "monochrome"
              ? "#ffffff"
              : theme === "dark"
                ? "#1e3a8a"
                : theme === "vibrant"
                  ? "#93c5fd"
                  : theme === "blueprint"
                    ? "#bae6fd"
                    : "#dbeafe";
          set("fillColor", execFill);
          set("strokeColor", p.border);
        } else if (
          style.includes("text;") ||
          role === "operand-guard" ||
          role === "metadata-carrier" ||
          role === "interaction-use-label"
        ) {
          set("fontColor", p.text);
          set("fillColor", "none");
          set("labelBackgroundColor", "none");
        } else if (style.includes("swimlane")) {
          set("fillColor", p.internal);
          set("swimlaneFillColor", p.background);
          set("fontColor", p.nodeText);
          set("strokeColor", p.border);
        } else {
          set("fillColor", p.internal);
          set("fontColor", p.nodeText);
          set("strokeColor", p.border);
        }
      }
      return setXmlAttr(tag, "style", style);
    });
  }

  return nextXml.replace(/<mxCell\b[^>]*>/g, (tag) => {
    const id = getXmlAttr(tag, "id");
    const role = getXmlAttr(tag, "mavisRole");
    if (!role && id !== "mavis_title" && id !== "mavis_scope") return tag;
    let style = getXmlAttr(tag, "style");
    const set = (name: string, value: string) => {
      const regex = new RegExp(`(^|;)${name}=[^;]*`);
      style = regex.test(style)
        ? style.replace(regex, `$1${name}=${value}`)
        : `${style}${style.endsWith(";") ? "" : ";"}${name}=${value};`;
    };
    if (role && !["boundary", "edge", "edge-label", "legend"].includes(role)) {
      const locks = style
        .split(";")
        .filter((part) =>
          /^(movable|resizable|rotatable|editable|connectable|deletable|locked)=/.test(part),
        )
        .join(";");
      return setXmlAttr(
        tag,
        "style",
        nodeStyle(role, theme).replace("html=0", "html=1") + locks + ";",
      );
    }
    set("fontColor", p.text);
    if (role === "edge") {
      set("strokeColor", p.line);
      if (style.includes("labelBackgroundColor=") || getXmlAttr(tag, "value")) {
        set("labelBackgroundColor", "none");
      }
    } else if (role === "boundary") {
      set("fillColor", p.background);
      set("swimlaneFillColor", p.background);
      set("strokeColor", p.border);
    } else if (role === "edge-label") {
      set("fillColor", "none");
    } else if (role === "legend") {
      set("fillColor", p.background);
      if (theme === "monochrome") set("strokeColor", p.border);
    }
    return setXmlAttr(tag, "style", style);
  });
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
  notation: string | undefined,
  level: string | undefined,
  scope: string,
) {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  if (doc.querySelector("parsererror")) throw new Error("Draft XML is invalid");
  const readMetadata = (element: Element, attribute: string): Record<string, unknown> => {
    const value = element.getAttribute(attribute);
    if (!value) return {};
    try {
      const parsed: unknown = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
        return parsed as Record<string, unknown>;
    } catch { /* Refuse a lossy relayout rather than discarding provenance. */ }
    throw new Error("Draft metadata is invalid. Restore the recovery copy or regenerate from the model.");
  };
  const graph = doc.querySelector("mxGraphModel");
  if (!graph) throw new Error("Draft graph is missing");
  // draw.io re-encodes mxGraphModel using its built-in attributes, but preserves custom cell
  // attributes. The title carries a second copy so real editor save/export stays lossless.
  const stored = readMetadata(doc.querySelector("[mavisDocument]") ?? graph, "mavisDocument");
  const canonicalNotation = notation || (typeof stored["notation"] === "string" ? stored["notation"] : "");
  const canonicalLevel = level || (typeof stored["level"] === "string" ? stored["level"] : "");
  if (!canonicalNotation || !canonicalLevel)
    throw new Error("This legacy draft has no view metadata. Reopen its view or regenerate before relayout.");
  const scopeContainerId =
    typeof stored["scopeContainerId"] === "string" ? stored["scopeContainerId"] :
    graph.getAttribute("mavisContainerId") ||
    (scope.startsWith("components:") ? scope.slice("components:".length) : undefined);
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
  const nodes = shapes.map((entry) => {
    // S2d/M1 round-trip: a boundary cell whose mavisId is the namespaced synthetic id
    // ("system:...") is a grouping boundary — preserve its identity as SYSTEM_BOUNDARY instead
    // of flattening it into a business node. A container boundary in C3 is a real model element,
    // so it keeps its own kind. Properties ride along for labels/metadata round-trips.
    const mavisId = entry.owner.getAttribute("mavisId") ?? entry.id;
    const isSystemBoundary = entry.role === "boundary" && mavisId.startsWith("system:");
    const explicitKind = entry.owner.getAttribute("mavisKind");
    const nodeMetadata = readMetadata(entry.owner, "mavisNodeMetadata");
    const kind = entry.role === "boundary"
      ? explicitKind || (isSystemBoundary && canonicalNotation === "C4" && canonicalLevel === "CONTAINER"
        ? "SYSTEM_BOUNDARY" : canonicalNotation === "C4" && canonicalLevel === "COMPONENT"
          ? "SERVICE_CONTAINER" : "UNKNOWN")
      : entry.role || "UNKNOWN";
    if ((entry.role === "boundary" && kind === "UNKNOWN") ||
        (canonicalNotation === "C4" && canonicalLevel === "CONTAINER" &&
          mavisId === "system:boundary" && entry.role !== "boundary"))
      throw new Error("This draft has lost its boundary metadata. Restore a valid history revision or regenerate from the model.");
    const properties = readMetadata(entry.owner, "mavisProperties");
    return {
      ...nodeMetadata,
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
      kind,
      ...(kind === "SYSTEM_BOUNDARY" ? { viewLocal: true } : {}),
      parentId: ids.get(entry.cell.getAttribute("parent") ?? ""),
      languageStack: entry.owner.getAttribute("mavisTechnology") ?? "",
      description: entry.owner.getAttribute("mavisDescription") ?? "",
      properties,
    };
  });
  const edges = entries
    .filter((entry) => entry.cell.getAttribute("edge") === "1")
    .map((entry) => {
      const from = ids.get(entry.cell.getAttribute("source") ?? ""),
        to = ids.get(entry.cell.getAttribute("target") ?? "");
      if (!from || !to)
        throw new Error("Every connector must attach to two shapes before relayout");
      return {
        ...readMetadata(entry.owner, "mavisEdgeMetadata"),
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
    ...stored,
    omittedNodes: Number(
      doc.querySelector("[mavisOmittedNodes]")?.getAttribute("mavisOmittedNodes") ?? 0,
    ),
    omittedEdges: Number(
      doc.querySelector("[mavisOmittedEdges]")?.getAttribute("mavisOmittedEdges") ?? 0,
    ),
    modelVersionId: modelId,
    diagramId,
    notation: canonicalNotation,
    level: canonicalLevel,
    scopeContainerId,
    layoutJson: { nodes, edges },
  };
}
