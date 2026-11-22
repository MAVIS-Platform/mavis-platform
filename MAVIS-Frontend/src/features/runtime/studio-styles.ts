export type StudioStyleId = "daylight" | "blueprint" | "pop" | "control";

export type StudioStyleConfig = {
  id: StudioStyleId;
  name: string;
  nameVi: string;
  tagline: string;
  taglineVi: string;
  isDark: boolean;
  wireMode: "bezier" | "orthogonal";
  /** Canvas surface & SVG background pattern */
  canvasBg: string;
  canvasBgCss: string;
  gridKind: "dots" | "blueprint" | "plus";
  gridColor: string;
  gridMajorColor: string;
  /** 2D node card geometry */
  nodeRadius: number;
  nodeStrokeWidth: number;
  nodeShadow: string;
  nodeFontMono: boolean;
  nodeCornerTicks: boolean;
  nodeHardShadowColor: string | null;
  nodeTopStrip: boolean;
  /** 3D stage deck palette */
  deckTopFill: string;
  deckRimFill: string;
  deckStroke: string;
  deckGridStroke: string;
  isoRightShade: string;
  isoRightOpacity: string;
  /** Shared HUD chrome classes */
  topBarClass: string;
  floatingCardClass: string;
  floatingPillClass: string;
  railClass: string;
  drawerClass: string;
  missionCardClass: string;
  missionAccentClass: string;
};

export const STUDIO_STYLE_LIST: readonly StudioStyleId[] = [
  "daylight",
  "blueprint",
  "pop",
  "control",
] as const;

export const STUDIO_STYLES: Record<StudioStyleId, StudioStyleConfig> = {
  daylight: {
    id: "daylight",
    name: "Daylight Cloud",
    nameVi: "Daylight Cloud",
    tagline: "Airy modern cloud canvas with frosted glass & smooth flows",
    taglineVi: "Nền sáng trong trẻo, thẻ kính mờ & dây cong mượt",
    isDark: false,
    wireMode: "bezier",
    canvasBg: "#F3F8FF",
    canvasBgCss:
      "radial-gradient(circle at 12% 10%, rgba(14,165,233,0.11), transparent 40%), radial-gradient(circle at 88% 85%, rgba(16,185,129,0.09), transparent 42%), #F3F8FF",
    gridKind: "dots",
    gridColor: "#BFD2EB",
    gridMajorColor: "#93B4DC",
    nodeRadius: 16,
    nodeStrokeWidth: 1.4,
    nodeShadow: "drop-shadow(0 8px 18px rgba(15,23,42,0.08))",
    nodeFontMono: false,
    nodeCornerTicks: false,
    nodeHardShadowColor: null,
    nodeTopStrip: true,
    deckTopFill: "#FFFFFF",
    deckRimFill: "#D8E7FB",
    deckStroke: "#93C5FD",
    deckGridStroke: "#94A3B8",
    isoRightShade: "#CBD5E1",
    isoRightOpacity: "0.42",
    topBarClass:
      "border-sky-200/80 bg-white/90 text-slate-900 backdrop-blur-md shadow-[0_1px_10px_rgba(15,23,42,0.05)]",
    floatingCardClass:
      "rounded-2xl border border-sky-200/85 bg-white/95 text-slate-900 backdrop-blur-md shadow-[0_14px_34px_-10px_rgba(15,23,42,0.14)]",
    floatingPillClass:
      "rounded-full border border-sky-200/90 bg-white/95 text-slate-800 backdrop-blur-md shadow-[0_8px_24px_-8px_rgba(15,23,42,0.16)]",
    railClass:
      "rounded-2xl border border-sky-200/90 bg-white/95 text-slate-700 backdrop-blur-md shadow-[0_10px_28px_-8px_rgba(15,23,42,0.14)]",
    drawerClass:
      "border-sky-200/90 bg-white text-slate-900 shadow-[0_-12px_36px_-10px_rgba(15,23,42,0.14)]",
    missionCardClass:
      "rounded-2xl border border-sky-200/90 bg-white/96 text-slate-900 backdrop-blur-md shadow-[0_14px_34px_-10px_rgba(15,23,42,0.14)]",
    missionAccentClass: "bg-gradient-to-r from-sky-500 via-blue-600 to-emerald-500",
  },
  blueprint: {
    id: "blueprint",
    name: "Architect Blueprint",
    nameVi: "Bản vẽ Kiến trúc",
    tagline: "Crisp CAD grid, corner brackets & orthogonal circuit wires",
    taglineVi: "Lưới CAD kỹ sư 2 cấp, góc kỹ thuật & dây vuông góc",
    isDark: false,
    wireMode: "orthogonal",
    canvasBg: "#EAF3FF",
    canvasBgCss:
      "linear-gradient(180deg, #EDF5FF 0%, #E3EEFF 100%)",
    gridKind: "blueprint",
    gridColor: "#BFDBFE",
    gridMajorColor: "#93C5FD",
    nodeRadius: 5,
    nodeStrokeWidth: 1.6,
    nodeShadow: "drop-shadow(0 4px 10px rgba(30,64,175,0.10))",
    nodeFontMono: true,
    nodeCornerTicks: true,
    nodeHardShadowColor: null,
    nodeTopStrip: false,
    deckTopFill: "#E0EEFF",
    deckRimFill: "#BFDBFE",
    deckStroke: "#2563EB",
    deckGridStroke: "#3B82F6",
    isoRightShade: "#93C5FD",
    isoRightOpacity: "0.45",
    topBarClass:
      "border-blue-300/90 bg-[#F7FBFF]/96 text-slate-900 shadow-2xs",
    floatingCardClass:
      "rounded-lg border border-blue-300 bg-[#FAFDFE] text-slate-900 shadow-[0_10px_28px_-10px_rgba(30,64,175,0.18)]",
    floatingPillClass:
      "rounded-lg border border-blue-300 bg-[#FAFDFE] text-slate-900 shadow-[0_6px_18px_-6px_rgba(30,64,175,0.18)]",
    railClass:
      "rounded-lg border border-blue-300 bg-[#FAFDFE] text-blue-900 shadow-[0_8px_22px_-8px_rgba(30,64,175,0.18)]",
    drawerClass:
      "border-blue-300 bg-[#FAFDFE] text-slate-900 shadow-[0_-10px_30px_-10px_rgba(30,64,175,0.16)]",
    missionCardClass:
      "rounded-lg border border-blue-300 bg-[#FAFDFE] text-slate-900 shadow-[0_10px_26px_-10px_rgba(30,64,175,0.18)]",
    missionAccentClass: "bg-blue-600",
  },
  pop: {
    id: "pop",
    name: "Tactile Pop",
    nameVi: "Tactile Pop",
    tagline: "Vibrant pastel cards with crisp ink borders & offset shadows",
    taglineVi: "Màu pastel rực rõ, viền đậm & bóng khối cứng nổi bật",
    isDark: false,
    wireMode: "bezier",
    canvasBg: "#FFFFFF",
    canvasBgCss: "#FFFFFF",
    gridKind: "plus",
    gridColor: "#CBD5E1",
    gridMajorColor: "#94A3B8",
    nodeRadius: 12,
    nodeStrokeWidth: 2.2,
    nodeShadow: "none",
    nodeFontMono: false,
    nodeCornerTicks: false,
    nodeHardShadowColor: "#0F172A",
    nodeTopStrip: false,
    deckTopFill: "#FFFDF7",
    deckRimFill: "#E2E8F0",
    deckStroke: "#0F172A",
    deckGridStroke: "#64748B",
    isoRightShade: "#94A3B8",
    isoRightOpacity: "0.42",
    topBarClass:
      "border-b-2 border-slate-900 bg-white text-slate-950",
    floatingCardClass:
      "rounded-2xl border-2 border-slate-900 bg-white text-slate-950 shadow-[4px_4px_0_#0F172A]",
    floatingPillClass:
      "rounded-full border-2 border-slate-900 bg-white text-slate-950 shadow-[3px_3px_0_#0F172A]",
    railClass:
      "rounded-2xl border-2 border-slate-900 bg-white text-slate-900 shadow-[3px_3px_0_#0F172A]",
    drawerClass:
      "border-t-2 border-slate-900 bg-white text-slate-950 shadow-[0_-6px_0_rgba(15,23,42,0.08)]",
    missionCardClass:
      "rounded-2xl border-2 border-slate-900 bg-[#FFFBEB] text-slate-950 shadow-[4px_4px_0_#0F172A]",
    missionAccentClass: "bg-slate-900",
  },
  control: {
    id: "control",
    name: "Control Glass",
    nameVi: "Control Glass (Tối)",
    tagline: "Sleek dark NOC command surface with luminous health cues",
    taglineVi: "Phòng điều hành tối sang trọng, phát sáng theo sức khỏe live",
    isDark: true,
    wireMode: "bezier",
    canvasBg: "#070D1D",
    canvasBgCss:
      "radial-gradient(circle at 18% 12%, rgba(56,189,248,0.12), transparent 42%), radial-gradient(circle at 85% 88%, rgba(16,185,129,0.09), transparent 42%), #070D1D",
    gridKind: "dots",
    gridColor: "#334155",
    gridMajorColor: "#475569",
    nodeRadius: 14,
    nodeStrokeWidth: 1.5,
    nodeShadow: "drop-shadow(0 8px 20px rgba(0,0,0,0.45))",
    nodeFontMono: false,
    nodeCornerTicks: false,
    nodeHardShadowColor: null,
    nodeTopStrip: true,
    deckTopFill: "#0A101D",
    deckRimFill: "#1E293B",
    deckStroke: "#334155",
    deckGridStroke: "#64748B",
    isoRightShade: "#050811",
    isoRightOpacity: "0.78",
    topBarClass:
      "border-slate-800 bg-[#0B1120]/95 text-slate-100 backdrop-blur-md",
    floatingCardClass:
      "rounded-2xl border border-slate-700/85 bg-[#0C1324]/95 text-slate-100 backdrop-blur-md shadow-2xl",
    floatingPillClass:
      "rounded-full border border-slate-700/85 bg-[#0C1324]/95 text-slate-100 backdrop-blur-md shadow-xl",
    railClass:
      "rounded-2xl border border-slate-700/85 bg-[#0C1324]/95 text-slate-200 backdrop-blur-md shadow-xl",
    drawerClass:
      "border-slate-800 bg-[#090F1E] text-slate-100 shadow-2xl",
    missionCardClass:
      "rounded-2xl border border-slate-700/85 bg-[#0C1324]/95 text-slate-100 backdrop-blur-md shadow-2xl",
    missionAccentClass: "bg-gradient-to-r from-sky-400 via-indigo-400 to-emerald-400",
  },
};

export function resolveStudioStyle(raw?: string | null): StudioStyleId {
  if (raw === "daylight" || raw === "blueprint" || raw === "pop" || raw === "control") {
    return raw;
  }
  if (raw === "dark") return "control";
  return "daylight";
}
