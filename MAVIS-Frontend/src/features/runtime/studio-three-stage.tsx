"use client";

import { useEffect, useRef, useState } from "react";
import type * as THREE from "three";
import { STUDIO_STYLES, type StudioNodeVisualPalette, type StudioStyleId } from "./studio-styles";

export type StudioThreeNode = {
  id: string;
  label: string;
  archetype: "DATABASE" | "GATEWAY" | "QUEUE" | "SERVICE";
  stereotype?: string | undefined;
  tier?: number | undefined;
  wx: number;
  wz: number;
  replicas: number;
  isStopped: boolean;
  isPaused?: boolean | undefined;
  isCritical: boolean;
  isWarning: boolean;
  isSelected: boolean;
  isDropTarget: boolean;
  ramPct?: number | null | undefined;
  cpuPct?: number | null | undefined;
  cpuThrottlePct?: number | null | undefined;
  ramLabel?: string | null | undefined;
  palette: StudioNodeVisualPalette;
};

export type StudioThreeEdge = {
  id: string;
  from: string;
  to: string;
  kind: "static" | "observed";
  color: string;
  dashed: boolean;
  protocol?: string | null | undefined;
  isAsync?: boolean | undefined;
  rps?: number | null | undefined;
  label?: string | null;
  isSevered?: boolean;
  isDegraded?: boolean;
  speedSec?: number;
};

export type StudioThreeBounds = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

export type StudioThreeStageProps = {
  nodes: readonly StudioThreeNode[];
  edges: readonly StudioThreeEdge[];
  deckBounds: StudioThreeBounds;
  camera: { yaw: number; pitch: number };
  zoom: number;
  pan: { x: number; y: number };
  styleId: StudioStyleId;
  busy?: boolean;
  showNodeTags?: boolean;
  showEdgeTags?: boolean;
  onCameraChange: (next: { yaw: number; pitch: number }) => void;
  onZoomChange: (next: number) => void;
  onPanChange: (next: { x: number; y: number }) => void;
  onMoveNode?: (service: string, deltaWx: number, deltaWz: number) => void;
  onSelect: (service: string) => void;
  onSelectEdge?: (edge: { id: string; from: string; to: string }) => void;
  onDropTool?: (toolId: string, service: string) => void;
  onReadyChange?: (ready: boolean) => void;
};

const WORLD_SCALE = 1 / 82;
const THREE_PITCH_MIN = 0.34;
const THREE_PITCH_MAX = 1.38;
const THREE_ZOOM_MIN = 0.45;
const THREE_ZOOM_MAX = 2.2;

export function computeNextWheelZoom(
  currentZoom: number,
  deltaY: number,
  deltaMode = 0,
  ctrlKey = false,
): number {
  const pixelDelta = deltaMode === 1 ? deltaY * 24 : deltaMode === 2 ? deltaY * 180 : deltaY;
  const clampedDelta = Math.max(-160, Math.min(160, pixelDelta));
  const sensitivity = ctrlKey ? 0.0045 : 0.0018;
  const next = currentZoom * Math.exp(-clampedDelta * sensitivity);
  return Math.max(THREE_ZOOM_MIN, Math.min(THREE_ZOOM_MAX, next));
}

export function computeNodeLabelPlacement(
  yaw: number,
  pitch: number,
  zoom: number,
  baseY: number,
): { x: number; y: number; z: number; scale: number } {
  const pitchFactor = Math.max(0, Math.min(1.2, (pitch - 0.42) / 0.72));
  const zoomFactor = Math.max(0, Math.min(1, (zoom - 1.15) / 0.85));
  // Slide floating service tag toward the block's upper-back rim (away from camera) so top-deck stats stay readable
  const rimShift = 0.24 + pitchFactor * 0.52 + zoomFactor * 0.34;
  return {
    x: -Math.sin(yaw) * rimShift,
    y: baseY + 0.06 + zoomFactor * 0.08,
    z: -Math.cos(yaw) * rimShift,
    scale: 1 - zoomFactor * 0.26,
  };
}

export function computeLiveDeckBounds(
  liveNodes: ReadonlyArray<{ wx: number; wz: number }>,
): StudioThreeBounds {
  const deckPadding = 150;
  let minNodeX = Infinity;
  let maxNodeX = -Infinity;
  let minNodeZ = Infinity;
  let maxNodeZ = -Infinity;
  for (const n of liveNodes) {
    minNodeX = Math.min(minNodeX, n.wx);
    maxNodeX = Math.max(maxNodeX, n.wx);
    minNodeZ = Math.min(minNodeZ, n.wz);
    maxNodeZ = Math.max(maxNodeZ, n.wz);
  }
  return Number.isFinite(minNodeX) && Number.isFinite(minNodeZ)
    ? {
        minX: Math.min(-220, minNodeX - deckPadding),
        maxX: Math.max(220, maxNodeX + deckPadding),
        minZ: Math.min(-180, minNodeZ - deckPadding),
        maxZ: Math.max(180, maxNodeZ + deckPadding),
      }
    : { minX: -260, maxX: 260, minZ: -200, maxZ: 200 };
}

export type LiveZoneLayout = {
  key: string;
  cx: number;
  cz: number;
  width: number;
  depth: number;
};

export function computeLiveZoneRects(
  zoneSpecs: ReadonlyArray<{ key: string; memberIds: readonly string[] }>,
  posById: ReadonlyMap<string, { wx: number; wz: number }>,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
): LiveZoneLayout[] {
  type RawRect = {
    key: string;
    nodeMinX: number;
    nodeMaxX: number;
    bx0: number;
    bx1: number;
    bz0: number;
    bz1: number;
  };
  const padX = 0.96;
  const padTopZ = 1.08;
  const padBottomZ = 0.86;
  const rects: RawRect[] = [];
  for (const zone of zoneSpecs) {
    let zMinX = Infinity;
    let zMaxX = -Infinity;
    let zMinZ = Infinity;
    let zMaxZ = -Infinity;
    for (const id of zone.memberIds) {
      const pos = posById.get(id);
      if (!pos) continue;
      const mx = pos.wx * WORLD_SCALE;
      const mz = pos.wz * WORLD_SCALE;
      zMinX = Math.min(zMinX, mx);
      zMaxX = Math.max(zMaxX, mx);
      zMinZ = Math.min(zMinZ, mz);
      zMaxZ = Math.max(zMaxZ, mz);
    }
    if (!Number.isFinite(zMinX)) continue;
    rects.push({
      key: zone.key,
      nodeMinX: zMinX,
      nodeMaxX: zMaxX,
      bx0: Math.max(minX + 0.16, zMinX - padX),
      bx1: Math.min(maxX - 0.16, zMaxX + padX),
      bz0: Math.max(minZ + 0.16, zMinZ - padTopZ),
      bz1: Math.min(maxZ - 0.16, zMaxZ + padBottomZ),
    });
  }

  // Keep adjacent horizontal zones cleanly separated so dashed borders never collide
  const edgeRect = rects.find((z) => z.key === "EDGE");
  const coreRect = rects.find((z) => z.key === "CORE");
  if (edgeRect && coreRect && edgeRect.nodeMaxX < coreRect.nodeMinX && edgeRect.bx1 > coreRect.bx0 - 0.16) {
    const splitX = (edgeRect.nodeMaxX + coreRect.nodeMinX) / 2;
    edgeRect.bx1 = Math.max(edgeRect.nodeMaxX + 0.68, splitX - 0.1);
    coreRect.bx0 = Math.min(coreRect.nodeMinX - 0.68, splitX + 0.1);
  }

  return rects.map((zr) => ({
    key: zr.key,
    cx: (zr.bx0 + zr.bx1) / 2,
    cz: (zr.bz0 + zr.bz1) / 2,
    width: Math.max(1.75, zr.bx1 - zr.bx0),
    depth: Math.max(1.65, zr.bz1 - zr.bz0),
  }));
}

type ThreeModule = typeof import("three");

type AnimatedPacket = {
  mesh: THREE.Object3D;
  curve: THREE.QuadraticBezierCurve3;
  speed: number;
  phase: number;
};

type EdgeRig = {
  from: string;
  to: string;
  kind: "static" | "observed";
  hasReverse: boolean;
  isAsync: boolean;
  tubeRadius: number;
  line?: THREE.Line | undefined;
  tubeMesh?: THREE.Mesh | undefined;
  arrowMesh?: THREE.Mesh | undefined;
  startPort?: THREE.Mesh | undefined;
  endPort?: THREE.Mesh | undefined;
  breakRing?: THREE.Mesh | undefined;
  badgeSprite?: THREE.Sprite | undefined;
  curve?: THREE.QuadraticBezierCurve3 | undefined;
  isSevered?: boolean | undefined;
};

export function compute3DEdgeAnchors(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  allNodes: ReadonlyArray<{ id: string; wx: number; wz: number }>,
  fromId: string,
  toId: string,
  hasReverseEdge: boolean,
) {
  const dx = bx - ax;
  const dz = bz - az;
  const centerDist = Math.hypot(dx, dz);
  const nx = centerDist > 0.001 ? dx / centerDist : 1;
  const nz = centerDist > 0.001 ? dz / centerDist : 0;
  // Anchor port sockets flush against the outer Service Boundary Plinth rim (1.22x0.90)
  const rimOffset = Math.min(0.60, Math.max(0.18, centerDist * 0.24));
  const sx = ax + nx * rimOffset;
  const sz = az + nz * rimOffset;
  const ex = bx - nx * rimOffset;
  const ez = bz - nz * rimOffset;
  const spanDist = Math.max(0.1, centerDist - rimOffset * 2);

  // Deflect curves cleanly away from intermediate blocks or bidirectional partner edges
  const px = -nz;
  const pz = nx;
  let lateralBow = hasReverseEdge ? 0.36 : 0;
  let extraLift = 0;
  for (const other of allNodes) {
    if (other.id === fromId || other.id === toId) continue;
    const ox = other.wx * WORLD_SCALE;
    const oz = other.wz * WORLD_SCALE;
    const t = ((ox - sx) * nx + (oz - sz) * nz) / Math.max(0.1, spanDist);
    if (t <= 0.12 || t >= 0.88) continue;
    const projX = sx + nx * (t * spanDist);
    const projZ = sz + nz * (t * spanDist);
    const signedPerp = (ox - projX) * px + (oz - projZ) * pz;
    const perpDist = Math.abs(signedPerp);
    if (perpDist < 0.92) {
      const pushDir = signedPerp >= 0 ? -1 : 1;
      const strength = (0.92 - perpDist) * 1.15;
      if (Math.abs(strength) > Math.abs(lateralBow)) {
        lateralBow = pushDir * Math.max(0.58, strength);
      }
      extraLift = Math.max(extraLift, 0.34);
    }
  }

  const lift = Math.min(1.65, Math.max(0.54, spanDist * 0.24)) + extraLift;
  const midX = (sx + ex) / 2 + px * lateralBow;
  const midZ = (sz + ez) / 2 + pz * lateralBow;
  return { sx, sz, ex, ez, midX, midZ, lift, nx, nz };
}

type StageDrag =
  | { mode: "ORBIT"; x: number; y: number; moved: boolean; pointerId: number; lastSyncAt: number }
  | { mode: "PAN"; x: number; y: number; moved: boolean; pointerId: number }
  | {
      mode: "NODE";
      serviceId: string;
      x: number;
      y: number;
      grabOffsetX: number;
      grabOffsetZ: number;
      startWx: number;
      startWz: number;
      currentWx: number;
      currentWz: number;
      moved: boolean;
      pointerId: number;
    };

type AnimatedNodeRig = {
  id: string;
  group: THREE.Group;
  baseY: number;
  phase: number;
  active: boolean;
  halo?: THREE.Mesh | undefined;
  replicaPods: THREE.Object3D[];
  rotors: Array<{ obj: THREE.Object3D; axis: "x" | "y" | "z"; speed: number }>;
  hoverCores: Array<{ obj: THREE.Object3D; baseY: number; amp: number; speed: number }>;
  pulseMaterials: Array<{
    mat: THREE.MeshStandardMaterial;
    baseIntensity: number;
    amp: number;
    speed: number;
  }>;
  streamCapsules: Array<{
    obj: THREE.Object3D;
    minX: number;
    maxX: number;
    speed: number;
    phase: number;
  }>;
  smokeParticles: Array<{
    mesh: THREE.Mesh;
    baseX: number;
    baseZ: number;
    baseY: number;
    maxRise: number;
    speed: number;
    phase: number;
  }>;
  stasisRing?: THREE.Object3D | undefined;
  labelSprite: THREE.Sprite;
  labelBaseY: number;
  labelBaseW: number;
  labelBaseH: number;
};

export type VisualArchetype = "GATEWAY" | "DATABASE" | "QUEUE" | "WORKER" | "SERVICE";

export function resolveVisualArchetype(
  node: Pick<StudioThreeNode, "id" | "archetype">,
): VisualArchetype {
  if (node.archetype === "GATEWAY") return "GATEWAY";
  if (node.archetype === "DATABASE") return "DATABASE";
  if (node.archetype === "QUEUE") return "QUEUE";
  if (/(worker|consumer|processor|dispatcher|scheduler|notifier|cron|job)/i.test(node.id)) {
    return "WORKER";
  }
  return "SERVICE";
}

type SharedStageTextures = {
  contactShadow: THREE.CanvasTexture;
  softGlow: THREE.CanvasTexture;
};

function createContactShadowTexture(T: ThreeModule): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const grad = ctx.createRadialGradient(64, 64, 14, 64, 64, 62);
    grad.addColorStop(0, "rgba(15, 23, 42, 0.42)");
    grad.addColorStop(0.55, "rgba(15, 23, 42, 0.18)");
    grad.addColorStop(1, "rgba(15, 23, 42, 0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
  }
  const tex = new T.CanvasTexture(canvas);
  tex.colorSpace = T.SRGBColorSpace;
  tex.userData = { __shared: true };
  return tex;
}

function createSoftGlowTexture(T: ThreeModule): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
    grad.addColorStop(0, "rgba(255, 255, 255, 0.98)");
    grad.addColorStop(0.28, "rgba(255, 255, 255, 0.55)");
    grad.addColorStop(0.62, "rgba(255, 255, 255, 0.16)");
    grad.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
  }
  const tex = new T.CanvasTexture(canvas);
  tex.colorSpace = T.SRGBColorSpace;
  tex.userData = { __shared: true };
  return tex;
}

function buildTurbineRotor(
  T: ThreeModule,
  radius: number,
  bladeMat: THREE.Material,
  hubMat: THREE.Material,
  serviceId: string,
): THREE.Group {
  const rotor = new T.Group();
  rotor.userData = { serviceId };
  const hub = new T.Mesh(new T.CylinderGeometry(radius * 0.28, radius * 0.32, 0.032, 16), hubMat);
  hub.userData = { serviceId };
  rotor.add(hub);
  const bladeCount = 6;
  const bladeLen = radius * 0.72;
  const bladeGeo = new T.BoxGeometry(bladeLen, 0.012, radius * 0.24);
  for (let i = 0; i < bladeCount; i++) {
    const angle = (i / bladeCount) * Math.PI * 2;
    const holder = new T.Group();
    holder.rotation.y = angle;
    const blade = new T.Mesh(bladeGeo, bladeMat);
    blade.position.set(radius * 0.48, 0, 0);
    blade.rotation.x = 0.36;
    blade.userData = { serviceId };
    holder.add(blade);
    rotor.add(holder);
  }
  return rotor;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function createNodeLabelSprite(
  T: ThreeModule,
  node: StudioThreeNode,
  styleId: StudioStyleId,
): THREE.Sprite {
  const canvas = document.createElement("canvas");
  const dpr = 2;
  const text = node.label.length > 22 ? `${node.label.slice(0, 20)}…` : node.label;
  const badge = node.isStopped
    ? "0"
    : node.isPaused
      ? "PAUSED"
      : node.cpuThrottlePct
        ? `×${node.replicas}·${node.cpuThrottlePct}%`
        : `×${node.replicas}`;
  const isMono = styleId === "blueprint";
  const font = `700 ${13 * dpr}px ${isMono ? "ui-monospace, SFMono-Regular, Menlo, monospace" : "Inter, system-ui, sans-serif"}`;
  const badgeFont = `700 ${11 * dpr}px ui-monospace, SFMono-Regular, Menlo, monospace`;

  const measureCtx = canvas.getContext("2d");
  if (!measureCtx) {
    return new T.Sprite();
  }
  measureCtx.font = font;
  const textW = Math.ceil(measureCtx.measureText(text).width);
  measureCtx.font = badgeFont;
  const badgeW = Math.max(26 * dpr, Math.ceil(measureCtx.measureText(badge).width) + 12 * dpr);

  const padX = 10 * dpr;
  const role = resolveVisualArchetype(node);
  const roleLabel = role === "DATABASE" ? "DB" : role;
  const chipW = Math.ceil(measureCtx.measureText(roleLabel).width) + 12 * dpr;
  const chipH = 18 * dpr;
  const gap = 8 * dpr;
  const pillW = padX + chipW + gap + textW + gap + badgeW + padX;
  const pillH = 30 * dpr;
  const shadowPad = 8 * dpr;

  canvas.width = pillW + shadowPad * 2;
  canvas.height = pillH + shadowPad * 2;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const rx = styleId === "blueprint" ? 6 * dpr : pillH / 2;
  const x = shadowPad;
  const y = shadowPad;

  // Hard shadow for Tactile Pop, soft shadow otherwise
  if (styleId === "pop") {
    drawRoundedRect(ctx, x + 3 * dpr, y + 3 * dpr, pillW, pillH, rx);
    ctx.fillStyle = node.isCritical ? "#e11d48" : "#0f172a";
    ctx.fill();
  } else {
    ctx.save();
    ctx.shadowColor = styleId === "control" ? "rgba(0,0,0,0.55)" : "rgba(15,23,42,0.16)";
    ctx.shadowBlur = 10 * dpr;
    ctx.shadowOffsetY = 3 * dpr;
    drawRoundedRect(ctx, x, y, pillW, pillH, rx);
    ctx.fillStyle = node.palette.pillBg;
    ctx.fill();
    ctx.restore();
  }

  drawRoundedRect(ctx, x, y, pillW, pillH, rx);
  ctx.fillStyle = node.palette.pillBg;
  ctx.fill();
  ctx.lineWidth = (styleId === "pop" || node.isSelected || node.isCritical ? 2.2 : 1.4) * dpr;
  ctx.strokeStyle = node.palette.pillStroke;
  ctx.stroke();

  const chipX = x + padX;
  const chipY = y + (pillH - chipH) / 2;
  drawRoundedRect(ctx, chipX, chipY, chipW, chipH, 4 * dpr);
  ctx.fillStyle = node.palette.pillChipBg;
  ctx.fill();
  ctx.font = badgeFont;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = node.palette.pillTextFill;
  ctx.fillText(roleLabel, chipX + chipW / 2, y + pillH / 2);

  // Label text
  ctx.font = font;
  ctx.fillStyle = node.palette.pillTextFill;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText(text, chipX + chipW + gap, y + pillH / 2 + 0.5 * dpr);

  // Right replica count chip
  const countX = x + pillW - padX - badgeW;
  const countH = 18 * dpr;
  const countY = y + (pillH - countH) / 2;
  drawRoundedRect(ctx, countX, countY, badgeW, countH, styleId === "blueprint" ? 3 * dpr : countH / 2);
  ctx.fillStyle = node.palette.pillChipBg;
  ctx.fill();
  ctx.font = badgeFont;
  ctx.fillStyle = node.palette.pillCountFill;
  ctx.textAlign = "center";
  ctx.fillText(badge, countX + badgeW / 2, y + pillH / 2 + 0.5 * dpr);

  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.minFilter = T.LinearFilter;
  texture.magFilter = T.LinearFilter;
  const material = new T.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const sprite = new T.Sprite(material);
  const aspect = canvas.width / canvas.height;
  const spriteH = 0.44;
  sprite.scale.set(spriteH * aspect, spriteH, 1);
  sprite.renderOrder = 20;
  return sprite;
}

function createEdgeBadgeSprite(
  T: ThreeModule,
  label: string,
  edge: StudioThreeEdge,
  isLight: boolean,
): THREE.Sprite {
  const canvas = document.createElement("canvas");
  const dpr = 2;
  const font = `700 ${11 * dpr}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  const mctx = canvas.getContext("2d");
  if (!mctx) return new T.Sprite();
  mctx.font = font;
  const textW = Math.ceil(mctx.measureText(label).width);
  const pillW = Math.max(46 * dpr, textW + 18 * dpr);
  const pillH = 22 * dpr;
  const pad = 4 * dpr;

  canvas.width = pillW + pad * 2;
  canvas.height = pillH + pad * 2;
  const ctx = canvas.getContext("2d")!;
  drawRoundedRect(ctx, pad, pad, pillW, pillH, pillH / 2);
  ctx.fillStyle = isLight
    ? edge.isSevered
      ? "#fff1f2"
      : edge.isDegraded
        ? "#fffbeb"
        : "#ffffff"
    : "#090d16";
  ctx.fill();
  ctx.lineWidth = 1.6 * dpr;
  ctx.strokeStyle = edge.color;
  ctx.stroke();

  ctx.font = font;
  ctx.fillStyle = isLight
    ? edge.isSevered
      ? "#be123c"
      : edge.isDegraded
        ? "#b45309"
        : "#0f172a"
    : edge.isSevered
      ? "#fda4af"
      : edge.isDegraded
        ? "#fde68a"
        : "#e2e8f0";
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillText(label, canvas.width / 2, canvas.height / 2 + 0.5 * dpr);

  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.minFilter = T.LinearFilter;
  const material = new T.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const sprite = new T.Sprite(material);
  const h = 0.30;
  sprite.scale.set(h * (canvas.width / canvas.height), h, 1);
  sprite.renderOrder = 18;
  return sprite;
}

/**
 * Creates a chamfered/beveled industrial CAD prism whose exact bounding box spans
 * X: [-w/2, +w/2], Y: [0, h], Z: [-d/2, +d/2].
 */
function createRoundedSlabGeo(
  T: ThreeModule,
  w: number,
  h: number,
  d: number,
  cornerRadius = 0.08,
  bevel = 0.014,
): THREE.BufferGeometry {
  const b = Math.min(bevel, w * 0.12, d * 0.12, h * 0.25);
  const iw = Math.max(0.02, w - b * 2);
  const id = Math.max(0.02, d - b * 2);
  const r = Math.min(cornerRadius, iw * 0.45, id * 0.45);
  const hw = iw / 2;
  const hd = id / 2;

  const shape = new T.Shape();
  shape.moveTo(-hw + r, -hd);
  shape.lineTo(hw - r, -hd);
  shape.quadraticCurveTo(hw, -hd, hw, -hd + r);
  shape.lineTo(hw, hd - r);
  shape.quadraticCurveTo(hw, hd, hw - r, hd);
  shape.lineTo(-hw + r, hd);
  shape.quadraticCurveTo(-hw, hd, -hw, hd - r);
  shape.lineTo(-hw, -hd + r);
  shape.quadraticCurveTo(-hw, -hd, -hw + r, -hd);

  const geo = new T.ExtrudeGeometry(shape, {
    depth: Math.max(0.01, h - b * 2),
    bevelEnabled: true,
    bevelSegments: 1,
    steps: 1,
    bevelSize: b,
    bevelThickness: b,
  });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, b, 0);
  geo.computeVertexNormals();
  return geo;
}

/**
 * High-DPI engineering top nameplate texture rendered flush onto container/gateway top faces.
 * Shows Studio role labels («gateway», «service», «database», «broker»), crisp technical
 * schematic glyph, and real Docker RAM/lifecycle readout — zero decorative polygons.
 */
function createTopPlateTexture(
  T: ThreeModule,
  node: StudioThreeNode,
  styleId: StudioStyleId,
  maxAnisotropy = 4,
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 176;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new T.CanvasTexture(canvas);

  const isDark = styleId === "control";
  const isPop = styleId === "pop";
  const strokeCol = node.isCritical
    ? "#e11d48"
    : node.isWarning
      ? "#d97706"
      : node.palette.stroke;
  const accentCol = node.isCritical
    ? "#f43f5e"
    : node.isWarning
      ? "#f59e0b"
      : node.palette.accent;
  const textCol = isDark ? "#e2e8f0" : "#0f172a";
  const mutedCol = isDark ? "#94a3b8" : "#64748b";

  // Subtle recessed engineering faceplate
  ctx.fillStyle = isDark ? "#0f172a" : isPop ? "#fffdf8" : "#f8fafc";
  drawRoundedRect(ctx, 4, 4, 248, 168, 14);
  ctx.fill();
  ctx.strokeStyle = strokeCol;
  ctx.lineWidth = isPop ? 3.5 : 2;
  ctx.stroke();

  // Corner CAD registration ticks
  ctx.strokeStyle = isDark ? "rgba(148,163,184,0.35)" : "rgba(100,116,139,0.28)";
  ctx.lineWidth = 1.5;
  for (const [cx, cy, dx, dy] of [
    [16, 16, 10, 10],
    [240, 16, -10, 10],
    [16, 160, 10, -10],
    [240, 160, -10, -10],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(cx, cy + dy);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx + dx, cy);
    ctx.stroke();
  }

  // Top-left Studio role label («gateway» / «service» / «worker» / «database» / «broker»)
  const visualArchetype = resolveVisualArchetype(node);
  const stereotype =
    node.stereotype ??
    (visualArchetype === "GATEWAY"
      ? "«gateway»"
      : visualArchetype === "DATABASE"
        ? "«database»"
        : visualArchetype === "QUEUE"
          ? "«broker»"
          : visualArchetype === "WORKER"
            ? "«worker»"
            : "«service»");
  ctx.font = "700 18px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillStyle = accentCol;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(stereotype, 22, 32);

  // Top-right runtime status badge
  const statusTag = node.isStopped
    ? "STOPPED"
    : node.isPaused
      ? "PAUSED"
      : node.cpuThrottlePct
        ? `CPU ${node.cpuThrottlePct}%`
        : "LIVE";
  const statusBg = node.isStopped
    ? isDark
      ? "rgba(244,63,94,0.22)"
      : "#ffe4e6"
    : node.isPaused || node.cpuThrottlePct
      ? isDark
        ? "rgba(245,158,11,0.22)"
        : "#fef3c7"
      : isDark
        ? "rgba(16,185,129,0.22)"
        : "#d1fae5";
  const statusFg = node.isStopped
    ? isDark
      ? "#fda4af"
      : "#be123c"
    : node.isPaused || node.cpuThrottlePct
      ? isDark
        ? "#fcd34d"
        : "#b45309"
      : isDark
        ? "#6ee7b7"
        : "#047857";
  ctx.font = "700 14px ui-monospace, SFMono-Regular, Menlo, monospace";
  const tagW = Math.max(54, Math.ceil(ctx.measureText(statusTag).width) + 16);
  drawRoundedRect(ctx, 234 - tagW, 19, tagW, 26, 8);
  ctx.fillStyle = statusBg;
  ctx.fill();
  ctx.fillStyle = statusFg;
  ctx.textAlign = "center";
  ctx.fillText(statusTag, 234 - tagW / 2, 32.5);

  // Clean horizontal divider
  ctx.strokeStyle = isDark ? "rgba(148,163,184,0.2)" : "rgba(148,163,184,0.35)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(20, 54);
  ctx.lineTo(236, 54);
  ctx.stroke();

  // Center authoritative SE schematic symbol (CNCF / UML / C4 / EIP)
  ctx.save();
  ctx.strokeStyle = accentCol;
  ctx.fillStyle = accentCol;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const gx = 128;
  const gy = 92;
  if (node.archetype === "GATEWAY") {
    // Ingress router fan-out schematic (1 inbound -> 3 routed lanes)
    ctx.beginPath();
    ctx.moveTo(gx - 56, gy);
    ctx.lineTo(gx - 18, gy);
    ctx.moveTo(gx - 18, gy);
    ctx.lineTo(gx + 34, gy - 20);
    ctx.moveTo(gx - 18, gy);
    ctx.lineTo(gx + 46, gy);
    ctx.moveTo(gx - 18, gy);
    ctx.lineTo(gx + 34, gy + 20);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(gx - 18, gy, 7, 0, Math.PI * 2);
    ctx.fill();
    for (const [ax, ay] of [
      [gx + 34, gy - 20],
      [gx + 46, gy],
      [gx + 34, gy + 20],
    ] as const) {
      ctx.beginPath();
      ctx.arc(ax, ay, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (node.archetype === "DATABASE") {
    // Canonical C4/UML cylinder schematic
    ctx.beginPath();
    ctx.ellipse(gx, gy - 16, 30, 9, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(gx - 30, gy - 16);
    ctx.lineTo(gx - 30, gy + 16);
    ctx.ellipse(gx, gy + 16, 30, 9, 0, Math.PI, 0, true);
    ctx.lineTo(gx + 30, gy - 16);
    ctx.stroke();
  } else if (node.archetype === "QUEUE") {
    // Canonical EIP message channel pipe with buffered slots
    drawRoundedRect(ctx, gx - 48, gy - 15, 96, 30, 15);
    ctx.stroke();
    for (let i = -1; i <= 1; i++) {
      drawRoundedRect(ctx, gx + i * 24 - 7, gy - 7, 14, 14, 3);
      ctx.fill();
    }
  } else {
    // UML 2.5 Deployment Component / Container Node schematic (isometric container icon + ports)
    drawRoundedRect(ctx, gx - 38, gy - 20, 76, 40, 8);
    ctx.stroke();
    // UML component twin port tabs on left edge
    ctx.fillStyle = isDark ? "#0f172a" : "#ffffff";
    ctx.fillRect(gx - 47, gy - 13, 16, 9);
    ctx.strokeRect(gx - 47, gy - 13, 16, 9);
    ctx.fillRect(gx - 47, gy + 4, 16, 9);
    ctx.strokeRect(gx - 47, gy + 4, 16, 9);
    // Internal pod count indicator bars
    ctx.fillStyle = accentCol;
    const pods = Math.max(1, Math.min(3, node.replicas || 1));
    const slotW = 14;
    const totalW = pods * slotW + (pods - 1) * 7;
    const startX = gx - totalW / 2 + 4;
    for (let i = 0; i < pods; i++) {
      drawRoundedRect(ctx, startX + i * (slotW + 7), gy - 9, slotW, 18, 3);
      ctx.fill();
    }
  }
  ctx.restore();

  // Bottom live telemetry strip (RAM % bar + Replica count)
  const ramPct = node.ramPct ?? null;
  ctx.font = "700 14px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillStyle = mutedCol;
  ctx.textAlign = "left";
  ctx.fillText("RAM", 22, 144);
  const barX = 62;
  const barW = 112;
  const barY = 138;
  const barH = 11;
  drawRoundedRect(ctx, barX, barY, barW, barH, 5.5);
  ctx.fillStyle = isDark ? "#1e293b" : "#e2e8f0";
  ctx.fill();
  if (ramPct !== null && ramPct > 0) {
    const fillW = Math.max(10, Math.round((barW * Math.min(100, ramPct)) / 100));
    drawRoundedRect(ctx, barX, barY, fillW, barH, 5.5);
    ctx.fillStyle = ramPct >= 85 ? "#f43f5e" : ramPct >= 70 ? "#f59e0b" : "#10b981";
    ctx.fill();
  }
  ctx.fillStyle = textCol;
  ctx.textAlign = "right";
  ctx.fillText(ramPct !== null ? `${ramPct}%` : `×${node.replicas}`, 234, 144);

  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.minFilter = T.LinearMipmapLinearFilter;
  texture.magFilter = T.LinearFilter;
  texture.anisotropy = maxAnisotropy;
  return texture;
}

type ZoneRig = {
  key: string;
  memberIds: string[];
  group: THREE.Group;
  fillMesh: THREE.Mesh;
  borderLine: THREE.Line;
  badgeMesh: THREE.Mesh;
  badgeNaturalW: number;
  width: number;
  depth: number;
};

type DeckRig = {
  mesh: THREE.Object3D;
  baseW: number;
  baseD: number;
  deckH: number;
  gridLine: THREE.LineSegments | null;
};

function buildZoneGeometries(T: ThreeModule, width: number, depth: number) {
  const hw = width / 2;
  const hd = depth / 2;
  const r = Math.min(0.24, hw * 0.25, hd * 0.25);
  const shape = new T.Shape();
  shape.moveTo(-hw + r, -hd);
  shape.lineTo(hw - r, -hd);
  shape.quadraticCurveTo(hw, -hd, hw, -hd + r);
  shape.lineTo(hw, hd - r);
  shape.quadraticCurveTo(hw, hd, hw - r, hd);
  shape.lineTo(-hw + r, hd);
  shape.quadraticCurveTo(-hw, hd, -hw, hd - r);
  shape.lineTo(-hw, -hd + r);
  shape.quadraticCurveTo(-hw, -hd, -hw + r, -hd);

  const fillGeo = new T.ShapeGeometry(shape, 8);
  fillGeo.rotateX(-Math.PI / 2);
  const pts2d = shape.getPoints(12);
  const pts3d = pts2d.map((p) => new T.Vector3(p.x, 0.012, -p.y));
  const borderGeo = new T.BufferGeometry().setFromPoints(pts3d);
  return { fillGeo, borderGeo, hd };
}

function buildDeckGridGeometry(T: ThreeModule, minX: number, maxX: number, minZ: number, maxZ: number) {
  const gridVerts: number[] = [];
  const gridStep = 1.0;
  for (let gx = Math.ceil(minX / gridStep) * gridStep; gx <= maxX; gx += gridStep) {
    gridVerts.push(gx, 0.006, minZ, gx, 0.006, maxZ);
  }
  for (let gz = Math.ceil(minZ / gridStep) * gridStep; gz <= maxZ; gz += gridStep) {
    gridVerts.push(minX, 0.006, gz, maxX, 0.006, gz);
  }
  const gridGeo = new T.BufferGeometry();
  gridGeo.setAttribute("position", new T.Float32BufferAttribute(gridVerts, 3));
  return gridGeo;
}

/**
 * Crisp 3D vector architectural trust zone (UML Deployment Environment / CodeCity District).
 * Uses uniform-dash 3D vector lines + a fixed-scale non-stretched header tab centered on the
 * outer top rim so dashes never stretch and nodes never cover the zone label.
 */
function createZonePlateGroup(
  T: ThreeModule,
  key: string,
  memberIds: string[],
  title: string,
  width: number,
  depth: number,
  accentHex: string,
  isLight: boolean,
  maxAnisotropy = 4,
): ZoneRig {
  const group = new T.Group();
  const { fillGeo, borderGeo, hd } = buildZoneGeometries(T, width, depth);

  // Subtle tinted architectural floor fill
  const fillMesh = new T.Mesh(
    fillGeo,
    new T.MeshBasicMaterial({
      color: new T.Color(accentHex),
      transparent: true,
      opacity: isLight ? 0.055 : 0.11,
      depthWrite: false,
    }),
  );
  fillMesh.position.y = 0.008;
  fillMesh.renderOrder = 1;
  group.add(fillMesh);

  // Crisp uniform-dash 3D vector perimeter (identical dash size across every zone)
  const borderLine = new T.Line(
    borderGeo,
    new T.LineDashedMaterial({
      color: new T.Color(accentHex),
      dashSize: 0.16,
      gapSize: 0.11,
      transparent: true,
      opacity: isLight ? 0.58 : 0.72,
    }),
  );
  borderLine.computeLineDistances();
  borderLine.renderOrder = 2;
  group.add(borderLine);

  // Fixed world-scale header pill centered squarely on the outer top rim (never stretched or covered)
  const canvas = document.createElement("canvas");
  const dpr = 2;
  const font = `700 ${13 * dpr}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  const mctx = canvas.getContext("2d");
  let textW = 180 * dpr;
  if (mctx) {
    mctx.font = font;
    textW = Math.ceil(mctx.measureText(title).width);
  }
  const padX = 14 * dpr;
  const pillW = textW + padX * 2;
  const pillH = 26 * dpr;
  const margin = 4 * dpr;
  canvas.width = pillW + margin * 2;
  canvas.height = pillH + margin * 2;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    drawRoundedRect(ctx, margin, margin, pillW, pillH, pillH / 2);
    ctx.fillStyle = isLight ? "rgba(255,255,255,0.96)" : "rgba(10,15,24,0.94)";
    ctx.fill();
    ctx.lineWidth = 1.6 * dpr;
    ctx.strokeStyle = isLight ? `${accentHex}75` : `${accentHex}99`;
    ctx.stroke();
    ctx.font = font;
    ctx.fillStyle = accentHex;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(title, canvas.width / 2, canvas.height / 2 + 0.5 * dpr);
  }
  const tex = new T.CanvasTexture(canvas);
  tex.colorSpace = T.SRGBColorSpace;
  tex.minFilter = T.LinearMipmapLinearFilter;
  tex.magFilter = T.LinearFilter;
  tex.anisotropy = maxAnisotropy;
  const badgeH = 0.28;
  const badgeNaturalW = badgeH * (canvas.width / canvas.height);
  const badgeW = Math.min(width - 0.2, badgeNaturalW);
  const badgeMesh = new T.Mesh(
    new T.PlaneGeometry(1, badgeH),
    new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
  );
  badgeMesh.scale.set(badgeW, 1, 1);
  badgeMesh.rotation.x = -Math.PI / 2;
  badgeMesh.position.set(0, 0.016, -hd);
  badgeMesh.renderOrder = 3;
  group.add(badgeMesh);

  return {
    key,
    memberIds,
    group,
    fillMesh,
    borderLine,
    badgeMesh,
    badgeNaturalW,
    width,
    depth,
  };
}

function attachFrontTelemetryBar(
  T: ThreeModule,
  parent: THREE.Group,
  node: StudioThreeNode,
  panelW: number,
  panelY: number,
  frontZ: number,
  isDark: boolean,
) {
  // Sleek machined telemetry bezel slot on front wall of container/gateway
  const bezel = new T.Mesh(
    new T.BoxGeometry(panelW, 0.082, 0.016),
    new T.MeshStandardMaterial({
      color: new T.Color(isDark ? "#020617" : "#0f172a"),
      roughness: 0.35,
      metalness: 0.45,
    }),
  );
  bezel.position.set(0, panelY, frontZ);
  bezel.userData = { serviceId: node.id };
  parent.add(bezel);

  // Status LED dot on left of bezel
  const ledColor = node.isStopped
    ? "#f43f5e"
    : node.isPaused || node.isWarning
      ? "#f59e0b"
      : "#10b981";
  const led = new T.Mesh(
    new T.BoxGeometry(0.038, 0.038, 0.02),
    new T.MeshStandardMaterial({
      color: new T.Color(ledColor),
      emissive: new T.Color(ledColor),
      emissiveIntensity: isDark ? 1.2 : 0.8,
      roughness: 0.2,
    }),
  );
  led.position.set(-panelW / 2 + 0.048, panelY, frontZ + 0.004);
  led.userData = { serviceId: node.id };
  parent.add(led);

  // Data-driven RAM utilization bar inside front bezel (CodeCity / live Docker memory mapping)
  const trackW = Math.max(0.14, panelW - 0.15);
  const trackCenterX = 0.038;
  const track = new T.Mesh(
    new T.BoxGeometry(trackW, 0.028, 0.014),
    new T.MeshBasicMaterial({ color: new T.Color("#334155") }),
  );
  track.position.set(trackCenterX, panelY - 0.01, frontZ + 0.005);
  track.userData = { serviceId: node.id };
  parent.add(track);

  const ramPct = node.ramPct ?? (node.isStopped ? 0 : null);
  if (ramPct !== null && ramPct > 0) {
    const fillW = Math.max(0.03, (trackW * Math.min(100, ramPct)) / 100);
    const ramColor = ramPct >= 85 ? "#f43f5e" : ramPct >= 70 ? "#f59e0b" : "#10b981";
    const fill = new T.Mesh(
      new T.BoxGeometry(fillW, 0.03, 0.018),
      new T.MeshStandardMaterial({
        color: new T.Color(ramColor),
        emissive: new T.Color(ramColor),
        emissiveIntensity: isDark ? 0.95 : 0.6,
        roughness: 0.25,
      }),
    );
    fill.position.set(trackCenterX - trackW / 2 + fillW / 2, panelY - 0.01, frontZ + 0.008);
    fill.userData = { serviceId: node.id };
    parent.add(fill);
  }

  // Upper micro-strip for CPU load / cgroup throttle indicator
  const cpuRatio = node.cpuThrottlePct
    ? node.cpuThrottlePct / 100
    : node.cpuPct != null
      ? Math.max(0.08, Math.min(1, node.cpuPct / 100))
      : 0;
  if (!node.isStopped && cpuRatio > 0) {
    const cpuFillW = Math.max(0.03, trackW * cpuRatio);
    const cpuColor = node.cpuThrottlePct ? "#f59e0b" : "#38bdf8";
    const cpuFill = new T.Mesh(
      new T.BoxGeometry(cpuFillW, 0.014, 0.018),
      new T.MeshStandardMaterial({
        color: new T.Color(cpuColor),
        emissive: new T.Color(cpuColor),
        emissiveIntensity: 0.7,
        roughness: 0.3,
      }),
    );
    cpuFill.position.set(trackCenterX - trackW / 2 + cpuFillW / 2, panelY + 0.02, frontZ + 0.008);
    cpuFill.userData = { serviceId: node.id };
    parent.add(cpuFill);
  }
}

function addOutlinedMesh(
  T: ThreeModule,
  parent: THREE.Group,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  edgeMaterial: THREE.LineBasicMaterial,
  position: [number, number, number],
  serviceId: string,
  rotation?: [number, number, number],
) {
  const mesh = new T.Mesh(geometry, material);
  mesh.position.set(position[0], position[1], position[2]);
  if (rotation) mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData = { serviceId };
  const edges = new T.LineSegments(new T.EdgesGeometry(geometry, 32), edgeMaterial);
  edges.userData = { serviceId };
  mesh.add(edges);
  parent.add(mesh);
  return mesh;
}

/**
 * Studio-Grade Living 3D Architectural Diorama Node Builder:
 * - Sculpted PBR clearcoat ceramic, brushed anodized titanium & frosted crystal glass enclosures
 * - Distinct SE/C4/CNCF silhouettes: Octagonal Ingress Portal (GATEWAY), Glass-Atrium Compute Reactor
 *   with live 1..3x replica chambers & spinning 6-blade cooling turbine (SERVICE), Asymmetric Kinetic
 *   Flywheel Processor (WORKER), Crystalline Vault Silo (DATABASE), and Pressurized Glass Stream Hub (QUEUE)
 * - Telemetry-reactive 60fps animations: rotor speed from CPU/RPS, glowing breathing cores, sliding queue
 *   capsules, crystalline amber stasis dome on PAUSE, and rising smoke/ember motes on STOP
 */
function buildServiceRig(
  T: ThreeModule,
  node: StudioThreeNode,
  styleId: StudioStyleId,
  sharedTex: SharedStageTextures | null,
  maxAnisotropy = 4,
): AnimatedNodeRig {
  const group = new T.Group();
  const wx = node.wx * WORLD_SCALE;
  const wz = node.wz * WORLD_SCALE;
  group.position.set(wx, 0, wz);
  group.userData = { serviceId: node.id };

  const isDark = styleId === "control";
  const isPop = styleId === "pop";
  const isBlueprint = styleId === "blueprint";
  const visualArchetype = resolveVisualArchetype(node);

  const rotors: AnimatedNodeRig["rotors"] = [];
  const hoverCores: AnimatedNodeRig["hoverCores"] = [];
  const pulseMaterials: AnimatedNodeRig["pulseMaterials"] = [];
  const streamCapsules: AnimatedNodeRig["streamCapsules"] = [];
  const smokeParticles: AnimatedNodeRig["smokeParticles"] = [];
  let stasisRing: THREE.Object3D | undefined;

  // Determine luminous core accent color from live health / throttle / role palette
  const coreHex = node.isStopped
    ? "#f43f5e"
    : node.isPaused || node.cpuThrottlePct
      ? "#f59e0b"
      : node.isCritical
        ? "#f43f5e"
        : node.isWarning
          ? "#f59e0b"
          : node.palette.accent;

  const isAlive = !node.isStopped && !node.isPaused;
  const loadFactor =
    node.cpuPct != null ? Math.max(0.6, Math.min(2.4, 0.75 + node.cpuPct / 55)) : 1.0;
  const rotorSpeedScale = node.isStopped || node.isPaused ? 0 : node.cpuThrottlePct ? 0.35 : loadFactor;

  // Curated Studio PBR Materials (respond smoothly to RoomEnvironment IBL reflections)
  const metalMat = new T.MeshPhysicalMaterial({
    color: new T.Color(isDark ? "#334155" : isBlueprint ? "#bfdbfe" : isPop ? "#334155" : "#cbd5e1"),
    roughness: isDark ? 0.24 : isPop ? 0.34 : 0.22,
    metalness: isPop ? 0.38 : isBlueprint ? 0.45 : 0.78,
    clearcoat: isDark ? 0.5 : 0.35,
    clearcoatRoughness: 0.2,
  });

  const darkMetalMat = new T.MeshPhysicalMaterial({
    color: new T.Color(isDark ? "#0f172a" : isBlueprint ? "#1e3a8a" : "#1e293b"),
    roughness: 0.32,
    metalness: 0.65,
    clearcoat: 0.4,
  });

  const plinthMat = new T.MeshPhysicalMaterial({
    color: new T.Color(isDark ? "#172033" : isBlueprint ? "#e0f2fe" : isPop ? "#fffdf7" : "#f1f5f9"),
    roughness: isDark ? 0.38 : isPop ? 0.42 : 0.32,
    metalness: isDark ? 0.38 : isPop ? 0.08 : 0.16,
    clearcoat: isDark ? 0.45 : 0.55,
    clearcoatRoughness: 0.25,
  });

  const chassisMat = new T.MeshPhysicalMaterial({
    color: new T.Color(
      node.isStopped
        ? isDark
          ? "#1e293b"
          : "#cbd5e1"
        : isPop
          ? node.palette.cardFill
          : isDark
            ? "#131e36"
            : isBlueprint
              ? "#eff6ff"
              : "#ffffff",
    ),
    roughness: isPop ? 0.34 : isDark ? 0.24 : isBlueprint ? 0.42 : 0.2,
    metalness: isDark ? 0.52 : isPop ? 0.06 : isBlueprint ? 0.16 : 0.12,
    clearcoat: isBlueprint ? 0.35 : 0.78,
    clearcoatRoughness: 0.14,
    emissive: new T.Color(isDark ? node.palette.iconBg : node.isCritical ? "#4c0519" : "#000000"),
    emissiveIntensity: isDark ? 0.18 : node.isCritical ? 0.12 : 0,
    transparent: isBlueprint,
    opacity: isBlueprint ? 0.92 : 1,
  });

  const glassMat = new T.MeshPhysicalMaterial({
    color: new T.Color(isDark ? "#93c5fd" : isBlueprint ? "#bfdbfe" : isPop ? node.palette.iconBg : "#e0f2fe"),
    roughness: 0.08,
    metalness: 0.06,
    clearcoat: 1.0,
    clearcoatRoughness: 0.06,
    transparent: true,
    opacity: isDark ? 0.28 : isBlueprint ? 0.32 : isPop ? 0.34 : 0.3,
    depthWrite: false,
  });

  const coreMat = new T.MeshStandardMaterial({
    color: new T.Color(node.isStopped ? (isDark ? "#334155" : "#94a3b8") : coreHex),
    emissive: new T.Color(node.isStopped ? "#7f1d1d" : coreHex),
    emissiveIntensity: node.isStopped ? 0.18 : isDark ? 1.55 : isPop ? 0.85 : 0.95,
    roughness: 0.18,
    metalness: 0.2,
  });
  if (!node.isStopped) {
    pulseMaterials.push({
      mat: coreMat,
      baseIntensity: isDark ? 1.45 : isPop ? 0.78 : 0.9,
      amp: node.isPaused ? 0.12 : isDark ? 0.45 : 0.28,
      speed: node.cpuThrottlePct ? 5.2 : 2.4,
    });
  }

  const accentMat = new T.MeshStandardMaterial({
    color: new T.Color(coreHex),
    roughness: 0.24,
    metalness: isDark ? 0.48 : 0.24,
    emissive: new T.Color(coreHex),
    emissiveIntensity: node.isStopped ? 0.12 : isDark ? 0.85 : node.isCritical || node.isWarning ? 0.45 : 0.28,
  });

  const edgeMat = new T.LineBasicMaterial({
    color: new T.Color(isPop ? "#0f172a" : node.palette.stroke),
    transparent: !isPop,
    opacity: isPop ? 0.96 : isDark ? 0.75 : isBlueprint ? 0.88 : 0.42,
  });

  const sculptureGroup = new T.Group();
  group.add(sculptureGroup);

  // 0. Grounded Soft Contact AO Shadow + Subtle Emissive Floor Bounce-Glow Pool
  const plinthW = 1.24;
  const plinthH = 0.095;
  const plinthD = 0.92;
  if (sharedTex) {
    const aoMesh = new T.Mesh(
      new T.PlaneGeometry(plinthW + 0.56, plinthD + 0.52),
      new T.MeshBasicMaterial({
        map: sharedTex.contactShadow,
        transparent: true,
        opacity: isDark ? 0.78 : isPop ? 0.35 : 0.52,
        depthWrite: false,
      }),
    );
    aoMesh.rotation.x = -Math.PI / 2;
    aoMesh.position.y = 0.004;
    aoMesh.renderOrder = 1;
    group.add(aoMesh);

    if (!node.isStopped) {
      const floorGlow = new T.Mesh(
        new T.PlaneGeometry(plinthW + 0.72, plinthD + 0.64),
        new T.MeshBasicMaterial({
          map: sharedTex.softGlow,
          color: new T.Color(coreHex),
          transparent: true,
          opacity: isDark ? 0.34 : isPop ? 0.16 : 0.18,
          blending: isDark ? T.AdditiveBlending : T.NormalBlending,
          depthWrite: false,
        }),
      );
      floorGlow.rotation.x = -Math.PI / 2;
      floorGlow.position.y = 0.006;
      floorGlow.renderOrder = 2;
      group.add(floorGlow);
    }
  }

  // 1. Sculpted 2-Tier Architectural Foundation Pedestal + Corner Anchor Feet + Glowing Trim Rail
  addOutlinedMesh(
    T,
    sculptureGroup,
    createRoundedSlabGeo(T, plinthW, 0.052, plinthD, 0.11, 0.012),
    metalMat,
    edgeMat,
    [0, 0, 0],
    node.id,
  );
  addOutlinedMesh(
    T,
    sculptureGroup,
    createRoundedSlabGeo(T, plinthW - 0.07, 0.045, plinthD - 0.07, 0.085, 0.01),
    plinthMat,
    edgeMat,
    [0, 0.05, 0],
    node.id,
  );
  // 4 brushed metallic corner docking pads
  const footGeo = new T.CylinderGeometry(0.048, 0.056, 0.042, 10);
  for (const [fx, fz] of [
    [-plinthW / 2 + 0.1, -plinthD / 2 + 0.1],
    [plinthW / 2 - 0.1, -plinthD / 2 + 0.1],
    [-plinthW / 2 + 0.1, plinthD / 2 - 0.1],
    [plinthW / 2 - 0.1, plinthD / 2 - 0.1],
  ] as const) {
    const foot = new T.Mesh(footGeo, darkMetalMat);
    foot.position.set(fx, 0.024, fz);
    foot.userData = { serviceId: node.id };
    sculptureGroup.add(foot);
  }
  // Luminous fiber-optic status strip wrapped around the front plinth rim
  const rail = new T.Mesh(new T.BoxGeometry(plinthW - 0.24, 0.024, 0.026), accentMat);
  rail.position.set(0, 0.052, plinthD / 2 + 0.002);
  rail.userData = { serviceId: node.id };
  sculptureGroup.add(rail);

  let topY = 0.72;
  const topTex = createTopPlateTexture(T, node, styleId, maxAnisotropy);
  const topPlateMat = new T.MeshBasicMaterial({
    map: topTex,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });

  if (visualArchetype === "GATEWAY") {
    // Open frame signals ingress without claiming an actual port or traffic direction.
    const uprightH = 0.44;
    for (const side of [-1, 1]) {
      addOutlinedMesh(
        T, sculptureGroup, createRoundedSlabGeo(T, 0.14, uprightH, 0.34),
        metalMat, edgeMat, [side * 0.35, plinthH, -0.04], node.id,
      );
    }
    addOutlinedMesh(
      T, sculptureGroup, createRoundedSlabGeo(T, 0.84, 0.095, 0.34),
      chassisMat, edgeMat, [0, plinthH + uprightH, -0.04], node.id,
    );
    const routingMark = new T.Mesh(new T.BoxGeometry(0.44, 0.018, 0.025), accentMat);
    routingMark.position.set(0, plinthH + uprightH + 0.047, 0.135);
    routingMark.userData = { serviceId: node.id };
    sculptureGroup.add(routingMark);

    const lectern = new T.Group();
    lectern.position.set(0, plinthH + 0.145, 0.44);
    lectern.rotation.x = -Math.PI / 3.8;
    const lecternBack = new T.Mesh(new T.BoxGeometry(0.36, 0.23, 0.016), darkMetalMat);
    lecternBack.userData = { serviceId: node.id };
    lectern.add(lecternBack);
    const gwPlate = new T.Mesh(new T.PlaneGeometry(0.34, 0.21), topPlateMat);
    gwPlate.position.z = 0.01;
    gwPlate.userData = { serviceId: node.id };
    lectern.add(gwPlate);
    sculptureGroup.add(lectern);

    if (!node.isStopped) {
      attachFrontTelemetryBar(T, sculptureGroup, node, 0.74, plinthH * 0.56, plinthD / 2 + 0.012, isDark);
    }
    topY = plinthH + uprightH + 0.095;
  } else if (visualArchetype === "DATABASE") {
    // ── SCULPTED CRYSTALLINE DATA VAULT SILO ─────────────────────────────────────────
    const siloH = node.isStopped ? 0.22 : 0.56;
    const siloCenterY = plinthH + siloH / 2 + 0.02;

    // Continuous glowing crystalline vertical data-core inside glass sleeve
    const dataCore = new T.Mesh(
      new T.CylinderGeometry(0.2, 0.2, Math.max(0.14, siloH - 0.06), 24),
      metalMat,
    );
    dataCore.position.set(0, siloCenterY, 0);
    dataCore.userData = { serviceId: node.id };
    sculptureGroup.add(dataCore);

    // Frosted crystal glass cylindrical containment sleeve
    const glassSleeve = new T.Mesh(
      new T.CylinderGeometry(0.35, 0.35, siloH, 28),
      glassMat,
    );
    glassSleeve.position.set(0, siloCenterY, 0);
    glassSleeve.userData = { serviceId: node.id };
    sculptureGroup.add(glassSleeve);

    // 3 sculpted beveled metallic vault rings wrapping the glass silo
    const ringCount = node.isStopped ? 1 : 3;
    for (let i = 0; i < ringCount; i++) {
      const ry = plinthH + 0.07 + i * ((siloH - 0.08) / Math.max(1, ringCount - 1));
      const disc = addOutlinedMesh(
        T,
        sculptureGroup,
        new T.CylinderGeometry(0.41, 0.41, 0.055, 24),
        i === ringCount - 1 ? chassisMat : metalMat,
        edgeMat,
        [0, ry, 0],
        node.id,
      );
      disc.castShadow = true;
    }

    // 4 vertical brushed-titanium clamping ribs
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const rib = new T.Mesh(new T.BoxGeometry(0.045, siloH + 0.02, 0.055), darkMetalMat);
      rib.position.set(Math.cos(a) * 0.39, siloCenterY, Math.sin(a) * 0.39);
      rib.rotation.y = -a;
      rib.castShadow = true;
      rib.userData = { serviceId: node.id };
      sculptureGroup.add(rib);
    }

    // Orbiting horizontal data-sync halo ring
    if (!node.isStopped) {
      const syncRing = new T.Mesh(new T.TorusGeometry(0.45, 0.013, 10, 40), accentMat);
      syncRing.rotation.x = Math.PI / 2;
      syncRing.position.set(0, siloCenterY, 0);
      syncRing.userData = { serviceId: node.id };
      sculptureGroup.add(syncRing);
      if (isAlive) {
        hoverCores.push({ obj: syncRing, baseY: siloCenterY, amp: 0.12, speed: 1.6 });
      }
    }

    const stackTop = plinthH + siloH + 0.06;
    const topDisk = new T.Mesh(new T.CircleGeometry(0.36, 28), topPlateMat);
    topDisk.rotation.x = -Math.PI / 2;
    topDisk.position.set(0, stackTop + 0.004, 0);
    topDisk.userData = { serviceId: node.id };
    sculptureGroup.add(topDisk);

    if (!node.isStopped) {
      attachFrontTelemetryBar(T, sculptureGroup, node, 0.72, plinthH * 0.62, plinthD / 2 + 0.012, isDark);
    }
    topY = stackTop + 0.08;
  } else if (visualArchetype === "QUEUE") {
    // ── SCULPTED PRESSURIZED GLASS STREAM CONDUIT HUB ────────────────────────────────
    for (const cx of [-0.34, 0.34]) {
      addOutlinedMesh(
        T,
        sculptureGroup,
        createRoundedSlabGeo(T, 0.16, 0.22, 0.56, 0.04, 0.01),
        metalMat,
        edgeMat,
        [cx, plinthH, 0],
        node.id,
      );
    }
    const pipeY = plinthH + 0.34;
    // Transparent pressurized glass horizontal tube
    const glassPipe = new T.Mesh(
      new T.CylinderGeometry(0.22, 0.22, 0.96, 28),
      glassMat,
    );
    glassPipe.rotation.z = Math.PI / 2;
    glassPipe.position.set(0, pipeY, 0);
    glassPipe.userData = { serviceId: node.id };
    sculptureGroup.add(glassPipe);

    // Inner glowing energy guide rail + 3 animated sliding message capsules
    const guideRail = new T.Mesh(
      new T.CylinderGeometry(0.032, 0.032, 0.9, 12),
      accentMat,
    );
    guideRail.rotation.z = Math.PI / 2;
    guideRail.position.set(0, pipeY, 0);
    guideRail.userData = { serviceId: node.id };
    sculptureGroup.add(guideRail);

    const capsuleGeo = new T.CapsuleGeometry(0.068, 0.08, 8, 12);
    for (let i = 0; i < 3; i++) {
      const cap = new T.Mesh(capsuleGeo, coreMat);
      cap.rotation.z = Math.PI / 2;
      cap.position.set(-0.34 + i * 0.34, pipeY, 0);
      cap.userData = { serviceId: node.id };
      sculptureGroup.add(cap);
      if (isAlive) {
        streamCapsules.push({
          obj: cap,
          minX: -0.36,
          maxX: 0.36,
          speed: 0.42 * rotorSpeedScale,
          phase: i / 3,
        });
      }
    }

    // 3 brushed-metal flanged pressure collars
    for (const rx of [-0.43, 0, 0.43]) {
      const flange = new T.Mesh(new T.TorusGeometry(0.235, 0.028, 12, 28), metalMat);
      flange.rotation.y = Math.PI / 2;
      flange.position.set(rx, pipeY, 0);
      flange.castShadow = true;
      flange.userData = { serviceId: node.id };
      sculptureGroup.add(flange);

      const glowRing = new T.Mesh(new T.TorusGeometry(0.245, 0.01, 8, 28), accentMat);
      glowRing.rotation.y = Math.PI / 2;
      glowRing.position.set(rx, pipeY, 0);
      glowRing.userData = { serviceId: node.id };
      sculptureGroup.add(glowRing);
    }
    if (!node.isStopped) {
      attachFrontTelemetryBar(T, sculptureGroup, node, 0.72, plinthH * 0.62, plinthD / 2 + 0.012, isDark);
    }
    topY = pipeY + 0.28;
  } else if (visualArchetype === "WORKER") {
    // ── SCULPTED ASYMMETRIC ASYNC RELAY & KINETIC FLYWHEEL PROCESSOR ─────────────────
    // Left intake chamber with hovering crystalline message prism + compact status plate
    const intakeH = node.isStopped ? 0.12 : 0.22;
    addOutlinedMesh(
      T,
      sculptureGroup,
      createRoundedSlabGeo(T, 0.44, intakeH, 0.62, 0.055, 0.012),
      chassisMat,
      edgeMat,
      [-0.28, plinthH, 0],
      node.id,
    );
    const intakeCollar = new T.Mesh(new T.TorusGeometry(0.145, 0.018, 10, 24), metalMat);
    intakeCollar.rotation.x = Math.PI / 2;
    intakeCollar.position.set(-0.28, plinthH + intakeH + 0.01, -0.11);
    intakeCollar.userData = { serviceId: node.id };
    sculptureGroup.add(intakeCollar);

    const intakePrism = new T.Mesh(
      new T.OctahedronGeometry(node.isStopped ? 0.065 : 0.095, 0),
      coreMat,
    );
    const prismBaseY = plinthH + intakeH + 0.13;
    intakePrism.position.set(-0.28, node.isStopped ? plinthH + intakeH + 0.05 : prismBaseY, -0.11);
    intakePrism.userData = { serviceId: node.id };
    sculptureGroup.add(intakePrism);
    if (isAlive) {
      rotors.push({ obj: intakePrism, axis: "y", speed: -2.0 * rotorSpeedScale });
      hoverCores.push({ obj: intakePrism, baseY: prismBaseY, amp: 0.028, speed: 3.1 });
    }

    // Crisp compact «worker» nameplate on front-left terrace
    const wPlate = new T.Mesh(new T.PlaneGeometry(0.36, 0.24), topPlateMat);
    wPlate.rotation.x = -Math.PI / 2;
    wPlate.position.set(-0.28, plinthH + intakeH + 0.005, 0.15);
    wPlate.userData = { serviceId: node.id };
    sculptureGroup.add(wPlate);

    // Connecting pressurized bridge conduit from intake to kinetic flywheel drum
    const bridge = new T.Mesh(new T.CylinderGeometry(0.055, 0.055, 0.24, 14), metalMat);
    bridge.rotation.z = Math.PI / 2;
    bridge.position.set(0.0, plinthH + 0.18, 0);
    bridge.castShadow = true;
    bridge.userData = { serviceId: node.id };
    sculptureGroup.add(bridge);

    // A low rectangular processing module keeps the storage silhouette exclusive to databases.
    const processorX = 0.25;
    const processorTop = plinthH + 0.29;
    addOutlinedMesh(
      T, sculptureGroup, createRoundedSlabGeo(T, 0.57, 0.29, 0.62),
      chassisMat, edgeMat, [processorX, plinthH, 0], node.id,
    );
    // Parallel processing lanes distinguish the worker from a service cooling fan.
    for (const offset of [-0.12, 0, 0.12]) {
      addOutlinedMesh(
        T, sculptureGroup, createRoundedSlabGeo(T, 0.055, 0.055, 0.40, 0.018),
        metalMat, edgeMat, [processorX + offset, processorTop, 0], node.id,
      );
    }

    if (!node.isStopped) {
      attachFrontTelemetryBar(T, sculptureGroup, node, 0.84, plinthH * 0.62, plinthD / 2 + 0.012, isDark);
    }
    topY = Math.max(processorTop + 0.07, prismBaseY + 0.13);
  } else {
    // ── SCULPTED GLASS-ATRIUM COMPUTE REACTOR (1..3x LIVE PHYSICAL REPLICAS + SPINNING TURBINE) ──
    const podCount = node.isStopped ? 1 : Math.max(1, Math.min(3, node.replicas || 1));
    const lowerH = 0.085;
    const chamberH = node.isStopped ? 0.11 : 0.27;
    const topCapH = 0.075;
    const totalPodH = lowerH + chamberH + topCapH;
    const podD = 0.70;
    const spanW = 1.04;
    const gap = 0.065;
    const podW = (spanW - gap * (podCount - 1)) / podCount;

    for (let i = 0; i < podCount; i++) {
      const px = -spanW / 2 + podW / 2 + i * (podW + gap);

      // A. Chamfered lower ceramic/titanium manifold deck
      addOutlinedMesh(
        T,
        sculptureGroup,
        createRoundedSlabGeo(T, podW, lowerH, podD, 0.055, 0.012),
        chassisMat,
        edgeMat,
        [px, plinthH, 0],
        node.id,
      );

      // B. Open-frame crystal glass atrium chamber (visible glowing compute wafers inside!)
      const chamberBaseY = plinthH + lowerH;
      const chamberCenterY = chamberBaseY + chamberH / 2;
      const glassShell = new T.Mesh(
        createRoundedSlabGeo(T, Math.max(0.18, podW - 0.07), chamberH, podD - 0.08, 0.04, 0.008),
        glassMat,
      );
      glassShell.position.set(px, chamberBaseY, 0);
      glassShell.userData = { serviceId: node.id };
      sculptureGroup.add(glassShell);

      // 4 brushed aluminum corner pillars framing the glass chamber
      const pillarGeo = new T.CylinderGeometry(0.022, 0.024, chamberH + 0.01, 10);
      const colDx = Math.max(0.08, podW / 2 - 0.048);
      const colDz = podD / 2 - 0.052;
      for (const [cx, cz] of [
        [-colDx, -colDz],
        [colDx, -colDz],
        [-colDx, colDz],
        [colDx, colDz],
      ] as const) {
        const pillar = new T.Mesh(pillarGeo, metalMat);
        pillar.position.set(px + cx, chamberCenterY, cz);
        pillar.castShadow = true;
        pillar.userData = { serviceId: node.id };
        sculptureGroup.add(pillar);
      }

      // Luminous horizontally-stacked compute core wafers visible inside the crystal chamber
      const waferCount = node.isStopped ? 1 : 3;
      const waferW = Math.max(0.12, podW - 0.18);
      const waferD = podD - 0.22;
      for (let w = 0; w < waferCount; w++) {
        const wy = chamberBaseY + 0.045 + w * ((chamberH - 0.09) / Math.max(1, waferCount - 1));
        const wafer = new T.Mesh(
          createRoundedSlabGeo(T, waferW, 0.036, waferD, 0.03, 0.006),
          coreMat,
        );
        wafer.position.set(px, wy - 0.018, 0);
        wafer.userData = { serviceId: node.id };
        sculptureGroup.add(wafer);
      }

      // Sculpted side brushed-metal heatsink louver fins on outer left/right edges
      if (podCount === 1 || i === 0 || i === podCount - 1) {
        const finGeo = new T.BoxGeometry(0.045, 0.018, podD - 0.22);
        const sides = podCount === 1 ? [-1, 1] : i === 0 ? [-1] : [1];
        for (const side of sides) {
          for (let f = 0; f < 3; f++) {
            const fin = new T.Mesh(finGeo, metalMat);
            fin.position.set(
              px + side * (podW / 2 + 0.006),
              chamberBaseY + 0.055 + f * ((chamberH - 0.11) / 2),
              0,
            );
            fin.castShadow = true;
            fin.userData = { serviceId: node.id };
            sculptureGroup.add(fin);
          }
        }
      }

      // C. Upper chamfered ceramic/titanium shroud crown
      const crownBaseY = chamberBaseY + chamberH;
      addOutlinedMesh(
        T,
        sculptureGroup,
        createRoundedSlabGeo(T, podW, topCapH, podD, 0.055, 0.012),
        chassisMat,
        edgeMat,
        [px, crownBaseY, 0],
        node.id,
      );

      // D. Recessed circular brushed-metal intake shroud + REAL SPINNING 6-BLADE 3D COOLING TURBINE
      const turbineR = podCount === 1 ? 0.15 : podCount === 2 ? 0.12 : 0.09;
      const turbineX = podCount === 1 ? px - 0.24 : px;
      const turbineZ = podCount === 1 ? 0 : -0.02;
      const topSurfaceY = crownBaseY + topCapH;

      const fanWell = new T.Mesh(
        new T.CylinderGeometry(turbineR, turbineR, 0.014, 22),
        darkMetalMat,
      );
      fanWell.position.set(turbineX, topSurfaceY + 0.002, turbineZ);
      fanWell.userData = { serviceId: node.id };
      sculptureGroup.add(fanWell);

      const fanShroud = new T.Mesh(
        new T.TorusGeometry(turbineR + 0.012, 0.02, 10, 26),
        metalMat,
      );
      fanShroud.rotation.x = Math.PI / 2;
      fanShroud.position.set(turbineX, topSurfaceY + 0.012, turbineZ);
      fanShroud.userData = { serviceId: node.id };
      sculptureGroup.add(fanShroud);

      const rotor = buildTurbineRotor(T, turbineR * 0.88, accentMat, darkMetalMat, node.id);
      rotor.position.set(turbineX, topSurfaceY + 0.016, turbineZ);
      sculptureGroup.add(rotor);
      if (isAlive) {
        rotors.push({ obj: rotor, axis: "y", speed: (2.6 + i * 0.35) * rotorSpeedScale });
      }

      // E. Crisp engineering top nameplate mounted cleanly beside the turbine (1x) or on front rim (2x/3x)
      if (podCount === 1) {
        const plate = new T.Mesh(new T.PlaneGeometry(0.46, 0.44), topPlateMat);
        plate.rotation.x = -Math.PI / 2;
        plate.position.set(px + 0.22, topSurfaceY + 0.005, 0);
        plate.userData = { serviceId: node.id };
        sculptureGroup.add(plate);
      } else {
        const miniPlate = new T.Mesh(
          new T.PlaneGeometry(Math.max(0.18, podW - 0.08), 0.16),
          topPlateMat,
        );
        miniPlate.rotation.x = -Math.PI / 2;
        miniPlate.position.set(px, topSurfaceY + 0.005, podD / 2 - 0.12);
        miniPlate.userData = { serviceId: node.id };
        sculptureGroup.add(miniPlate);
      }

      // F. Front recessed RAM + CPU telemetry bezel bar on each pod
      if (!node.isStopped) {
        const gaugeHolder = new T.Group();
        gaugeHolder.position.set(px, 0, 0);
        attachFrontTelemetryBar(
          T,
          gaugeHolder,
          node,
          Math.max(0.22, podW - 0.08),
          plinthH + lowerH * 0.65,
          podD / 2 + 0.004,
          isDark,
        );
        sculptureGroup.add(gaugeHolder);
      }
    }

    topY = plinthH + totalPodH + 0.08;
  }

  // ── REACTIVE FAULT FX: Crystalline Amber Stasis Field (PAUSE) ───────────────────────
  if (node.isPaused) {
    const stasisH = Math.max(0.48, topY - plinthH + 0.08);
    const domeGeo = new T.CylinderGeometry(0.64, 0.68, stasisH, 6, 1, false);
    const domeFill = new T.Mesh(
      domeGeo,
      new T.MeshPhysicalMaterial({
        color: new T.Color("#f59e0b"),
        emissive: new T.Color("#d97706"),
        emissiveIntensity: 0.22,
        roughness: 0.12,
        clearcoat: 1.0,
        transparent: true,
        opacity: 0.14,
        depthWrite: false,
      }),
    );
    domeFill.position.set(0, plinthH + stasisH / 2, 0);
    domeFill.userData = { serviceId: node.id };
    domeFill.add(
      new T.LineSegments(
        new T.EdgesGeometry(domeGeo, 12),
        new T.LineBasicMaterial({ color: new T.Color("#f59e0b"), transparent: true, opacity: 0.78 }),
      ),
    );
    sculptureGroup.add(domeFill);

    const scanRing = new T.Mesh(
      new T.TorusGeometry(0.67, 0.014, 8, 6),
      new T.MeshBasicMaterial({ color: new T.Color("#fbbf24"), transparent: true, opacity: 0.9 }),
    );
    scanRing.rotation.x = Math.PI / 2;
    scanRing.position.set(0, plinthH + stasisH * 0.55, 0);
    scanRing.userData = { serviceId: node.id };
    sculptureGroup.add(scanRing);
    stasisRing = scanRing;
  }

  // ── REACTIVE FAULT FX: Rising Smoke / Ember Motes & Crimson Hazard Beacon (STOPPED) ──
  if (node.isStopped) {
    const hazardMat = new T.MeshStandardMaterial({
      color: new T.Color("#f43f5e"),
      emissive: new T.Color("#f43f5e"),
      emissiveIntensity: 1.4,
      roughness: 0.2,
    });
    pulseMaterials.push({ mat: hazardMat, baseIntensity: 1.0, amp: 0.85, speed: 5.5 });
    const hazardBeacon = new T.Mesh(new T.SphereGeometry(0.055, 12, 12), hazardMat);
    hazardBeacon.position.set(0, topY + 0.04, 0);
    hazardBeacon.userData = { serviceId: node.id };
    sculptureGroup.add(hazardBeacon);

    for (let s = 0; s < 5; s++) {
      const isEmber = s % 2 === 1;
      const mote = new T.Mesh(
        new T.SphereGeometry(isEmber ? 0.028 : 0.058, 10, 10),
        new T.MeshBasicMaterial({
          color: new T.Color(isEmber ? "#fb7185" : isDark ? "#64748b" : "#94a3b8"),
          transparent: true,
          opacity: isEmber ? 0.85 : 0.42,
          depthWrite: false,
        }),
      );
      const bx = Math.cos(s * 1.4) * 0.18;
      const bz = Math.sin(s * 1.4) * 0.14;
      mote.position.set(bx, topY + 0.06, bz);
      sculptureGroup.add(mote);
      smokeParticles.push({
        mesh: mote,
        baseX: bx,
        baseZ: bz,
        baseY: topY + 0.04,
        maxRise: 0.52 + (s % 3) * 0.12,
        speed: 0.36 + (s % 3) * 0.1,
        phase: s * 0.21,
      });
    }
  }

  // Rounded Chamfered Selection / Drop-Target / Fault Boundary Halo around Pedestal
  let halo: THREE.Mesh | undefined;
  if (node.isSelected || node.isDropTarget || node.isCritical || node.isWarning) {
    const haloColor = node.isCritical
      ? "#f43f5e"
      : node.isWarning
        ? "#f59e0b"
        : node.isDropTarget
          ? "#10b981"
          : styleId === "control"
            ? "#38bdf8"
            : "#0284c7";
    const outerW = plinthW + 0.18;
    const outerD = plinthD + 0.18;
    const innerW = plinthW + 0.06;
    const innerD = plinthD + 0.06;
    const makeRoundedPath = (w: number, d: number, r: number) => {
      const hw = w / 2;
      const hd = d / 2;
      const p = new T.Shape();
      p.moveTo(-hw + r, -hd);
      p.lineTo(hw - r, -hd);
      p.quadraticCurveTo(hw, -hd, hw, -hd + r);
      p.lineTo(hw, hd - r);
      p.quadraticCurveTo(hw, hd, hw - r, hd);
      p.lineTo(-hw + r, hd);
      p.quadraticCurveTo(-hw, hd, -hw, hd - r);
      p.lineTo(-hw, -hd + r);
      p.quadraticCurveTo(-hw, -hd, -hw + r, -hd);
      return p;
    };
    const outerShape = makeRoundedPath(outerW, outerD, 0.16);
    const hole = makeRoundedPath(innerW, innerD, 0.12);
    outerShape.holes.push(hole);

    const haloGeo = new T.ShapeGeometry(outerShape, 8);
    const haloMat = new T.MeshBasicMaterial({
      color: new T.Color(haloColor),
      side: T.DoubleSide,
      transparent: true,
      opacity: node.isSelected || node.isDropTarget ? 0.72 : 0.36,
    });
    halo = new T.Mesh(haloGeo, haloMat);
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.016;
    halo.userData = { serviceId: node.id };
    group.add(halo);
  }

  // Crisp 3D Floating Service Pill Sprite (positioned cleanly above tallest spire/turbine)
  const labelSprite = createNodeLabelSprite(T, node, styleId);
  const labelBaseY = topY + 0.34;
  labelSprite.position.set(0, labelBaseY, 0);
  labelSprite.userData = { serviceId: node.id };
  group.add(labelSprite);

  return {
    id: node.id,
    group,
    baseY: 0,
    phase: (node.wx * 0.013 + node.wz * 0.017) % (Math.PI * 2),
    active: isAlive,
    halo,
    replicaPods: [],
    rotors,
    hoverCores,
    pulseMaterials,
    streamCapsules,
    smokeParticles,
    stasisRing,
    labelSprite,
    labelBaseY,
    labelBaseW: labelSprite.scale.x,
    labelBaseH: labelSprite.scale.y,
  };
}

function disposeObjectTree(T: ThreeModule, obj: THREE.Object3D) {
  obj.traverse((child) => {
    const meshLike = child as THREE.Mesh;
    if (meshLike.geometry) {
      meshLike.geometry.dispose();
    }
    const mat = meshLike.material;
    const disposeMat = (m: THREE.Material) => {
      const spriteMat = m as THREE.SpriteMaterial;
      if (spriteMat.map && !spriteMat.map.userData?.["__shared"]) {
        spriteMat.map.dispose();
      }
      m.dispose();
    };
    if (Array.isArray(mat)) {
      mat.forEach(disposeMat);
    } else if (mat) {
      disposeMat(mat);
    }
  });
}

export function StudioThreeStage({
  nodes,
  edges,
  deckBounds,
  camera,
  zoom,
  pan,
  styleId,
  busy = false,
  showNodeTags = true,
  showEdgeTags = true,
  onCameraChange,
  onZoomChange,
  onPanChange,
  onMoveNode,
  onSelect,
  onSelectEdge,
  onDropTool,
  onReadyChange,
}: StudioThreeStageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tourBoxRef = useRef<HTMLDivElement>(null);
  const hoveredServiceRef = useRef<string | null>(null);
  const lastSceneSigRef = useRef("");
  const [isDragging, setIsDragging] = useState(false);
  const [dropHoverService, setDropHoverService] = useState<string | null>(null);
  const [engineReady, setEngineReady] = useState(false);
  const [webglRecoveryEpoch, setWebglRecoveryEpoch] = useState(0);
  const webglRecoveryCountRef = useRef(0);

  const threeRef = useRef<ThreeModule | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const contentGroupRef = useRef<THREE.Group | null>(null);
  const lightsRef = useRef<{
    hemi: THREE.HemisphereLight;
    key: THREE.DirectionalLight;
    rim: THREE.DirectionalLight;
  } | null>(null);
  const envTargetRef = useRef<THREE.WebGLRenderTarget | null>(null);
  const sharedTexRef = useRef<SharedStageTextures | null>(null);
  const packetsRef = useRef<AnimatedPacket[]>([]);
  const nodeRigsRef = useRef<AnimatedNodeRig[]>([]);
  const edgeRigsRef = useRef<EdgeRig[]>([]);
  const zoneRigsRef = useRef<ZoneRig[]>([]);
  const deckRigRef = useRef<DeckRig | null>(null);
  const liveNodePosRef = useRef<Map<string, { wx: number; wz: number }>>(new Map());
  const raycasterRef = useRef<THREE.Raycaster | null>(null);
  const ndcRef = useRef<THREE.Vector2 | null>(null);
  const groundPlaneRef = useRef<THREE.Plane | null>(null);
  const hitVecRef = useRef<THREE.Vector3 | null>(null);
  const lastTourRectRef = useRef({ l: -1, t: -1, w: -1, h: -1 });
  const viewportSizeRef = useRef({ w: 1, h: 1 });
  const wheelActiveUntilRef = useRef(0);
  const zoomSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showNodeTagsRef = useRef(showNodeTags);
  const showEdgeTagsRef = useRef(showEdgeTags);
  showNodeTagsRef.current = showNodeTags;
  showEdgeTagsRef.current = showEdgeTags;

  // Smooth target vs current camera state (mutated inside RAF with zero React re-renders)
  const targetCamRef = useRef({ yaw: camera.yaw, pitch: camera.pitch, zoom, panX: pan.x, panY: pan.y });
  const liveCamRef = useRef({ yaw: camera.yaw, pitch: camera.pitch, zoom, panX: pan.x, panY: pan.y });
  const dragRef = useRef<StageDrag | null>(null);
  const callbacksRef = useRef({ onCameraChange, onZoomChange, onPanChange, onMoveNode, onSelect, onSelectEdge, onDropTool });
  callbacksRef.current = { onCameraChange, onZoomChange, onPanChange, onMoveNode, onSelect, onSelectEdge, onDropTool };

  useEffect(() => {
    // Do not fight active pointer drag or wheel zoom with throttled/stale React camera props
    const isWheeling = performance.now() < wheelActiveUntilRef.current;
    if (dragRef.current && (dragRef.current.mode === "ORBIT" || dragRef.current.mode === "PAN")) {
      if (!isWheeling) targetCamRef.current.zoom = zoom;
      return;
    }
    targetCamRef.current = {
      yaw: camera.yaw,
      pitch: Math.max(THREE_PITCH_MIN, Math.min(THREE_PITCH_MAX, camera.pitch)),
      zoom: isWheeling ? targetCamRef.current.zoom : zoom,
      panX: pan.x,
      panY: pan.y,
    };
  }, [camera.yaw, camera.pitch, zoom, pan.x, pan.y]);

  // Boot Three.js WebGL renderer once (dynamic import so non-3D routes pay 0 KB)
  useEffect(() => {
    let cancelled = false;
    let contextLost = false;
    let rafId = 0;
    let resizeRafId = 0;
    let recoveryTimer: ReturnType<typeof setTimeout> | null = null;
    let resizeObserver: ResizeObserver | null = null;
    const boundCanvas = canvasRef.current;

    const handleContextLost = (event: Event) => {
      event.preventDefault();
      contextLost = true;
      setEngineReady(false);
      onReadyChange?.(false);
      // If browser does not restore WebGL automatically, re-boot once on a fresh canvas element.
      if (webglRecoveryCountRef.current < 2 && !recoveryTimer) {
        recoveryTimer = setTimeout(() => {
          recoveryTimer = null;
          if (!cancelled && contextLost && webglRecoveryCountRef.current < 2) {
            webglRecoveryCountRef.current += 1;
            setWebglRecoveryEpoch((epoch) => epoch + 1);
          }
        }, 1200);
      }
    };
    const handleContextRestored = () => {
      contextLost = false;
      if (recoveryTimer) {
        clearTimeout(recoveryTimer);
        recoveryTimer = null;
      }
      const r = rendererRef.current;
      const sc = sceneRef.current;
      const cam = cameraRef.current;
      if (r && sc && cam) {
        r.shadowMap.needsUpdate = true;
        r.render(sc, cam);
      }
      setEngineReady(true);
      onReadyChange?.(true);
    };
    boundCanvas?.addEventListener("webglcontextlost", handleContextLost, false);
    boundCanvas?.addEventListener("webglcontextrestored", handleContextRestored, false);

    // Native non-passive wheel listener: zero React re-renders mid-scroll, smooth delta-proportional zoom
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const nextZoom = computeNextWheelZoom(
        targetCamRef.current.zoom,
        event.deltaY,
        event.deltaMode,
        event.ctrlKey,
      );
      targetCamRef.current.zoom = nextZoom;
      wheelActiveUntilRef.current = performance.now() + 260;
      if (zoomSyncTimerRef.current) clearTimeout(zoomSyncTimerRef.current);
      zoomSyncTimerRef.current = setTimeout(() => {
        zoomSyncTimerRef.current = null;
        callbacksRef.current.onZoomChange(Number(targetCamRef.current.zoom.toFixed(3)));
      }, 180);
    };
    boundCanvas?.addEventListener("wheel", handleWheel, { passive: false });

    void Promise.all([
      import("three"),
      import("three/examples/jsm/environments/RoomEnvironment.js").catch(() => null),
    ])
      .then(([T, envMod]) => {
        if (cancelled) return;
        const container = containerRef.current;
        const canvas = canvasRef.current;
        if (!container || !canvas) return;

        let renderer: THREE.WebGLRenderer;
        try {
          renderer = new T.WebGLRenderer({
            canvas,
            antialias: true,
            alpha: true,
            preserveDrawingBuffer: false,
            powerPreference: "high-performance",
          });
        } catch {
          onReadyChange?.(false);
          return;
        }

        // Cap DPR at 1.5 and cache static shadow map so 3D camera orbit stays locked at 60-120fps
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = T.PCFSoftShadowMap;
        renderer.shadowMap.autoUpdate = false;
        renderer.shadowMap.needsUpdate = true;
        renderer.outputColorSpace = T.SRGBColorSpace;
        renderer.toneMapping = T.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.08;

        const scene = new T.Scene();
        // Bake studio softbox PBR environment reflections once via PMREMGenerator (zero external HDR files)
        if (envMod?.RoomEnvironment) {
          try {
            const pmrem = new T.PMREMGenerator(renderer);
            const roomEnv = new envMod.RoomEnvironment();
            const envRT = pmrem.fromScene(roomEnv, 0.04);
            scene.environment = envRT.texture;
            scene.environmentIntensity = 0.56;
            envTargetRef.current = envRT;
            roomEnv.dispose();
            pmrem.dispose();
          } catch {
            // Fallback cleanly to directional + hemisphere lighting on constrained GPUs
          }
        }
        sharedTexRef.current = {
          contactShadow: createContactShadowTexture(T),
          softGlow: createSoftGlowTexture(T),
        };

        const width = Math.max(1, container.clientWidth);
        const height = Math.max(1, container.clientHeight);
        viewportSizeRef.current = { w: width, h: height };
        renderer.setSize(width, height, false);

        const perspCam = new T.PerspectiveCamera(34, width / height, 0.1, 140);
        // Synchronous on-demand render hook used by captureStudioImage() without preserveDrawingBuffer GPU copy penalty
        (canvas as HTMLCanvasElement & { __mavisRenderNow?: () => void }).__mavisRenderNow = () => {
          if (contextLost || renderer.getContext().isContextLost()) return;
          renderer.render(scene, perspCam);
        };

        const hemi = new T.HemisphereLight(0xffffff, 0xcbd5e1, 1.15);
        scene.add(hemi);

        const key = new T.DirectionalLight(0xffffff, 1.2);
        key.position.set(6.5, 11, 7.5);
        key.castShadow = true;
        key.shadow.mapSize.width = 1024;
        key.shadow.mapSize.height = 1024;
        key.shadow.camera.near = 1;
        key.shadow.camera.far = 32;
        key.shadow.camera.left = -7.5;
        key.shadow.camera.right = 7.5;
        key.shadow.camera.top = 7.5;
        key.shadow.camera.bottom = -7.5;
        key.shadow.bias = -0.0005;
        scene.add(key);

        const rim = new T.DirectionalLight(0x93c5fd, 0.45);
        rim.position.set(-7, 6, -7);
        scene.add(rim);

        const contentGroup = new T.Group();
        scene.add(contentGroup);

        threeRef.current = T;
        rendererRef.current = renderer;
        sceneRef.current = scene;
        cameraRef.current = perspCam;
        contentGroupRef.current = contentGroup;
        lightsRef.current = { hemi, key, rim };

        resizeObserver = new ResizeObserver(() => {
          if (resizeRafId) return;
          resizeRafId = requestAnimationFrame(() => {
            resizeRafId = 0;
            if (cancelled || contextLost) return;
            const w = container.clientWidth;
            const h = container.clientHeight;
            if (w < 16 || h < 16) return;
            if (w === viewportSizeRef.current.w && h === viewportSizeRef.current.h) return;
            viewportSizeRef.current = { w, h };
            renderer.setSize(w, h, false);
            perspCam.aspect = w / h;
            perspCam.updateProjectionMatrix();
            if (!contextLost && !renderer.getContext().isContextLost()) {
              renderer.render(scene, perspCam);
            }
          });
        });
        resizeObserver.observe(container);

        setEngineReady(true);
        onReadyChange?.(true);

        let lastTime = performance.now();
        const scratchVec = new T.Vector3();

        // Compare billboard bounds in camera space so overlap follows orbit and zoom.
        const projected = new T.Vector3();
        const occupied: Array<{ x: number; y: number; w: number; h: number }> = [];
        function reserveLabel(position: THREE.Vector3, width: number, height: number) {
          projected.copy(position).applyMatrix4(perspCam.matrixWorldInverse);
          const depth = -projected.z;
          if (depth <= 0) return false;
          const x = projected.x / depth;
          const y = projected.y / depth;
          const w = width / (2 * depth);
          const h = height / (2 * depth);
          if (occupied.some(r => Math.abs(r.x - x) < r.w + w && Math.abs(r.y - y) < r.h + h)) return false;
          occupied.push({ x, y, w, h });
          return true;
        }

        const animate = (now: number) => {
          if (cancelled) return;
          rafId = requestAnimationFrame(animate);
          const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
          lastTime = now;

          // Frame-rate independent exponential inertial damping (OrbitControls-grade silky glide)
          const target = targetCamRef.current;
          const live = liveCamRef.current;
          const isWheeling = now < wheelActiveUntilRef.current;
          const smooth = dragRef.current
            ? 1 - Math.exp(-dt * 20)
            : isWheeling
              ? 1 - Math.exp(-dt * 18)
              : 1 - Math.exp(-dt * 11);
          live.yaw += (target.yaw - live.yaw) * smooth;
          live.pitch += (target.pitch - live.pitch) * smooth;
          live.zoom += (target.zoom - live.zoom) * smooth;
          live.panX += (target.panX - live.panX) * smooth;
          live.panY += (target.panY - live.panY) * smooth;

          const clampedPitch = Math.max(THREE_PITCH_MIN, Math.min(THREE_PITCH_MAX, live.pitch));
          const dist = 13.0 / Math.max(0.4, Math.min(2.2, live.zoom));
          const panScale = 0.0085;
          const lookX = -live.panX * panScale;
          const lookZ = -live.panY * panScale;
          const camX = lookX + dist * Math.cos(clampedPitch) * Math.sin(live.yaw);
          const camY = 0.32 + dist * Math.sin(clampedPitch);
          const camZ = lookZ + dist * Math.cos(clampedPitch) * Math.cos(live.yaw);

          perspCam.position.set(camX, camY, camZ);
          perspCam.lookAt(lookX, 0.32, lookZ);

          // Living 60fps diorama animations (zero per-frame allocations)
          const tSec = now * 0.001;
          for (const pkt of packetsRef.current) {
            const u = (tSec * pkt.speed + pkt.phase) % 1;
            pkt.curve.getPoint(u, pkt.mesh.position);
          }
          for (const rig of nodeRigsRef.current) {
            if (rig.halo) {
              const pulse = 1 + Math.sin(tSec * 3.2 + rig.phase) * 0.028;
              rig.halo.scale.set(pulse, pulse, 1);
            }
            for (const rotor of rig.rotors) {
              if (rotor.axis === "y") rotor.obj.rotation.y += rotor.speed * dt;
              else if (rotor.axis === "x") rotor.obj.rotation.x += rotor.speed * dt;
              else rotor.obj.rotation.z += rotor.speed * dt;
            }
            for (const hc of rig.hoverCores) {
              hc.obj.position.y = hc.baseY + Math.sin(tSec * hc.speed + rig.phase) * hc.amp;
            }
            for (const pm of rig.pulseMaterials) {
              pm.mat.emissiveIntensity = Math.max(
                0.08,
                pm.baseIntensity + Math.sin(tSec * pm.speed + rig.phase) * pm.amp,
              );
            }
            for (const sc of rig.streamCapsules) {
              const u = (tSec * sc.speed + sc.phase) % 1;
              sc.obj.position.x = sc.minX + (sc.maxX - sc.minX) * u;
            }
            if (rig.stasisRing) {
              rig.stasisRing.rotation.z += 0.65 * dt;
            }
            for (const sp of rig.smokeParticles) {
              const u = (tSec * sp.speed + sp.phase) % 1;
              sp.mesh.position.set(
                sp.baseX + Math.sin(tSec * 2.0 + sp.phase * 6) * 0.05 * u,
                sp.baseY + u * sp.maxRise,
                sp.baseZ + Math.cos(tSec * 1.7 + sp.phase * 6) * 0.05 * u,
              );
              const s = 0.65 + u * 0.9;
              sp.mesh.scale.set(s, s, s);
              const m = sp.mesh.material as THREE.MeshBasicMaterial;
              m.opacity = (1 - u) * 0.55;
            }
            const lp = computeNodeLabelPlacement(live.yaw, clampedPitch, live.zoom, rig.labelBaseY);
            rig.labelSprite.position.set(lp.x, lp.y, lp.z);
            rig.labelSprite.scale.set(rig.labelBaseW * lp.scale, rig.labelBaseH * lp.scale, 1);
          }

          perspCam.updateMatrixWorld();
          occupied.length = 0;
          for (const rig of nodeRigsRef.current) {
            scratchVec.copy(rig.group.position);
            scratchVec.y += rig.labelBaseY * 0.32;
            reserveLabel(scratchVec, 0.85, 0.48);
          }
          for (const rig of nodeRigsRef.current) {
            const tag = rig.labelSprite;
            if (!tag.visible) continue;
            for (let attempt = 0; attempt < 4; attempt++) {
              scratchVec.copy(tag.position).add(rig.group.position);
              if (reserveLabel(scratchVec, tag.scale.x, tag.scale.y) || attempt === 3) break;
              tag.position.y += tag.scale.y * 0.65;
            }
          }
          for (const edge of edgeRigsRef.current) {
            const badge = edge.badgeSprite;
            if (!badge || !edge.curve) continue;
            badge.visible = false;
            if (!showEdgeTagsRef.current) continue;
            for (const fraction of [0.5, 0.32, 0.68]) {
              edge.curve.getPoint(fraction, badge.position);
              badge.position.y += 0.21;
              if (reserveLabel(badge.position, badge.scale.x, badge.scale.y)) {
                badge.visible = true;
                break;
              }
            }
          }

          if (!contextLost && !renderer.getContext().isContextLost()) {
            renderer.render(scene, perspCam);
          }

          // Update invisible projected bounding box for Guided Tour step 2 only once camera has settled (zero layout reflow during zoom/orbit)
          const isCameraSettling =
            Math.abs(target.zoom - live.zoom) > 0.004 ||
            Math.abs(target.yaw - live.yaw) > 0.002 ||
            Math.abs(target.pitch - live.pitch) > 0.002 ||
            Math.abs(target.panX - live.panX) > 0.5 ||
            Math.abs(target.panY - live.panY) > 0.5;
          const tourBox = tourBoxRef.current;
          const rigs = nodeRigsRef.current;
          if (tourBox && rigs.length > 0 && !dragRef.current && !isWheeling && !isCameraSettling) {
            const { w, h } = viewportSizeRef.current;
            let minX = w;
            let maxX = 0;
            let minY = h;
            let maxY = 0;
            for (const rig of rigs) {
              for (const yOff of [0, 1.15]) {
                scratchVec.set(rig.group.position.x, yOff, rig.group.position.z);
                scratchVec.project(perspCam);
                const sx = (scratchVec.x * 0.5 + 0.5) * w;
                const sy = (-scratchVec.y * 0.5 + 0.5) * h;
                minX = Math.min(minX, sx);
                maxX = Math.max(maxX, sx);
                minY = Math.min(minY, sy);
                maxY = Math.max(maxY, sy);
              }
            }
            const padX = 76;
            const padY = 44;
            const nextL = Math.round(Math.max(8, minX - padX));
            const nextT = Math.round(Math.max(8, minY - padY));
            const nextW = Math.max(40, Math.round(Math.min(w - 8, maxX + padX) - nextL));
            const nextH = Math.max(40, Math.round(Math.min(h - 8, maxY + padY) - nextT));
            const prev = lastTourRectRef.current;
            if (
              Math.abs(nextL - prev.l) >= 2 ||
              Math.abs(nextT - prev.t) >= 2 ||
              Math.abs(nextW - prev.w) >= 2 ||
              Math.abs(nextH - prev.h) >= 2
            ) {
              lastTourRectRef.current = { l: nextL, t: nextT, w: nextW, h: nextH };
              tourBox.style.left = `${nextL}px`;
              tourBox.style.top = `${nextT}px`;
              tourBox.style.width = `${nextW}px`;
              tourBox.style.height = `${nextH}px`;
            }
          }
        };

        rafId = requestAnimationFrame(animate);
      })
      .catch(() => {
        if (!cancelled) onReadyChange?.(false);
      });

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      if (resizeRafId) cancelAnimationFrame(resizeRafId);
      if (recoveryTimer) clearTimeout(recoveryTimer);
      boundCanvas?.removeEventListener("wheel", handleWheel);
      boundCanvas?.removeEventListener("webglcontextlost", handleContextLost);
      boundCanvas?.removeEventListener("webglcontextrestored", handleContextRestored);
      if (zoomSyncTimerRef.current) {
        clearTimeout(zoomSyncTimerRef.current);
        zoomSyncTimerRef.current = null;
      }
      resizeObserver?.disconnect();
      if (threeRef.current && contentGroupRef.current) {
        disposeObjectTree(threeRef.current, contentGroupRef.current);
      }
      envTargetRef.current?.dispose();
      envTargetRef.current = null;
      if (sharedTexRef.current) {
        sharedTexRef.current.contactShadow.dispose();
        sharedTexRef.current.softGlow.dispose();
        sharedTexRef.current = null;
      }
      rendererRef.current?.dispose();
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      contentGroupRef.current = null;
      lightsRef.current = null;
      packetsRef.current = [];
      nodeRigsRef.current = [];
      edgeRigsRef.current = [];
      zoneRigsRef.current = [];
      deckRigRef.current = null;
      liveNodePosRef.current.clear();
      lastSceneSigRef.current = "";
    };
  }, [onReadyChange, webglRecoveryEpoch]);

  // Rebuild 3D meshes, deck, edges, and lights ONLY when visual scene signature actually changes
  useEffect(() => {
    const T = threeRef.current;
    const contentGroup = contentGroupRef.current;
    const lights = lightsRef.current;
    if (!engineReady || !T || !contentGroup || !lights) return;

    const sceneSignature = [
      styleId,
      dropHoverService ?? "",
      `${deckBounds.minX},${deckBounds.maxX},${deckBounds.minZ},${deckBounds.maxZ}`,
      nodes
        .map(
          (n) =>
            `${n.id}|${n.label}|${n.archetype}|${n.tier ?? ""}|${n.wx}|${n.wz}|${n.replicas}|${n.isStopped ? 1 : 0}${n.isPaused ? 1 : 0}${n.isCritical ? 1 : 0}${n.isWarning ? 1 : 0}${n.isSelected ? 1 : 0}${n.isDropTarget ? 1 : 0}|${n.cpuPct ?? ""}|${n.ramPct ?? ""}|${n.cpuThrottlePct ?? ""}|${n.ramLabel ?? ""}|${n.palette.accent}`,
        )
        .join(";"),
      edges
        .map(
          (e) =>
            `${e.id}|${e.from}>${e.to}|${e.kind}|${e.color}|${e.dashed ? 1 : 0}${e.isAsync ? 1 : 0}${e.isSevered ? 1 : 0}${e.isDegraded ? 1 : 0}|${e.label ?? ""}|${e.rps ?? ""}`,
        )
        .join(";"),
    ].join("#");
    if (sceneSignature === lastSceneSigRef.current) return;
    lastSceneSigRef.current = sceneSignature;

    while (contentGroup.children.length > 0) {
      const child = contentGroup.children[0]!;
      contentGroup.remove(child);
      disposeObjectTree(T, child);
    }
    packetsRef.current = [];
    nodeRigsRef.current = [];
    edgeRigsRef.current = [];
    zoneRigsRef.current = [];
    deckRigRef.current = null;
    liveNodePosRef.current.clear();

    const styleCfg = STUDIO_STYLES[styleId];
    const isLight = !styleCfg.isDark;

    // Theme-tuned lighting rig + PBR studio environment intensity
    const scene = sceneRef.current;
    if (styleId === "control") {
      lights.hemi.color.set("#cbd5e1");
      lights.hemi.groundColor.set("#0f172a");
      lights.hemi.intensity = 1.0;
      lights.key.color.set("#e0f2fe");
      lights.key.intensity = 1.25;
      lights.rim.color.set("#38bdf8");
      lights.rim.intensity = 0.85;
      if (scene) scene.environmentIntensity = 0.72;
    } else if (styleId === "pop") {
      lights.hemi.color.set("#ffffff");
      lights.hemi.groundColor.set("#fef3c7");
      lights.hemi.intensity = 1.3;
      lights.key.color.set("#ffffff");
      lights.key.intensity = 1.1;
      lights.rim.color.set("#bae6fd");
      lights.rim.intensity = 0.45;
      if (scene) scene.environmentIntensity = 0.32;
    } else if (styleId === "blueprint") {
      lights.hemi.color.set("#f0f9ff");
      lights.hemi.groundColor.set("#bfdbfe");
      lights.hemi.intensity = 1.25;
      lights.key.color.set("#ffffff");
      lights.key.intensity = 1.1;
      lights.rim.color.set("#60a5fa");
      lights.rim.intensity = 0.58;
      if (scene) scene.environmentIntensity = 0.38;
    } else {
      lights.hemi.color.set("#ffffff");
      lights.hemi.groundColor.set("#dbeafe");
      lights.hemi.intensity = 1.15;
      lights.key.color.set("#ffffff");
      lights.key.intensity = 1.3;
      lights.rim.color.set("#93c5fd");
      lights.rim.intensity = 0.55;
      if (scene) scene.environmentIntensity = 0.58;
    }

    // 1. Sculpted 2-Tier Beveled Architectural Diorama Deck + Surface Grid Lines
    const minX = deckBounds.minX * WORLD_SCALE;
    const maxX = deckBounds.maxX * WORLD_SCALE;
    const minZ = deckBounds.minZ * WORLD_SCALE;
    const maxZ = deckBounds.maxZ * WORLD_SCALE;
    const deckW = Math.max(4.6, maxX - minX);
    const deckD = Math.max(3.6, maxZ - minZ);
    const deckCx = (minX + maxX) / 2;
    const deckCz = (minZ + maxZ) / 2;
    const deckH = 0.16;

    const deckGroup = new T.Group();
    deckGroup.position.set(deckCx, 0, deckCz);

    const maxAnisotropy = Math.min(8, rendererRef.current?.capabilities.getMaxAnisotropy() ?? 4);
    const deckTopMat = new T.MeshPhysicalMaterial({
      color: new T.Color(styleId === "control" ? "#070c18" : styleCfg.deckTopFill),
      roughness: styleId === "control" ? 0.64 : styleId === "pop" ? 0.55 : 0.48,
      metalness: styleId === "control" ? 0.16 : 0.06,
      clearcoat: styleId === "control" ? 0.2 : styleId === "daylight" ? 0.38 : 0.18,
      clearcoatRoughness: styleId === "control" ? 0.45 : 0.32,
      envMapIntensity: styleId === "control" ? 0.32 : 0.8,
    });
    const deckSkirtMat = new T.MeshPhysicalMaterial({
      color: new T.Color(styleId === "control" ? "#0f172a" : styleId === "blueprint" ? "#93c5fd" : styleId === "pop" ? "#0f172a" : "#cbd5e1"),
      roughness: styleId === "control" ? 0.28 : 0.45,
      metalness: styleId === "control" ? 0.65 : 0.28,
    });

    const upperDeckGeo = createRoundedSlabGeo(
      T,
      deckW,
      deckH,
      deckD,
      styleId === "blueprint" ? 0.06 : 0.22,
      0.028,
    );
    const upperDeck = new T.Mesh(upperDeckGeo, deckTopMat);
    upperDeck.position.set(0, -deckH, 0);
    upperDeck.receiveShadow = true;
    const deckEdgeMat = new T.LineBasicMaterial({
      color: new T.Color(styleCfg.deckStroke),
      transparent: styleId !== "pop",
      opacity: styleId === "pop" ? 1 : isLight ? 0.72 : 0.68,
    });
    upperDeck.add(new T.LineSegments(new T.EdgesGeometry(upperDeckGeo, 28), deckEdgeMat));
    deckGroup.add(upperDeck);

    // Floating lower recessed brushed-metal architectural plinth skirt
    const skirtH = 0.11;
    const skirtGeo = createRoundedSlabGeo(
      T,
      Math.max(3.8, deckW - 0.26),
      skirtH,
      Math.max(2.8, deckD - 0.26),
      styleId === "blueprint" ? 0.04 : 0.16,
      0.018,
    );
    const skirtMesh = new T.Mesh(skirtGeo, deckSkirtMat);
    skirtMesh.position.set(0, -(deckH + skirtH - 0.01), 0);
    deckGroup.add(skirtMesh);

    contentGroup.add(deckGroup);

    // Uniform subtle CAD drafting grid across the deck surface
    const gridGeo = buildDeckGridGeometry(T, minX, maxX, minZ, maxZ);
    const gridLine = new T.LineSegments(
      gridGeo,
      new T.LineBasicMaterial({
        color: new T.Color(styleCfg.deckGridStroke),
        transparent: true,
        opacity: isLight ? 0.14 : 0.13,
      }),
    );
    contentGroup.add(gridLine);
    deckRigRef.current = {
      mesh: deckGroup,
      baseW: deckW,
      baseD: deckD,
      deckH,
      gridLine,
    };

    // Dynamic Architectural Trust Zones (UML 2.5 Deployment Environment / C4 System Boundary / CodeCity Districts)
    const rawZones = [
      {
        key: "EDGE",
        title: "EDGE / INGRESS",
        accent: isLight ? "#0284c7" : "#38bdf8",
        memberIds: nodes.filter((n) => n.archetype === "GATEWAY").map((n) => n.id),
      },
      {
        key: "CORE",
        title: "CORE SERVICES · DOCKER NET",
        accent: isLight ? "#4f46e5" : "#818cf8",
        memberIds: nodes.filter((n) => n.archetype === "SERVICE").map((n) => n.id),
      },
      {
        key: "DATA",
        title: "DATA & MESSAGING",
        accent: isLight ? "#0d9488" : "#2dd4bf",
        memberIds: nodes
          .filter((n) => n.archetype === "DATABASE" || n.archetype === "QUEUE")
          .map((n) => n.id),
      },
    ].filter((z) => z.memberIds.length > 0);

    const initialPosById = new Map<string, { wx: number; wz: number }>(
      nodes.map((n) => [n.id, { wx: n.wx, wz: n.wz }]),
    );
    const zoneLayouts = computeLiveZoneRects(rawZones, initialPosById, minX, maxX, minZ, maxZ);
    const zoneSpecByKey = new Map(rawZones.map((z) => [z.key, z]));

    for (const zl of zoneLayouts) {
      const spec = zoneSpecByKey.get(zl.key);
      if (!spec) continue;
      const zoneRig = createZonePlateGroup(
        T,
        spec.key,
        spec.memberIds,
        spec.title,
        zl.width,
        zl.depth,
        spec.accent,
        isLight,
        maxAnisotropy,
      );
      zoneRig.group.position.set(zl.cx, 0, zl.cz);
      contentGroup.add(zoneRig.group);
      zoneRigsRef.current.push(zoneRig);
    }

    // 2. Real 3D SE-Standard Service Deployment Nodes
    const nodeById = new Map<string, StudioThreeNode>();
    for (const node of nodes) {
      nodeById.set(node.id, node);
      liveNodePosRef.current.set(node.id, { wx: node.wx, wz: node.wz });
      const effectiveNode =
        dropHoverService === node.id
          ? { ...node, isDropTarget: true }
          : node;
      const rig = buildServiceRig(T, effectiveNode, styleId, sharedTexRef.current, maxAnisotropy);
      rig.labelSprite.visible = showNodeTagsRef.current;
      contentGroup.add(rig.group);
      nodeRigsRef.current.push(rig);
    }

    // 3. Semantic SE Connectors (Port Socket Collars + Throughput-Encoded Sync/Async Conduits + Fault Indicators)
    const edgePairSet = new Set(edges.map((e) => `${e.from}->${e.to}`));
    const upVec = new T.Vector3(0, 1, 0);
    for (const edge of edges) {
      const from = nodeById.get(edge.from);
      const to = nodeById.get(edge.to);
      if (!from || !to) continue;

      const ax = from.wx * WORLD_SCALE;
      const az = from.wz * WORLD_SCALE;
      const bx = to.wx * WORLD_SCALE;
      const bz = to.wz * WORLD_SCALE;
      if (Math.hypot(bx - ax, bz - az) < 0.05) continue;

      const hasReverse = edgePairSet.has(`${edge.to}->${edge.from}`);
      const isAsync = Boolean(edge.isAsync);
      const anchor = compute3DEdgeAnchors(ax, az, bx, bz, nodes, edge.from, edge.to, hasReverse);

      if (edge.kind === "static") {
        const lineGeo = new T.BufferGeometry().setFromPoints([
          new T.Vector3(anchor.sx, 0.028, anchor.sz),
          new T.Vector3(anchor.ex, 0.028, anchor.ez),
        ]);
        const lineMat = new T.LineDashedMaterial({
          color: new T.Color(edge.color),
          dashSize: 0.14,
          gapSize: 0.11,
          transparent: true,
          opacity: edge.isSevered ? 0.9 : 0.52,
        });
        const line = new T.Line(lineGeo, lineMat);
        line.computeLineDistances();
        line.userData["edgeHit"] = { id: edge.id, from: edge.from, to: edge.to };
        contentGroup.add(line);

        // Subtle floor directional tip right at target plinth rim
        const tipGeo = new T.ConeGeometry(0.055, 0.15, 8);
        const tipMat = new T.MeshBasicMaterial({
          color: new T.Color(edge.color),
          transparent: true,
          opacity: edge.isSevered ? 0.9 : 0.52,
        });
        const tipMesh = new T.Mesh(tipGeo, tipMat);
        tipMesh.position.set(anchor.ex - anchor.nx * 0.08, 0.042, anchor.ez - anchor.nz * 0.08);
        tipMesh.quaternion.setFromUnitVectors(upVec, new T.Vector3(anchor.nx, 0, anchor.nz).normalize());
        tipMesh.userData["edgeHit"] = { id: edge.id, from: edge.from, to: edge.to };
        contentGroup.add(tipMesh);

        edgeRigsRef.current.push({
          from: edge.from,
          to: edge.to,
          kind: "static",
          hasReverse,
          isAsync,
          tubeRadius: 0.02,
          line,
          arrowMesh: tipMesh,
        });
        continue;
      }

      // Observed Live OTel 3D Conduit anchored to Port Socket Collars on plinth rims
      const portY = 0.15;
      const p0 = new T.Vector3(anchor.sx, portY, anchor.sz);
      const mid = new T.Vector3(anchor.midX, anchor.lift, anchor.midZ);
      const p2 = new T.Vector3(anchor.ex, portY, anchor.ez);
      const curve = new T.QuadraticBezierCurve3(p0, mid, p2);

      // Encode live OTel RPS throughput in conduit radius (Kiali / Service Mesh convention)
      const rpsVal = edge.rps ?? 0;
      const tubeRadius = edge.isSevered
        ? 0.032
        : rpsVal > 0
          ? Math.min(0.052, Math.max(0.028, 0.024 + Math.log2(rpsVal + 1) * 0.0095))
          : 0.027;

      const conduitMat = new T.MeshPhysicalMaterial({
        color: new T.Color(edge.color),
        emissive: new T.Color(edge.color),
        emissiveIntensity: styleId === "control" ? 0.72 : 0.28,
        roughness: 0.16,
        metalness: 0.22,
        clearcoat: 0.9,
        clearcoatRoughness: 0.1,
      });

      // Hardware Port Socket Collars at source & destination Service Boundary rims
      const portGeo = new T.CylinderGeometry(0.068, 0.075, 0.05, 14);
      const startPort = new T.Mesh(portGeo, conduitMat);
      startPort.position.set(anchor.sx, portY - 0.015, anchor.sz);
      contentGroup.add(startPort);
      const endPort = new T.Mesh(portGeo, conduitMat);
      endPort.position.set(anchor.ex, portY - 0.015, anchor.ez);
      contentGroup.add(endPort);

      let tubeMesh: THREE.Mesh | undefined;
      let asyncLine: THREE.Line | undefined;
      if (isAsync) {
        // UML Async Event/Message connector: dashed elevated arch
        const pts = curve.getPoints(32);
        const asyncGeo = new T.BufferGeometry().setFromPoints(pts);
        const asyncMat = new T.LineDashedMaterial({
          color: new T.Color(edge.color),
          dashSize: 0.18,
          gapSize: 0.12,
        });
        asyncLine = new T.Line(asyncGeo, asyncMat);
        asyncLine.computeLineDistances();
        asyncLine.userData["edgeHit"] = { id: edge.id, from: edge.from, to: edge.to };
        contentGroup.add(asyncLine);
      } else {
        // UML Sync HTTP/gRPC connector: solid continuous conduit
        const tubeGeo = new T.TubeGeometry(curve, 28, tubeRadius, 10, false);
        tubeMesh = new T.Mesh(tubeGeo, conduitMat);
        tubeMesh.userData["edgeHit"] = { id: edge.id, from: edge.from, to: edge.to };
        contentGroup.add(tubeMesh);
      }

      // Directional tip: filled cone (Sync) vs open ring/chevron (Async)
      const arrowPos = curve.getPoint(0.91);
      const arrowTan = curve.getTangent(0.91).normalize();
      const arrowGeo = isAsync
        ? new T.TorusGeometry(0.075, 0.022, 8, 16)
        : new T.ConeGeometry(Math.max(0.075, tubeRadius * 2.2), 0.2, 10);
      const arrowMesh = new T.Mesh(arrowGeo, conduitMat);
      arrowMesh.position.copy(arrowPos);
      arrowMesh.quaternion.setFromUnitVectors(upVec, arrowTan);
      contentGroup.add(arrowMesh);

      // Mid-span Fault Break Ring when severed (HTTP 5xx / Circuit Open / Container Down)
      let breakRing: THREE.Mesh | undefined;
      if (edge.isSevered) {
        breakRing = new T.Mesh(new T.TorusGeometry(0.105, 0.022, 8, 18), conduitMat);
        breakRing.position.copy(curve.getPoint(0.5));
        breakRing.quaternion.setFromUnitVectors(upVec, curve.getTangent(0.5).normalize());
        contentGroup.add(breakRing);
      }

      // Dual Staggered Luminous Fiber-Optic Packet Orbs with Soft Additive Halo Glow
      const pktColor = edge.isSevered
        ? "#f43f5e"
        : edge.isDegraded
          ? "#f59e0b"
          : styleId === "control"
            ? "#34d399"
            : "#10b981";
      const pktRadius = Math.max(0.058, tubeRadius * 1.65);
      const pktSpeed = 1 / Math.max(0.8, edge.speedSec ?? 1.8);
      const basePhase = (edge.id.length * 0.19) % 1;
      for (let p = 0; p < 2; p++) {
        const pktGroup = new T.Group();
        const coreSphere = new T.Mesh(
          new T.SphereGeometry(pktRadius, 12, 12),
          new T.MeshBasicMaterial({ color: new T.Color(styleId === "control" ? "#ffffff" : pktColor) }),
        );
        pktGroup.add(coreSphere);
        if (sharedTexRef.current) {
          const haloSprite = new T.Sprite(
            new T.SpriteMaterial({
              map: sharedTexRef.current.softGlow,
              color: new T.Color(pktColor),
              transparent: true,
              opacity: styleId === "control" ? 0.95 : 0.72,
              blending: T.AdditiveBlending,
              depthWrite: false,
            }),
          );
          const hs = pktRadius * 5.2;
          haloSprite.scale.set(hs, hs, 1);
          pktGroup.add(haloSprite);
        }
        contentGroup.add(pktGroup);
        packetsRef.current.push({
          mesh: pktGroup,
          curve,
          speed: pktSpeed,
          phase: (basePhase + p * 0.5) % 1,
        });
      }

      // Floating Traffic Metric Badge at Cleared Apex
      let badgeSprite: THREE.Sprite | undefined;
      if (edge.label) {
        badgeSprite = createEdgeBadgeSprite(T, edge.label, edge, isLight);
        badgeSprite.visible = showEdgeTagsRef.current;
        const apex = curve.getPoint(0.5);
        badgeSprite.position.set(apex.x, apex.y + 0.21, apex.z);
        contentGroup.add(badgeSprite);
      }

      edgeRigsRef.current.push({
        from: edge.from,
        to: edge.to,
        kind: "observed",
        hasReverse,
        isAsync,
        tubeRadius,
        line: asyncLine,
        tubeMesh,
        arrowMesh,
        startPort,
        endPort,
        breakRing,
        badgeSprite,
        curve,
        isSevered: edge.isSevered,
      });
    }
    if (rendererRef.current) {
      rendererRef.current.shadowMap.needsUpdate = true;
    }
  }, [engineReady, nodes, edges, deckBounds, styleId, dropHoverService]);

  useEffect(() => {
    for (const rig of nodeRigsRef.current) {
      rig.labelSprite.visible = showNodeTags;
    }
    for (const edge of edgeRigsRef.current) {
      if (edge.badgeSprite) {
        edge.badgeSprite.visible = showEdgeTags;
      }
    }
  }, [engineReady, showNodeTags, showEdgeTags]);

  function raycastServiceAt(clientX: number, clientY: number): string | null {
    const T = threeRef.current;
    const canvas = canvasRef.current;
    const perspCam = cameraRef.current;
    const rigs = nodeRigsRef.current;
    if (!T || !canvas || !perspCam || rigs.length === 0) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const ndc = ndcRef.current ?? (ndcRef.current = new T.Vector2());
    const raycaster = raycasterRef.current ?? (raycasterRef.current = new T.Raycaster());
    ndc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(ndc, perspCam);
    const hits = raycaster.intersectObjects(
      rigs.map((r) => r.group),
      true,
    );
    for (const hit of hits) {
      if (!hit.object.visible) continue;
      let cur: THREE.Object3D | null = hit.object;
      while (cur) {
        const sid = cur.userData?.["serviceId"];
        if (typeof sid === "string") {
          return sid;
        }
        cur = cur.parent;
      }
    }
    return null;
  }

  function raycastEdgeAt(clientX: number, clientY: number): { id: string; from: string; to: string } | null {
    const T = threeRef.current;
    const canvas = canvasRef.current;
    const perspCam = cameraRef.current;
    const rigs = edgeRigsRef.current;
    if (!T || !canvas || !perspCam || rigs.length === 0) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const ndc = ndcRef.current ?? (ndcRef.current = new T.Vector2());
    const raycaster = raycasterRef.current ?? (raycasterRef.current = new T.Raycaster());
    raycaster.params.Line.threshold = 0.25;
    ndc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(ndc, perspCam);
    const targets: THREE.Object3D[] = [];
    for (const r of rigs) {
      if (r.tubeMesh) targets.push(r.tubeMesh);
      if (r.line) targets.push(r.line);
      if (r.arrowMesh) targets.push(r.arrowMesh);
    }
    const hits = raycaster.intersectObjects(targets, false);
    for (const hit of hits) {
      const edgeHit = hit.object.userData?.["edgeHit"] as
        | { id: string; from: string; to: string }
        | undefined;
      if (edgeHit?.from && edgeHit?.to) return edgeHit;
    }
    return null;
  }

  function raycastGroundWorld(clientX: number, clientY: number): { wx: number; wz: number } | null {
    const T = threeRef.current;
    const canvas = canvasRef.current;
    const perspCam = cameraRef.current;
    if (!T || !canvas || !perspCam) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const ndc = ndcRef.current ?? (ndcRef.current = new T.Vector2());
    const raycaster = raycasterRef.current ?? (raycasterRef.current = new T.Raycaster());
    const plane =
      groundPlaneRef.current ?? (groundPlaneRef.current = new T.Plane(new T.Vector3(0, 1, 0), 0));
    const hit = hitVecRef.current ?? (hitVecRef.current = new T.Vector3());
    ndc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(ndc, perspCam);
    if (!raycaster.ray.intersectPlane(plane, hit)) return null;
    return { wx: hit.x / WORLD_SCALE, wz: hit.z / WORLD_SCALE };
  }

  function updateLiveNodeAndEdges(serviceId: string, wx: number, wz: number) {
    const T = threeRef.current;
    if (!T) return;
    liveNodePosRef.current.set(serviceId, { wx, wz });
    const rig = nodeRigsRef.current.find((item) => item.id === serviceId);
    if (rig) {
      rig.group.position.set(wx * WORLD_SCALE, 0, wz * WORLD_SCALE);
    }
    const allLiveNodes = [...liveNodePosRef.current.entries()].map(([id, pos]) => ({
      id,
      wx: pos.wx,
      wz: pos.wz,
    }));
    const up = new T.Vector3(0, 1, 0);
    for (const edge of edgeRigsRef.current) {
      const a = liveNodePosRef.current.get(edge.from);
      const b = liveNodePosRef.current.get(edge.to);
      if (!a || !b) continue;
      const ax = a.wx * WORLD_SCALE;
      const az = a.wz * WORLD_SCALE;
      const bx = b.wx * WORLD_SCALE;
      const bz = b.wz * WORLD_SCALE;
      const anchor = compute3DEdgeAnchors(
        ax,
        az,
        bx,
        bz,
        allLiveNodes,
        edge.from,
        edge.to,
        edge.hasReverse,
      );
      if (edge.kind === "static" && edge.line) {
        const pos = edge.line.geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
        if (pos) {
          pos.setXYZ(0, anchor.sx, 0.03, anchor.sz);
          pos.setXYZ(1, anchor.ex, 0.03, anchor.ez);
          pos.needsUpdate = true;
          edge.line.computeLineDistances();
        }
        if (edge.arrowMesh) {
          edge.arrowMesh.position.set(
            anchor.ex - anchor.nx * 0.08,
            0.045,
            anchor.ez - anchor.nz * 0.08,
          );
          edge.arrowMesh.quaternion.setFromUnitVectors(
            up,
            new T.Vector3(anchor.nx, 0, anchor.nz).normalize(),
          );
        }
      } else if (edge.kind === "observed" && edge.curve) {
        const portY = 0.15;
        edge.curve.v0.set(anchor.sx, portY, anchor.sz);
        edge.curve.v1.set(anchor.midX, anchor.lift, anchor.midZ);
        edge.curve.v2.set(anchor.ex, portY, anchor.ez);
        if (edge.startPort) edge.startPort.position.set(anchor.sx, portY - 0.015, anchor.sz);
        if (edge.endPort) edge.endPort.position.set(anchor.ex, portY - 0.015, anchor.ez);
        if (edge.isAsync && edge.line) {
          const nextGeo = new T.BufferGeometry().setFromPoints(edge.curve.getPoints(28));
          edge.line.geometry.dispose();
          edge.line.geometry = nextGeo;
          edge.line.computeLineDistances();
        } else if (edge.tubeMesh) {
          const nextGeo = new T.TubeGeometry(edge.curve, 24, edge.tubeRadius, 8, false);
          edge.tubeMesh.geometry.dispose();
          edge.tubeMesh.geometry = nextGeo;
        }
        if (edge.arrowMesh) {
          edge.arrowMesh.position.copy(edge.curve.getPoint(0.91));
          edge.arrowMesh.quaternion.setFromUnitVectors(up, edge.curve.getTangent(0.91).normalize());
        }
        if (edge.breakRing) {
          edge.breakRing.position.copy(edge.curve.getPoint(0.5));
          edge.breakRing.quaternion.setFromUnitVectors(up, edge.curve.getTangent(0.5).normalize());
        }
        if (edge.badgeSprite) {
          const apex = edge.curve.getPoint(0.5);
          edge.badgeSprite.position.set(apex.x, apex.y + 0.21, apex.z);
        }
      }
    }

    // Live-track 3D deck floor + grid and every architectural trust zone plate smoothly at 60fps
    const liveBounds = computeLiveDeckBounds(allLiveNodes);
    const minX = liveBounds.minX * WORLD_SCALE;
    const maxX = liveBounds.maxX * WORLD_SCALE;
    const minZ = liveBounds.minZ * WORLD_SCALE;
    const maxZ = liveBounds.maxZ * WORLD_SCALE;
    const deck = deckRigRef.current;
    if (deck) {
      const deckW = Math.max(4.6, maxX - minX);
      const deckD = Math.max(3.6, maxZ - minZ);
      deck.mesh.scale.set(deckW / deck.baseW, 1, deckD / deck.baseD);
      deck.mesh.position.set((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
      if (deck.gridLine) {
        const nextGridGeo = buildDeckGridGeometry(T, minX, maxX, minZ, maxZ);
        deck.gridLine.geometry.dispose();
        deck.gridLine.geometry = nextGridGeo;
      }
    }

    const zoneRigs = zoneRigsRef.current;
    if (zoneRigs.length > 0) {
      const liveLayouts = computeLiveZoneRects(zoneRigs, liveNodePosRef.current, minX, maxX, minZ, maxZ);
      const layoutByKey = new Map(liveLayouts.map((z) => [z.key, z]));
      for (const zone of zoneRigs) {
        const next = layoutByKey.get(zone.key);
        if (!next) continue;
        zone.group.position.set(next.cx, 0, next.cz);
        if (Math.abs(next.width - zone.width) > 0.002 || Math.abs(next.depth - zone.depth) > 0.002) {
          const { fillGeo, borderGeo, hd } = buildZoneGeometries(T, next.width, next.depth);
          zone.fillMesh.geometry.dispose();
          zone.fillMesh.geometry = fillGeo;
          zone.borderLine.geometry.dispose();
          zone.borderLine.geometry = borderGeo;
          zone.borderLine.computeLineDistances();
          zone.badgeMesh.position.set(0, 0.016, -hd);
          zone.badgeMesh.scale.set(Math.min(next.width - 0.2, zone.badgeNaturalW), 1, 1);
          zone.width = next.width;
          zone.depth = next.depth;
        }
      }
    }

    if (rendererRef.current) {
      rendererRef.current.shadowMap.needsUpdate = true;
    }
  }

  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 z-10 overflow-hidden transition-opacity duration-200 ${
        engineReady ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
    >
      <div
        ref={tourBoxRef}
        data-tour={engineReady ? "studio-services-graph" : undefined}
        className="pointer-events-none absolute"
      />
      <canvas
        key={webglRecoveryEpoch}
        ref={canvasRef}
        data-testid="studio-3d-webgl"
        data-studio-webgl-canvas
        data-studio-engine="three-webgl"
        data-studio-style={styleId}
        data-show-node-tags={String(showNodeTags)}
        data-show-edge-tags={String(showEdgeTags)}
        data-camera-yaw={String(Math.round(((((camera.yaw * 180) / Math.PI) % 360) + 360) % 360))}
        data-camera-pitch={String(Math.round((Math.max(THREE_PITCH_MIN, Math.min(THREE_PITCH_MAX, camera.pitch)) * 180) / Math.PI))}
        aria-label="Live 3D WebGL runtime topology"
        className={`block h-full w-full touch-none select-none ${
          isDragging ? "cursor-grabbing" : "cursor-default"
        }`}
        onContextMenu={(event) => event.preventDefault()}
        onPointerDown={(event) => {
          if (![0, 1, 2].includes(event.button)) return;
          event.preventDefault();
          event.currentTarget.style.cursor = "grabbing";

          // Right mouse button = Orbit 3D camera 360°
          if (event.button === 2) {
            dragRef.current = {
              mode: "ORBIT",
              x: event.clientX,
              y: event.clientY,
              moved: false,
              pointerId: event.pointerId,
              lastSyncAt: performance.now(),
            };
            setIsDragging(true);
            event.currentTarget.setPointerCapture(event.pointerId);
            return;
          }

          // Left mouse button on a 3D service block = Drag block smoothly across the 3D deck
          if (event.button === 0 && !event.shiftKey) {
            const hitService = raycastServiceAt(event.clientX, event.clientY);
            if (hitService) {
              const current = liveNodePosRef.current.get(hitService);
              const floor = raycastGroundWorld(event.clientX, event.clientY);
              if (current && floor) {
                dragRef.current = {
                  mode: "NODE",
                  serviceId: hitService,
                  x: event.clientX,
                  y: event.clientY,
                  grabOffsetX: current.wx - floor.wx,
                  grabOffsetZ: current.wz - floor.wz,
                  startWx: current.wx,
                  startWz: current.wz,
                  currentWx: current.wx,
                  currentWz: current.wz,
                  moved: false,
                  pointerId: event.pointerId,
                };
                setIsDragging(true);
                event.currentTarget.setPointerCapture(event.pointerId);
                return;
              }
            }
          }

          // Left-drag on empty floor or Middle-drag = Pan camera along deck plane
          dragRef.current = {
            mode: "PAN",
            x: event.clientX,
            y: event.clientY,
            moved: false,
            pointerId: event.pointerId,
          };
          setIsDragging(true);
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag) {
            const hit = raycastServiceAt(event.clientX, event.clientY);
            if (hit !== hoveredServiceRef.current) {
              hoveredServiceRef.current = hit;
              event.currentTarget.style.cursor = hit ? "grab" : "default";
            }
            return;
          }
          if (drag.pointerId !== event.pointerId) return;
          const dx = event.clientX - drag.x;
          const dy = event.clientY - drag.y;
          drag.x = event.clientX;
          drag.y = event.clientY;
          if (Math.abs(dx) > 2 || Math.abs(dy) > 2) drag.moved = true;

          if (drag.mode === "ORBIT") {
            const nextYaw = targetCamRef.current.yaw - dx * 0.0085;
            const nextPitch = Math.max(
              THREE_PITCH_MIN,
              Math.min(THREE_PITCH_MAX, targetCamRef.current.pitch + dy * 0.006),
            );
            targetCamRef.current.yaw = nextYaw;
            targetCamRef.current.pitch = nextPitch;
          } else if (drag.mode === "NODE") {
            const floor = raycastGroundWorld(event.clientX, event.clientY);
            if (!floor) return;
            const nextWx = Math.max(-520, Math.min(520, floor.wx + drag.grabOffsetX));
            const nextWz = Math.max(-420, Math.min(420, floor.wz + drag.grabOffsetZ));
            drag.currentWx = nextWx;
            drag.currentWz = nextWz;
            updateLiveNodeAndEdges(drag.serviceId, nextWx, nextWz);
          } else {
            const cosY = Math.cos(liveCamRef.current.yaw);
            const sinY = Math.sin(liveCamRef.current.yaw);
            const invZoom = 1 / Math.max(0.45, liveCamRef.current.zoom);
            const worldDx = (dx * cosY + dy * sinY) * invZoom;
            const worldDz = (-dx * sinY + dy * cosY) * invZoom;
            targetCamRef.current.panX = Math.max(-900, Math.min(900, targetCamRef.current.panX + worldDx));
            targetCamRef.current.panY = Math.max(-600, Math.min(600, targetCamRef.current.panY + worldDz));
          }
        }}
        onPointerUp={(event) => {
          const drag = dragRef.current;
          if (!drag || drag.pointerId !== event.pointerId) return;
          dragRef.current = null;
          setIsDragging(false);
          event.currentTarget.style.cursor = hoveredServiceRef.current ? "grab" : "default";
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          if (drag.mode === "ORBIT") {
            callbacksRef.current.onCameraChange({
              yaw: targetCamRef.current.yaw,
              pitch: targetCamRef.current.pitch,
            });
          } else if (drag.mode === "NODE") {
            if (!drag.moved) {
              callbacksRef.current.onSelect(drag.serviceId);
            } else {
              const deltaWx = drag.currentWx - drag.startWx;
              const deltaWz = drag.currentWz - drag.startWz;
              if (Math.abs(deltaWx) >= 1 || Math.abs(deltaWz) >= 1) {
                callbacksRef.current.onMoveNode?.(drag.serviceId, deltaWx, deltaWz);
              }
            }
          } else {
            if (!drag.moved && event.button === 0) {
              const hitEdge = callbacksRef.current.onSelectEdge
                ? raycastEdgeAt(event.clientX, event.clientY)
                : null;
              if (hitEdge) {
                callbacksRef.current.onSelectEdge?.(hitEdge);
              } else {
                callbacksRef.current.onSelect("");
              }
            } else if (drag.moved) {
              callbacksRef.current.onPanChange({
                x: Math.round(targetCamRef.current.panX),
                y: Math.round(targetCamRef.current.panY),
              });
            }
          }
        }}
        onPointerCancel={() => {
          dragRef.current = null;
          setIsDragging(false);
        }}
        onPointerLeave={(event) => {
          if (!dragRef.current && hoveredServiceRef.current !== null) {
            hoveredServiceRef.current = null;
            event.currentTarget.style.cursor = "default";
          }
        }}
        onDragOver={(event) => {
          if (busy) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
          const hit = raycastServiceAt(event.clientX, event.clientY);
          if (hit !== dropHoverService) setDropHoverService(hit);
        }}
        onDragLeave={() => {
          setDropHoverService(null);
        }}
        onDrop={(event) => {
          event.preventDefault();
          const hit = raycastServiceAt(event.clientX, event.clientY) ?? dropHoverService;
          setDropHoverService(null);
          const toolId =
            event.dataTransfer.getData("application/x-mavis-studio-tool") ||
            event.dataTransfer.getData("text/plain");
          if (hit && toolId && callbacksRef.current.onDropTool) {
            callbacksRef.current.onDropTool(toolId, hit);
          }
        }}
      />
    </div>
  );
}
