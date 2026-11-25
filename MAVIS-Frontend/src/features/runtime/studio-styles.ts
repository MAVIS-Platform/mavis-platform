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
  /** Unified inner UI control tokens (synchronized with active theme, single calm accent — no rainbow clutter) */
  panelHeaderClass: string;
  subSurfaceClass: string;
  tabTrackClass: string;
  tabActiveClass: string;
  tabIdleClass: string;
  controlActiveClass: string;
  controlActiveMutedClass: string;
  controlIdleClass: string;
  inputClass: string;
  topControlClass: string;
  railActiveClass: string;
  railIdleClass: string;
  railBadgeClass: string;
  drawerTabBarClass: string;
  subtleTextClass: string;
  dividerClass: string;
  controlRadiusClass: string;
  checkboxAccentClass: string;
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
    panelHeaderClass: "border-sky-200/80 bg-sky-50/55 text-slate-900",
    subSurfaceClass: "rounded-md border border-sky-200/80 bg-sky-50/45 text-slate-900",
    tabTrackClass: "rounded-md border border-sky-200/85 bg-sky-50/80",
    tabActiveClass: "rounded-sm bg-white text-sky-900 shadow-xs ring-1 ring-sky-200/90",
    tabIdleClass: "rounded-sm text-slate-600 hover:bg-white/75 hover:text-slate-900",
    controlActiveClass: "border-sky-600 bg-sky-600 text-white shadow-xs",
    controlActiveMutedClass: "text-sky-100",
    controlIdleClass:
      "border-sky-200/90 bg-white text-slate-800 hover:border-sky-400 hover:bg-sky-50/50 hover:text-slate-950",
    inputClass:
      "rounded-md border border-sky-200/90 bg-white text-slate-900 focus-visible:border-sky-500 focus-visible:ring-sky-500/30",
    topControlClass:
      "rounded-md border border-sky-200/90 bg-white/95 text-slate-800 hover:border-sky-300 hover:bg-sky-50/70",
    railActiveClass: "rounded-md bg-sky-600 text-white shadow-xs",
    railIdleClass: "rounded-md text-slate-600 hover:bg-sky-50 hover:text-sky-900",
    railBadgeClass: "bg-sky-600 text-white ring-2 ring-white",
    drawerTabBarClass: "border-sky-200/80 bg-sky-50/55",
    subtleTextClass: "text-slate-500",
    dividerClass: "bg-sky-200/85",
    controlRadiusClass: "rounded-md",
    checkboxAccentClass: "accent-sky-600",
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
      "rounded-sm border border-blue-300 bg-[#FAFDFE] text-slate-900 shadow-[0_10px_28px_-10px_rgba(30,64,175,0.18)]",
    floatingPillClass:
      "rounded-sm border border-blue-300 bg-[#FAFDFE] text-slate-900 shadow-[0_6px_18px_-6px_rgba(30,64,175,0.18)]",
    railClass:
      "rounded-sm border border-blue-300 bg-[#FAFDFE] text-blue-900 shadow-[0_8px_22px_-8px_rgba(30,64,175,0.18)]",
    drawerClass:
      "border-blue-300 bg-[#FAFDFE] text-slate-900 shadow-[0_-10px_30px_-10px_rgba(30,64,175,0.16)]",
    missionCardClass:
      "rounded-sm border border-blue-300 bg-[#FAFDFE] text-slate-900 shadow-[0_10px_26px_-10px_rgba(30,64,175,0.18)]",
    missionAccentClass: "bg-blue-700",
    panelHeaderClass: "border-blue-300/90 bg-[#EAF3FF]/90 text-blue-950",
    subSurfaceClass: "rounded-sm border border-blue-300/85 bg-[#EFF6FF]/85 text-slate-900",
    tabTrackClass: "rounded-sm border border-blue-300 bg-[#E6F0FF]",
    tabActiveClass: "rounded-[2px] bg-blue-700 text-white",
    tabIdleClass: "rounded-[2px] text-blue-900/75 hover:bg-blue-100/80 hover:text-blue-950",
    controlActiveClass: "border-blue-700 bg-blue-700 text-white",
    controlActiveMutedClass: "text-blue-100",
    controlIdleClass:
      "border-blue-300/90 bg-white text-slate-900 hover:border-blue-600 hover:bg-[#EDF5FF]",
    inputClass:
      "rounded-sm border border-blue-300 bg-white text-slate-900 focus-visible:border-blue-700 focus-visible:ring-blue-600/30",
    topControlClass:
      "rounded-sm border border-blue-300 bg-white text-blue-950 hover:border-blue-500 hover:bg-[#EDF5FF]",
    railActiveClass: "rounded-sm bg-blue-700 text-white",
    railIdleClass: "rounded-sm text-blue-900/75 hover:bg-blue-100/80 hover:text-blue-950",
    railBadgeClass: "bg-blue-700 text-white ring-2 ring-[#FAFDFE]",
    drawerTabBarClass: "border-blue-300/90 bg-[#EDF5FF]",
    subtleTextClass: "text-blue-900/65",
    dividerClass: "bg-blue-300",
    controlRadiusClass: "rounded-sm",
    checkboxAccentClass: "accent-blue-700",
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
      "rounded-2xl border-2 border-slate-900 bg-[#FFFDF7] text-slate-950 shadow-[4px_4px_0_#0F172A]",
    missionAccentClass: "bg-slate-900",
    panelHeaderClass: "border-b-2 border-slate-900 bg-[#FFFDF7] text-slate-950",
    subSurfaceClass: "rounded-md border-2 border-slate-900 bg-[#FFFDF7] text-slate-950",
    tabTrackClass: "rounded-md border-2 border-slate-900 bg-[#F8FAFC]",
    tabActiveClass:
      "rounded-sm border border-slate-900 bg-[#DBEAFE] text-slate-950 shadow-[2px_2px_0_#0F172A]",
    tabIdleClass: "rounded-sm text-slate-700 hover:bg-slate-100 hover:text-slate-950",
    controlActiveClass:
      "border-2 border-slate-900 bg-[#DBEAFE] text-slate-950 shadow-[2px_2px_0_#0F172A]",
    controlActiveMutedClass: "text-slate-700",
    controlIdleClass:
      "border-2 border-slate-900/80 bg-white text-slate-900 hover:border-slate-900 hover:bg-[#F8FAFC] hover:shadow-[2px_2px_0_#0F172A]",
    inputClass:
      "rounded-md border-2 border-slate-900 bg-white text-slate-950 focus-visible:ring-slate-900/30",
    topControlClass:
      "rounded-md border-2 border-slate-900 bg-white text-slate-950 hover:bg-[#F8FAFC] hover:shadow-[2px_2px_0_#0F172A]",
    railActiveClass:
      "rounded-md border-2 border-slate-900 bg-[#DBEAFE] text-slate-950 shadow-[2px_2px_0_#0F172A]",
    railIdleClass: "rounded-md text-slate-800 hover:bg-slate-100 hover:text-slate-950",
    railBadgeClass: "border border-slate-900 bg-[#DBEAFE] text-slate-950 shadow-[1px_1px_0_#0F172A]",
    drawerTabBarClass: "border-b-2 border-slate-900 bg-[#FFFDF7]",
    subtleTextClass: "text-slate-600",
    dividerClass: "bg-slate-900/25",
    controlRadiusClass: "rounded-md",
    checkboxAccentClass: "accent-slate-900",
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
    panelHeaderClass: "border-slate-800 bg-[#0A101E]/90 text-slate-100",
    subSurfaceClass: "rounded-md border border-slate-800 bg-slate-900/70 text-slate-100",
    tabTrackClass: "rounded-md border border-slate-800 bg-slate-950/90",
    tabActiveClass: "rounded-sm bg-sky-500/20 text-sky-100 ring-1 ring-sky-400/45",
    tabIdleClass: "rounded-sm text-slate-400 hover:bg-slate-800/70 hover:text-slate-100",
    controlActiveClass:
      "border-sky-400/70 bg-sky-500/20 text-sky-100 shadow-[0_0_0_1px_rgba(56,189,248,0.2)]",
    controlActiveMutedClass: "text-sky-200/80",
    controlIdleClass:
      "border-slate-700/85 bg-slate-900/75 text-slate-200 hover:border-sky-400/55 hover:bg-slate-800/85 hover:text-white",
    inputClass:
      "rounded-md border border-slate-700 bg-slate-950/90 text-slate-100 focus-visible:border-sky-400 focus-visible:ring-sky-400/30",
    topControlClass:
      "rounded-md border border-slate-700/90 bg-slate-900/90 text-slate-200 hover:border-sky-400/45 hover:bg-slate-800",
    railActiveClass: "rounded-md bg-sky-500/25 text-sky-200 ring-1 ring-sky-400/50",
    railIdleClass: "rounded-md text-slate-300 hover:bg-slate-800 hover:text-white",
    railBadgeClass: "bg-sky-400 text-slate-950 ring-2 ring-[#0C1324]",
    drawerTabBarClass: "border-slate-800 bg-[#0B1120]",
    subtleTextClass: "text-slate-400",
    dividerClass: "bg-slate-700",
    controlRadiusClass: "rounded-md",
    checkboxAccentClass: "accent-sky-400",
  },
};

export function resolveStudioStyle(raw?: string | null): StudioStyleId {
  if (raw === "daylight" || raw === "blueprint" || raw === "pop" || raw === "control") {
    return raw;
  }
  if (raw === "dark") return "control";
  return "daylight";
}

export type StudioNodeVisualPalette = {
  stroke: string;
  cardFill: string;
  iconBg: string;
  accent: string;
  pillBg: string;
  pillStroke: string;
  pillChipBg: string;
  pillIconColor: string;
  pillTextFill: string;
  pillCountFill: string;
  sculptureFilter: string | undefined;
  pillFilter: string | undefined;
};

type ServiceVisualRole =
  | "gateway"
  | "database"
  | "queue"
  | "worker"
  | "service";

function detectServiceVisualRole(serviceName: string, archetype: string): ServiceVisualRole {
  const n = serviceName.toLowerCase();
  if (
    archetype === "GATEWAY" ||
    /(gateway|edge|proxy|ingress|cdn|waf|shield|firewall|load-balancer)/.test(n)
  ) {
    return "gateway";
  }
  if (
    archetype === "DATABASE" ||
    /(postgres|mysql|mongo|nosql|redis|memcache|cache|s3|storage|bucket|blob|elastic|search|\bdb\b)/.test(n)
  ) {
    return "database";
  }
  if (archetype === "QUEUE" || /(kafka|rabbit|amqp|broker|queue|\bmq\b|stream|bus)/.test(n)) {
    return "queue";
  }
  if (/(worker|consumer|processor|dispatcher|scheduler|notifier|cron|job)/.test(n)) {
    return "worker";
  }
  return "service";
}

// Consistent SE architectural tier palette (Gateway / Service / Worker / Database / Broker — never mixes warning amber).
const DAYLIGHT_ROLE_COLORS: Record<ServiceVisualRole, { accent: string; top: string }> = {
  gateway: { accent: "#0284c7", top: "#e0f2fe" },
  service: { accent: "#2563eb", top: "#dbeafe" },
  worker: { accent: "#6366f1", top: "#e0e7ff" },
  database: { accent: "#059669", top: "#dcfce7" },
  queue: { accent: "#9333ea", top: "#f3e8ff" },
};

const POP_ROLE_COLORS: Record<
  ServiceVisualRole,
  { fill: string; top: string; chip: string; accent: string }
> = {
  gateway: { fill: "#e0f2fe", top: "#7dd3fc", chip: "#38bdf8", accent: "#0369a1" },
  service: { fill: "#dbeafe", top: "#93c5fd", chip: "#60a5fa", accent: "#1e40af" },
  worker: { fill: "#e0e7ff", top: "#a5b4fc", chip: "#818cf8", accent: "#3730a3" },
  database: { fill: "#dcfce7", top: "#86efac", chip: "#4ade80", accent: "#166534" },
  queue: { fill: "#f3e8ff", top: "#d8b4fe", chip: "#c084fc", accent: "#6b21a8" },
};

const CONTROL_ROLE_COLORS: Record<
  ServiceVisualRole,
  { stroke: string; top: string; chip: string; accent: string }
> = {
  gateway: { stroke: "#38bdf8", top: "#0c4a6e", chip: "#0c4a6e", accent: "#7dd3fc" },
  service: { stroke: "#60a5fa", top: "#1e3a8a", chip: "#1e3a8a", accent: "#93c5fd" },
  worker: { stroke: "#818cf8", top: "#312e81", chip: "#312e81", accent: "#c7d2fe" },
  database: { stroke: "#2dd4bf", top: "#134e4a", chip: "#134e4a", accent: "#5eead4" },
  queue: { stroke: "#c084fc", top: "#3b0764", chip: "#3b0764", accent: "#e9d5ff" },
};

export function resolveStudioNodePalette(
  styleId: StudioStyleId,
  serviceName: string,
  archetype: string,
  state: { isCritical: boolean; isWarning: boolean; isSelected: boolean; isDropTarget: boolean },
): StudioNodeVisualPalette {
  const { isCritical, isWarning, isSelected, isDropTarget } = state;
  const role = detectServiceVisualRole(serviceName, archetype);
  const highlight = isSelected || isDropTarget;

  if (styleId === "control") {
    const base = CONTROL_ROLE_COLORS[role];
    const stroke = isCritical
      ? "#f43f5e"
      : isWarning
        ? "#fbbf24"
        : highlight
          ? "#38bdf8"
          : base.stroke;
    const accent = isCritical
      ? "#fda4af"
      : isWarning
        ? "#fde68a"
        : highlight
          ? "#7dd3fc"
          : base.accent;
    const top = isCritical ? "#881337" : isWarning ? "#422a0a" : base.top;
    const chip = isCritical ? "#4c0519" : isWarning ? "#451a03" : highlight ? "#0c4a6e" : base.chip;
    return {
      stroke,
      cardFill: isCritical ? "#1f0912" : isWarning ? "#1f1506" : "#0f172a",
      iconBg: top,
      accent,
      pillBg: isCritical ? "#240a14" : isWarning ? "#241908" : "#0b111e",
      pillStroke: isCritical ? "#f43f5e" : isWarning ? "#fbbf24" : highlight ? "#38bdf8" : stroke,
      pillChipBg: chip,
      pillIconColor: accent,
      pillTextFill: isSelected ? "#ffffff" : "#e2e8f0",
      pillCountFill: accent,
      sculptureFilter: highlight
        ? "drop-shadow(0 0 10px rgba(56, 189, 248, 0.5))"
        : isCritical
          ? "drop-shadow(0 0 8px rgba(244, 63, 94, 0.48))"
          : "drop-shadow(0 0 7px rgba(56, 189, 248, 0.18))",
      pillFilter: highlight ? "drop-shadow(0 0 6px rgba(56, 189, 248, 0.35))" : undefined,
    };
  }

  if (styleId === "pop") {
    const base = POP_ROLE_COLORS[role];
    const ink = isCritical ? "#e11d48" : isWarning ? "#b45309" : highlight ? "#0056D2" : "#0f172a";
    const fill = isCritical ? "#ffe4e6" : isWarning ? "#fef3c7" : base.fill;
    const top = isCritical ? "#fda4af" : isWarning ? "#fcd34d" : base.top;
    const chip = isCritical ? "#fda4af" : isWarning ? "#fcd34d" : base.chip;
    const accent = isCritical ? "#be123c" : isWarning ? "#92400e" : "#0f172a";
    return {
      stroke: ink,
      cardFill: fill,
      iconBg: top,
      accent,
      pillBg: fill,
      pillStroke: ink,
      pillChipBg: chip,
      pillIconColor: "#0f172a",
      pillTextFill: "#0f172a",
      pillCountFill: "#0f172a",
      sculptureFilter: highlight
        ? "drop-shadow(3px 3px 0px #0056D2)"
        : isCritical
          ? "drop-shadow(3px 3px 0px #e11d48)"
          : "drop-shadow(3px 3px 0px #0f172a)",
      pillFilter: isCritical
        ? "drop-shadow(2px 2px 0px #e11d48)"
        : "drop-shadow(2px 2px 0px #0f172a)",
    };
  }

  if (styleId === "blueprint") {
    const stroke = isCritical
      ? "#dc2626"
      : isWarning
        ? "#d97706"
        : highlight
          ? "#1e3a8a"
          : "#1d4ed8";
    const top = isCritical
      ? "#fee2e2"
      : isWarning
        ? "#fef3c7"
        : role === "gateway" || role === "database"
          ? "#bfdbfe"
          : "#cde3ff";
    const fill = isCritical ? "#fff5f5" : isWarning ? "#fffbeb" : "#eff6ff";
    const accent = isCritical ? "#b91c1c" : isWarning ? "#b45309" : "#1e40af";
    return {
      stroke,
      cardFill: fill,
      iconBg: top,
      accent,
      pillBg: isCritical ? "#fff5f5" : isWarning ? "#fffbeb" : "#f8fbff",
      pillStroke: isCritical ? "#dc2626" : isWarning ? "#d97706" : highlight ? "#1e3a8a" : "#2563eb",
      pillChipBg: top,
      pillIconColor: accent,
      pillTextFill: "#0f172a",
      pillCountFill: accent,
      sculptureFilter: highlight
        ? "drop-shadow(0 0 8px rgba(30, 64, 175, 0.35))"
        : "drop-shadow(0 4px 8px rgba(30, 64, 175, 0.14))",
      pillFilter: "drop-shadow(0 3px 6px rgba(30, 64, 175, 0.12))",
    };
  }

  // daylight (Daylight Cloud)
  const base = DAYLIGHT_ROLE_COLORS[role];
  const accent = isCritical ? "#e11d48" : isWarning ? "#d97706" : base.accent;
  const top = isCritical ? "#ffe4e6" : isWarning ? "#fef3c7" : base.top;
  return {
    stroke: highlight ? "#0056D2" : accent,
    cardFill: isCritical ? "#fff1f2" : isWarning ? "#fffbeb" : "#ffffff",
    iconBg: top,
    accent,
    pillBg: isCritical ? "#fff1f2" : isWarning ? "#fffbeb" : "#ffffff",
    pillStroke: isCritical ? "#e11d48" : isWarning ? "#d97706" : highlight ? "#0056D2" : "#cbd5e1",
    pillChipBg: top,
    pillIconColor: accent,
    pillTextFill: "#0f172a",
    pillCountFill: accent,
    sculptureFilter: highlight
      ? "drop-shadow(0 0 8px rgba(0, 86, 210, 0.4))"
      : isCritical
        ? "drop-shadow(0 0 6px rgba(225, 29, 72, 0.4))"
        : "drop-shadow(0 6px 10px rgba(15, 23, 42, 0.12))",
    pillFilter: "drop-shadow(0 4px 10px rgba(15, 23, 42, 0.10))",
  };
}

export function resolveStudioSidebarIconClass(styleId: StudioStyleId, serviceName: string): string {
  if (styleId === "blueprint") return "text-blue-700";
  if (styleId === "pop") return "text-slate-900";
  const role = detectServiceVisualRole(serviceName, "");
  if (styleId === "control") {
    switch (role) {
      case "gateway":
        return "text-sky-400";
      case "database":
        return "text-emerald-400";
      case "queue":
        return "text-purple-300";
      case "worker":
        return "text-indigo-300";
      default:
        return "text-blue-400";
    }
  }
  // daylight
  switch (role) {
    case "gateway":
      return "text-sky-600";
    case "database":
      return "text-emerald-600";
    case "queue":
      return "text-purple-600";
    case "worker":
      return "text-indigo-600";
    default:
      return "text-blue-600";
  }
}
