import { generateDrawio as generate } from "./generate";
import { layoutInWorker } from "./layout-worker";
import type { DiagramDocument, DrawioTheme } from "./rules";
export const generateDrawio = (doc: DiagramDocument, theme: DrawioTheme = "clean") =>
  generate(doc, theme, layoutInWorker);
