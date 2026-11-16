export type DiagramFormat = "MERMAID" | "PLANTUML" | "DRAWIO_XML" | "JSON";
export type DrawingStyle = "clean" | "dark" | "blueprint";
type PlantEngine = {
  renderToString: (
    lines: string[],
    success: (svg: string) => void,
    error: (message: string) => void,
    options: { dark: boolean; maxSvgSize: number },
  ) => void;
};
let plantEngine: Promise<PlantEngine> | undefined;
function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => {
      script.remove();
      reject(new Error("Local diagram engine could not load"));
    };
    document.head.appendChild(script);
  });
}
async function plant() {
  if (!plantEngine)
    plantEngine = (async () => {
      await loadScript("/api/diagram-engine/viz-global.js");
      await loadScript("/api/diagram-engine/themes.js");
      const url = "/api/diagram-engine/plantuml.js";
      return (await import(/* webpackIgnore: true */ url)) as PlantEngine;
    })().catch((error) => {
      plantEngine = undefined;
      throw error;
    });
  return plantEngine;
}
let sequence = 0;
export async function renderDiagram(
  content: string,
  format: "MERMAID" | "PLANTUML",
  style: DrawingStyle,
) {
  if (content.length > 500_000)
    throw new Error("Diagram is too large to preview. Download the source instead.");
  if (format === "MERMAID") {
    const { default: mermaid } = await import("mermaid");
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      suppressErrorRendering: true,
      theme: style === "dark" ? "dark" : style === "blueprint" ? "base" : "default",
      themeVariables:
        style === "blueprint"
          ? {
              primaryColor: "#0b3658",
              primaryTextColor: "#e0f2fe",
              primaryBorderColor: "#38bdf8",
              lineColor: "#38bdf8",
              background: "#082032",
            }
          : {},
      htmlLabels: false,
      flowchart: { htmlLabels: false },
      look: "classic",
      fontFamily: "Arial, sans-serif",
      maxTextSize: 500_000,
    });
    let source = content;
    if (/^C4/.test(content) && style !== "clean") {
      const background = style === "blueprint" ? "#0b3658" : "#243447";
      const border = style === "blueprint" ? "#38bdf8" : "#94a3b8";
      for (const match of content.matchAll(/^\s*(?:Container|Component|System)[\w]*\((n_\w+),/gm)) {
        source += `\nUpdateElementStyle(${match[1]}, "${background}", "#e0f2fe", "${border}")`;
      }
      for (const match of content.matchAll(/^\s*Rel\((n_\w+),\s*(n_\w+),/gm)) {
        source += `\nUpdateRelStyle(${match[1]}, ${match[2]}, "${border}", "${border}")`;
      }
    }
    const { svg } = await mermaid.render(`mavis_diagram_${++sequence}`, source);
    return svg;
  }
  const engine = await plant();
  const source =
    style === "blueprint"
      ? content.replace(
          /@enduml/,
          "skinparam backgroundColor #082032\nskinparam defaultFontColor #e0f2fe\nskinparam ArrowColor #38bdf8\nskinparam rectangleBackgroundColor #0b3658\nskinparam rectangleBorderColor #38bdf8\nskinparam rectangleFontColor #e0f2fe\n@enduml",
        )
      : content;
  return await new Promise<string>((resolve, reject) =>
    engine.renderToString(source.split(/\r?\n/), resolve, (message) => reject(new Error(message)), {
      dark: style === "dark",
      maxSvgSize: 8192,
    }),
  );
}
