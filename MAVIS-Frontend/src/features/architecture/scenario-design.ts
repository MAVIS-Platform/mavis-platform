import { z } from "zod";
import type { ArchitecturalModel } from "@/types/domain";
import { relationLabel, wrapText } from "@/lib/drawio/rules";

const designSchema = z.object({
  modelId: z.string(),
  name: z.string().trim().min(1).max(120),
  edgeIds: z.array(z.string()).max(30),
});
export type ScenarioDesign = z.infer<typeof designSchema>;
export function scenarioInteractions(model: ArchitecturalModel) {
  const ids = new Set(model.elements.map((node) => node.id));
  return model.edges.filter(
    (edge) =>
      edge.originLayer !== "DEPLOYMENT" &&
      [
        "CODE_DEPENDENCY",
        "SERVICE_HTTP_CALL",
        "DATABASE_ACCESS",
        "DATABASE_QUERY",
        "MESSAGE_PUBLISH",
        "MESSAGE_SUBSCRIBE",
      ].includes(edge.protocol) &&
      ids.has(edge.from) &&
      ids.has(edge.to),
  );
}
export function readScenarioDesign(xml: string, model: ArchitecturalModel): ScenarioDesign | null {
  try {
    const metadata = /\bmavisScenario="([^"]*)"/.exec(xml)?.[1];
    if (!metadata) return null;
    const design = designSchema.parse(JSON.parse(decodeURIComponent(metadata)));
    const allowed = new Set(scenarioInteractions(model).map((edge) => edge.id));
    return design.modelId === model.id && design.edgeIds.every((id) => allowed.has(id))
      ? design
      : null;
  } catch {
    return null;
  }
}
export function scenarioXml(model: ArchitecturalModel, input: ScenarioDesign): string {
  const design = designSchema.parse(input);
  if (design.modelId !== model.id) throw Error("Scenario belongs to another model revision.");
  const allowed = new Map(scenarioInteractions(model).map((edge) => [edge.id, edge]));
  const steps = design.edgeIds.map((id) => {
    const edge = allowed.get(id);
    if (!edge) throw Error("A scenario step is not present in this model.");
    return edge;
  });
  const participants = [...new Set(steps.flatMap((edge) => [edge.from, edge.to]))];
  if (participants.length > 12)
    throw Error("Use at most 12 participants per scenario to keep it readable.");
  const escape = (value: string) =>
    value
      .replaceAll("&", "&amp;")
      .replaceAll('"', "&quot;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll("\n", "&#xa;");
  const headerHeight = Math.max(
    80,
    ...participants.map(
      (id) => wrapText(model.elements.find((node) => node.id === id)!.name, 24).length * 18 + 32,
    ),
  );
  const firstMessageY = 110 + headerHeight + 45;
  const width = Math.max(760, participants.length * 300 + 100),
    height = Math.max(400, firstMessageY + steps.length * 76 + 40);
  const cells = [
    '<mxCell id="0"/><mxCell id="1" parent="0"/>',
    `<mxCell id="title" value="${escape(design.name)}" style="text;html=0;fontFamily=Arial;fontSize=20;fontStyle=1;align=left;" vertex="1" parent="1"><mxGeometry x="40" y="20" width="${width - 80}" height="36" as="geometry"/></mxCell>`,
    `<mxCell id="scope" value="Designed interaction order · not observed execution" style="text;html=0;fontFamily=Arial;fontSize=13;align=left;" vertex="1" parent="1"><mxGeometry x="40" y="60" width="${width - 80}" height="28" as="geometry"/></mxCell>`,
  ];
  participants.forEach((id, i) => {
    const node = model.elements.find((node) => node.id === id)!;
    cells.push(
      `<mxCell id="participant-${i}" mavisId="${escape(id)}" mavisName="${escape(node.name)}" mavisRole="participant" value="${escape(wrapText(node.name, 24).join("\n"))}" style="shape=umlLifeline;perimeter=lifelinePerimeter;size=${headerHeight};html=0;whiteSpace=wrap;fontFamily=Arial;fontSize=14;verticalAlign=top;spacingTop=16;fillColor=#eaf2ff;strokeColor=#52677f;fontColor=#102c4f;" vertex="1" parent="1"><mxGeometry x="${40 + i * 300}" y="110" width="220" height="${height - 110}" as="geometry"/></mxCell>`,
    );
  });
  steps.forEach((edge, i) => {
    const from = participants.indexOf(edge.from),
      to = participants.indexOf(edge.to),
      y = firstMessageY + i * 76,
      position = (y - 110) / (height - 110);
    const async = ["MESSAGE_PUBLISH", "MESSAGE_SUBSCRIBE"].includes(edge.protocol);
    const label = `${i + 1}. ${relationLabel({ id: edge.id, type: edge.protocol })}`;
    const points =
      from === to
        ? `<Array as="points"><mxPoint x="${from * 300 + 300}" y="${y}"/><mxPoint x="${from * 300 + 300}" y="${y + 30}"/></Array>`
        : "";
    cells.push(
      `<mxCell id="step-${i}" mavisId="${escape(edge.id)}" mavisRole="edge" value="${escape(label)}" style="edgeStyle=none;html=0;endArrow=${async ? "open" : "block"};endFill=${async ? 0 : 1};fontFamily=Arial;fontSize=13;fontColor=#102c4f;strokeColor=#52677f;labelBackgroundColor=#ffffff;exitX=0.5;exitY=${position};exitPerimeter=0;entryX=0.5;entryY=${from === to ? (y + 30 - 110) / (height - 110) : position};entryPerimeter=0;" edge="1" parent="1" source="participant-${from}" target="participant-${to}"><mxGeometry relative="1" as="geometry">${points}</mxGeometry></mxCell>`,
    );
  });
  return `<?xml version="1.0" encoding="UTF-8"?><mxfile host="MAVIS"><diagram id="designed-scenario" name="Scenarios (+1)"><mxGraphModel mavisModelId="${escape(model.id)}" mavisViewId="scenarios:designed" mavisScenario="${escape(encodeURIComponent(JSON.stringify(design)))}" page="0" grid="0" background="#ffffff"><root>${cells.join("")}</root></mxGraphModel></diagram></mxfile>`;
}
