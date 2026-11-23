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
  onCameraChange: (next: { yaw: number; pitch: number }) => void;
  onZoomChange: (next: number) => void;
  onPanChange: (next: { x: number; y: number }) => void;
  onMoveNode?: (service: string, deltaWx: number, deltaWz: number) => void;
  onSelect: (service: string) => void;
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

type ThreeModule = typeof import("three");

type AnimatedPacket = {
  mesh: THREE.Mesh;
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
};

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
  const dotSize = 14 * dpr;
  const gap = 8 * dpr;
  const pillW = padX + dotSize + gap + textW + gap + badgeW + padX;
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

  // Left role chip
  const chipX = x + padX;
  const chipY = y + (pillH - dotSize) / 2;
  drawRoundedRect(ctx, chipX, chipY, dotSize, dotSize, styleId === "blueprint" ? 3 * dpr : dotSize / 2);
  ctx.fillStyle = node.palette.pillChipBg;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(chipX + dotSize / 2, chipY + dotSize / 2, 3.2 * dpr, 0, Math.PI * 2);
  ctx.fillStyle = node.palette.pillIconColor;
  ctx.fill();

  // Label text
  ctx.font = font;
  ctx.fillStyle = node.palette.pillTextFill;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText(text, chipX + dotSize + gap, y + pillH / 2 + 0.5 * dpr);

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
 * Encodes UML 2.5 stereotype («gateway», «service», «database», «broker»), crisp technical
 * schematic glyph, and real Docker RAM/lifecycle readout — zero decorative polygons.
 */
function createTopPlateTexture(
  T: ThreeModule,
  node: StudioThreeNode,
  styleId: StudioStyleId,
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

  // Top-left UML stereotype («gateway» / «service» / «database» / «broker»)
  const stereotype =
    node.stereotype ??
    (node.archetype === "GATEWAY"
      ? "«gateway»"
      : node.archetype === "DATABASE"
        ? "«database»"
        : node.archetype === "QUEUE"
          ? "«broker»"
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
  texture.minFilter = T.LinearFilter;
  texture.magFilter = T.LinearFilter;
  return texture;
}

/**
 * Crisp 3D vector architectural trust zone (UML Deployment Environment / CodeCity District).
 * Uses uniform-dash 3D vector lines + a fixed-scale non-stretched header tab centered on the
 * outer top rim so dashes never stretch and nodes never cover the zone label.
 */
function createZonePlateGroup(
  T: ThreeModule,
  title: string,
  width: number,
  depth: number,
  accentHex: string,
  isLight: boolean,
): THREE.Group {
  const group = new T.Group();
  const hw = width / 2;
  const hd = depth / 2;
  const r = Math.min(0.24, hw * 0.25, hd * 0.25);

  // Rounded rectangle shape in XY -> rotated onto XZ floor
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

  // Subtle tinted architectural floor fill
  const fillGeo = new T.ShapeGeometry(shape, 8);
  fillGeo.rotateX(-Math.PI / 2);
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
  const pts2d = shape.getPoints(12);
  const pts3d = pts2d.map((p) => new T.Vector3(p.x, 0.012, -p.y));
  const borderGeo = new T.BufferGeometry().setFromPoints(pts3d);
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
  tex.minFilter = T.LinearFilter;
  const badgeH = 0.28;
  const badgeW = Math.min(width - 0.2, badgeH * (canvas.width / canvas.height));
  const badgeMesh = new T.Mesh(
    new T.PlaneGeometry(badgeW, badgeH),
    new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
  );
  badgeMesh.rotation.x = -Math.PI / 2;
  badgeMesh.position.set(0, 0.016, -hd);
  badgeMesh.renderOrder = 3;
  group.add(badgeMesh);

  return group;
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
  // Recessed dark telemetry bezel slot on front wall of container/gateway
  const bezel = new T.Mesh(
    new T.BoxGeometry(panelW, 0.11, 0.018),
    new T.MeshStandardMaterial({
      color: new T.Color(isDark ? "#020617" : "#0f172a"),
      roughness: 0.45,
      metalness: 0.25,
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
    new T.BoxGeometry(0.05, 0.05, 0.022),
    new T.MeshStandardMaterial({
      color: new T.Color(ledColor),
      emissive: new T.Color(ledColor),
      emissiveIntensity: isDark ? 1.1 : 0.7,
      roughness: 0.2,
    }),
  );
  led.position.set(-panelW / 2 + 0.055, panelY, frontZ + 0.004);
  led.userData = { serviceId: node.id };
  parent.add(led);

  // Data-driven RAM utilization bar inside front bezel (CodeCity / live Docker memory mapping)
  const trackW = Math.max(0.14, panelW - 0.17);
  const trackCenterX = 0.045;
  const track = new T.Mesh(
    new T.BoxGeometry(trackW, 0.036, 0.014),
    new T.MeshBasicMaterial({ color: new T.Color("#334155") }),
  );
  track.position.set(trackCenterX, panelY - 0.012, frontZ + 0.005);
  track.userData = { serviceId: node.id };
  parent.add(track);

  const ramPct = node.ramPct ?? (node.isStopped ? 0 : null);
  if (ramPct !== null && ramPct > 0) {
    const fillW = Math.max(0.03, (trackW * Math.min(100, ramPct)) / 100);
    const ramColor = ramPct >= 85 ? "#f43f5e" : ramPct >= 70 ? "#f59e0b" : "#10b981";
    const fill = new T.Mesh(
      new T.BoxGeometry(fillW, 0.038, 0.018),
      new T.MeshStandardMaterial({
        color: new T.Color(ramColor),
        emissive: new T.Color(ramColor),
        emissiveIntensity: isDark ? 0.9 : 0.55,
        roughness: 0.25,
      }),
    );
    fill.position.set(trackCenterX - trackW / 2 + fillW / 2, panelY - 0.012, frontZ + 0.008);
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
      new T.BoxGeometry(cpuFillW, 0.018, 0.018),
      new T.MeshStandardMaterial({
        color: new T.Color(cpuColor),
        emissive: new T.Color(cpuColor),
        emissiveIntensity: 0.65,
        roughness: 0.3,
      }),
    );
    cpuFill.position.set(trackCenterX - trackW / 2 + cpuFillW / 2, panelY + 0.028, frontZ + 0.008);
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
 * Authoritative SE-Standard 3D Node Builder:
 * - UML 2.5 Deployment Node + Service Boundary Plinth (host/cgroup boundary)
 * - C4 Container Stereotypes (Gateway Router / Microservice Container Pods / Database Cylinder / EIP Broker)
 * - CodeCity / Kiali Data-Driven Telemetry (real replica pod units 1..3, live RAM/CPU gauges, pause cage, stopped collapse)
 */
function buildServiceRig(
  T: ThreeModule,
  node: StudioThreeNode,
  styleId: StudioStyleId,
): AnimatedNodeRig {
  const group = new T.Group();
  const wx = node.wx * WORLD_SCALE;
  const wz = node.wz * WORLD_SCALE;
  group.position.set(wx, 0, wz);
  group.userData = { serviceId: node.id };

  const isDark = styleId === "control";
  const isPop = styleId === "pop";
  const isBlueprint = styleId === "blueprint";

  const plinthMat = new T.MeshStandardMaterial({
    color: new T.Color(isDark ? "#1e293b" : isBlueprint ? "#e0f2fe" : "#e2e8f0"),
    roughness: isDark ? 0.52 : 0.72,
    metalness: isDark ? 0.28 : 0.08,
  });

  const chassisMat = new T.MeshStandardMaterial({
    color: new T.Color(node.isStopped ? (isDark ? "#1e293b" : "#cbd5e1") : node.palette.cardFill),
    roughness: isPop ? 0.58 : isDark ? 0.32 : isBlueprint ? 0.72 : 0.42,
    metalness: isDark ? 0.34 : isPop ? 0.06 : 0.14,
    emissive: new T.Color(isDark ? node.palette.iconBg : node.isCritical ? "#4c0519" : "#000000"),
    emissiveIntensity: isDark ? 0.2 : node.isCritical ? 0.12 : 0,
    transparent: isBlueprint,
    opacity: isBlueprint ? 0.94 : 1,
  });

  const capMat = new T.MeshStandardMaterial({
    color: new T.Color(node.palette.iconBg),
    roughness: isDark ? 0.28 : 0.38,
    metalness: isDark ? 0.4 : 0.14,
  });

  const accentMat = new T.MeshStandardMaterial({
    color: new T.Color(node.palette.accent),
    roughness: 0.28,
    metalness: isDark ? 0.48 : 0.22,
    emissive: new T.Color(node.palette.accent),
    emissiveIntensity: isDark ? 0.5 : node.isCritical || node.isWarning ? 0.28 : 0.1,
  });

  const edgeMat = new T.LineBasicMaterial({
    color: new T.Color(node.palette.stroke),
    transparent: !isPop,
    opacity: isPop ? 0.95 : isDark ? 0.85 : isBlueprint ? 0.85 : 0.55,
  });

  const sculptureGroup = new T.Group();
  group.add(sculptureGroup);

  // 1. Service Boundary Plinth (UML 2.5 Execution Environment / Docker cgroup host boundary)
  const plinthW = 1.24;
  const plinthH = 0.085;
  const plinthD = 0.92;
  addOutlinedMesh(
    T,
    sculptureGroup,
    createRoundedSlabGeo(T, plinthW, plinthH, plinthD, 0.1, 0.012),
    plinthMat,
    edgeMat,
    [0, 0, 0],
    node.id,
  );
  // Color-coded stereotype rail along front rim of boundary plinth
  const rail = new T.Mesh(new T.BoxGeometry(plinthW - 0.22, 0.028, 0.022), accentMat);
  rail.position.set(0, plinthH - 0.025, plinthD / 2 + 0.002);
  rail.userData = { serviceId: node.id };
  sculptureGroup.add(rail);

  let topY = 0.62;
  const topTex = createTopPlateTexture(T, node, styleId);
  const topPlateMat = new T.MeshBasicMaterial({
    map: topTex,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });

  if (node.archetype === "GATEWAY") {
    // CNCF / Cloudcraft 1U/2U Edge Ingress Router Chassis
    const gwW = 1.06;
    const gwH = node.isStopped ? 0.15 : 0.34;
    const gwD = 0.72;
    addOutlinedMesh(
      T,
      sculptureGroup,
      createRoundedSlabGeo(T, gwW, gwH, gwD, 0.07, 0.014),
      chassisMat,
      edgeMat,
      [0, plinthH, 0],
      node.id,
    );
    // Crisp top technical plate («gateway»)
    const topPlate = new T.Mesh(new T.PlaneGeometry(gwW - 0.12, gwD - 0.12), topPlateMat);
    topPlate.rotation.x = -Math.PI / 2;
    topPlate.position.set(0, plinthH + gwH + 0.004, 0);
    topPlate.userData = { serviceId: node.id };
    sculptureGroup.add(topPlate);

    if (!node.isStopped) {
      attachFrontTelemetryBar(T, sculptureGroup, node, gwW - 0.18, plinthH + gwH * 0.5, gwD / 2 + 0.004, isDark);
    }
    topY = plinthH + gwH + 0.06;
  } else if (node.archetype === "DATABASE") {
    // Canonical C4 / UML Multi-Platter Data Store Cylinder
    const cylR = 0.42;
    const tierH = node.isStopped ? 0.1 : 0.17;
    const tiers = node.isStopped ? 1 : 3;
    for (let i = 0; i < tiers; i++) {
      const y = plinthH + tierH / 2 + i * (tierH + 0.04);
      addOutlinedMesh(
        T,
        sculptureGroup,
        new T.CylinderGeometry(cylR, cylR, tierH, 28),
        i === tiers - 1 ? capMat : chassisMat,
        edgeMat,
        [0, y, 0],
        node.id,
      );
      if (i < tiers - 1) {
        const ring = new T.Mesh(
          new T.CylinderGeometry(cylR - 0.03, cylR - 0.03, 0.035, 28),
          accentMat,
        );
        ring.position.set(0, y + tierH / 2 + 0.02, 0);
        ring.userData = { serviceId: node.id };
        sculptureGroup.add(ring);
      }
    }
    const stackTop = plinthH + tiers * tierH + (tiers - 1) * 0.04;
    const topDisk = new T.Mesh(new T.CircleGeometry(cylR - 0.04, 28), topPlateMat);
    topDisk.rotation.x = -Math.PI / 2;
    topDisk.position.set(0, stackTop + 0.004, 0);
    topDisk.userData = { serviceId: node.id };
    sculptureGroup.add(topDisk);
    topY = stackTop + 0.06;
  } else if (node.archetype === "QUEUE") {
    // Canonical EIP Horizontal Message Broker Conduit on Dual Cradles
    const cradleMat = capMat;
    for (const cx of [-0.32, 0.32]) {
      addOutlinedMesh(
        T,
        sculptureGroup,
        new T.BoxGeometry(0.14, 0.18, 0.56),
        cradleMat,
        edgeMat,
        [cx, plinthH + 0.09, 0],
        node.id,
      );
    }
    const pipeY = plinthH + 0.34;
    addOutlinedMesh(
      T,
      sculptureGroup,
      new T.CylinderGeometry(0.24, 0.24, 0.96, 24),
      chassisMat,
      edgeMat,
      [0, pipeY, 0],
      node.id,
      [0, 0, Math.PI / 2],
    );
    for (const rx of [-0.42, 0, 0.42]) {
      const collar = new T.Mesh(
        new T.CylinderGeometry(0.27, 0.27, 0.055, 24),
        accentMat,
      );
      collar.rotation.z = Math.PI / 2;
      collar.position.set(rx, pipeY, 0);
      collar.userData = { serviceId: node.id };
      sculptureGroup.add(collar);
    }
    topY = pipeY + 0.28;
  } else {
    // UML 2.5 Deployment Node + Real Docker Replica Container Pods (1..3 side-by-side inside Service Boundary)
    const podCount = node.isStopped ? 1 : Math.max(1, Math.min(3, node.replicas || 1));
    const podH = node.isStopped ? 0.14 : 0.44;
    const podD = 0.68;
    const spanW = 1.04;
    const gap = 0.06;
    const podW = (spanW - gap * (podCount - 1)) / podCount;

    for (let i = 0; i < podCount; i++) {
      const px = -spanW / 2 + podW / 2 + i * (podW + gap);
      const podGeo = createRoundedSlabGeo(T, podW, podH, podD, 0.055, 0.013);
      addOutlinedMesh(T, sculptureGroup, podGeo, chassisMat, edgeMat, [px, plinthH, 0], node.id);

      // Clean subtle top trim bezel strip
      const capStrip = new T.Mesh(new T.BoxGeometry(podW - 0.06, 0.02, 0.04), accentMat);
      capStrip.position.set(px, plinthH + podH - 0.015, podD / 2 - 0.045);
      capStrip.userData = { serviceId: node.id };
      sculptureGroup.add(capStrip);

      // Data-driven RAM + CPU telemetry gauge recessed into the front face of each running pod
      if (!node.isStopped) {
        const gaugeHolder = new T.Group();
        gaugeHolder.position.set(px, 0, 0);
        attachFrontTelemetryBar(
          T,
          gaugeHolder,
          node,
          Math.max(0.22, podW - 0.08),
          plinthH + podH * 0.48,
          podD / 2 + 0.004,
          isDark,
        );
        sculptureGroup.add(gaugeHolder);
      }

      // Top plate decal on single pod (or compact schematic on each twin/triple replica pod)
      const plateW = Math.max(0.22, podW - 0.08);
      const plateD = Math.min(podD - 0.1, plateW * 0.72 + 0.18);
      const plate = new T.Mesh(new T.PlaneGeometry(plateW, plateD), topPlateMat);
      plate.rotation.x = -Math.PI / 2;
      plate.position.set(px, plinthH + podH + 0.004, -0.02);
      plate.userData = { serviceId: node.id };
      sculptureGroup.add(plate);
    }

    // Translucent Amber Freeze Enclosure when Docker PAUSE is active
    if (node.isPaused) {
      const cageGeo = new T.BoxGeometry(spanW + 0.1, podH + 0.1, podD + 0.1);
      const cageFill = new T.Mesh(
        cageGeo,
        new T.MeshBasicMaterial({
          color: new T.Color("#f59e0b"),
          transparent: true,
          opacity: 0.1,
          depthWrite: false,
        }),
      );
      cageFill.position.set(0, plinthH + (podH + 0.06) / 2, 0);
      cageFill.userData = { serviceId: node.id };
      const cageWire = new T.LineSegments(
        new T.EdgesGeometry(cageGeo),
        new T.LineBasicMaterial({ color: new T.Color("#f59e0b") }),
      );
      cageFill.add(cageWire);
      sculptureGroup.add(cageFill);
    }

    topY = plinthH + podH + 0.08;
  }

  // Rectangular Architectural Selection / Drop-Target / Fault Boundary Halo around Plinth
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
            : "#0056D2";
    const outerW = plinthW + 0.16;
    const outerD = plinthD + 0.16;
    const innerW = plinthW + 0.05;
    const innerD = plinthD + 0.05;
    const outerShape = new T.Shape();
    outerShape.moveTo(-outerW / 2, -outerD / 2);
    outerShape.lineTo(outerW / 2, -outerD / 2);
    outerShape.lineTo(outerW / 2, outerD / 2);
    outerShape.lineTo(-outerW / 2, outerD / 2);
    outerShape.closePath();
    const hole = new T.Path();
    hole.moveTo(-innerW / 2, -innerD / 2);
    hole.lineTo(innerW / 2, -innerD / 2);
    hole.lineTo(innerW / 2, innerD / 2);
    hole.lineTo(-innerW / 2, innerD / 2);
    hole.closePath();
    outerShape.holes.push(hole);

    const haloGeo = new T.ShapeGeometry(outerShape);
    const haloMat = new T.MeshBasicMaterial({
      color: new T.Color(haloColor),
      side: T.DoubleSide,
      transparent: true,
      opacity: 0.88,
    });
    halo = new T.Mesh(haloGeo, haloMat);
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.016;
    halo.userData = { serviceId: node.id };
    group.add(halo);
  }

  // Crisp 3D Floating Service Pill Sprite
  const labelSprite = createNodeLabelSprite(T, node, styleId);
  labelSprite.position.set(0, topY + 0.30, 0);
  labelSprite.userData = { serviceId: node.id };
  group.add(labelSprite);

  return {
    id: node.id,
    group,
    baseY: 0,
    phase: (node.wx * 0.013 + node.wz * 0.017) % (Math.PI * 2),
    active: !node.isStopped,
    halo,
    replicaPods: [],
  };
}

function disposeObjectTree(T: ThreeModule, obj: THREE.Object3D) {
  obj.traverse((child) => {
    const meshLike = child as THREE.Mesh;
    if (meshLike.geometry) {
      meshLike.geometry.dispose();
    }
    const mat = meshLike.material;
    if (Array.isArray(mat)) {
      mat.forEach((m) => {
        const spriteMat = m as THREE.SpriteMaterial;
        if (spriteMat.map) spriteMat.map.dispose();
        m.dispose();
      });
    } else if (mat) {
      const spriteMat = mat as THREE.SpriteMaterial;
      if (spriteMat.map) spriteMat.map.dispose();
      mat.dispose();
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
  onCameraChange,
  onZoomChange,
  onPanChange,
  onMoveNode,
  onSelect,
  onDropTool,
  onReadyChange,
}: StudioThreeStageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tourBoxRef = useRef<HTMLDivElement>(null);
  const [hoveredService, setHoveredService] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dropHoverService, setDropHoverService] = useState<string | null>(null);
  const [engineReady, setEngineReady] = useState(false);

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
  const packetsRef = useRef<AnimatedPacket[]>([]);
  const nodeRigsRef = useRef<AnimatedNodeRig[]>([]);
  const edgeRigsRef = useRef<EdgeRig[]>([]);
  const liveNodePosRef = useRef<Map<string, { wx: number; wz: number }>>(new Map());
  const raycasterRef = useRef<THREE.Raycaster | null>(null);
  const ndcRef = useRef<THREE.Vector2 | null>(null);
  const groundPlaneRef = useRef<THREE.Plane | null>(null);
  const hitVecRef = useRef<THREE.Vector3 | null>(null);
  const lastTourRectRef = useRef({ l: -1, t: -1, w: -1, h: -1 });
  const viewportSizeRef = useRef({ w: 1, h: 1 });
  const wheelActiveUntilRef = useRef(0);
  const zoomSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Smooth target vs current camera state (mutated inside RAF with zero React re-renders)
  const targetCamRef = useRef({ yaw: camera.yaw, pitch: camera.pitch, zoom, panX: pan.x, panY: pan.y });
  const liveCamRef = useRef({ yaw: camera.yaw, pitch: camera.pitch, zoom, panX: pan.x, panY: pan.y });
  const dragRef = useRef<StageDrag | null>(null);
  const callbacksRef = useRef({ onCameraChange, onZoomChange, onPanChange, onMoveNode, onSelect, onDropTool });
  callbacksRef.current = { onCameraChange, onZoomChange, onPanChange, onMoveNode, onSelect, onDropTool };

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
    let rafId = 0;
    let resizeObserver: ResizeObserver | null = null;
    const boundCanvas = canvasRef.current;

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

    void import("three")
      .then((T) => {
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
        renderer.toneMappingExposure = 1.06;

        const scene = new T.Scene();
        const width = Math.max(1, container.clientWidth);
        const height = Math.max(1, container.clientHeight);
        viewportSizeRef.current = { w: width, h: height };
        renderer.setSize(width, height, false);

        const perspCam = new T.PerspectiveCamera(34, width / height, 0.1, 140);
        // Synchronous on-demand render hook used by captureStudioImage() without preserveDrawingBuffer GPU copy penalty
        (canvas as HTMLCanvasElement & { __mavisRenderNow?: () => void }).__mavisRenderNow = () => {
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
          const w = Math.max(1, container.clientWidth);
          const h = Math.max(1, container.clientHeight);
          viewportSizeRef.current = { w, h };
          renderer.setSize(w, h, false);
          perspCam.aspect = w / h;
          perspCam.updateProjectionMatrix();
        });
        resizeObserver.observe(container);

        setEngineReady(true);
        onReadyChange?.(true);

        let lastTime = performance.now();
        const scratchVec = new T.Vector3();

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

          // Subtle alive animation on 3D traffic packets & halos
          const tSec = now * 0.001;
          for (const pkt of packetsRef.current) {
            const u = (tSec * pkt.speed + pkt.phase) % 1;
            pkt.curve.getPoint(u, pkt.mesh.position);
          }
          for (const rig of nodeRigsRef.current) {
            if (rig.halo) {
              const pulse = 1 + Math.sin(tSec * 3.2 + rig.phase) * 0.03;
              rig.halo.scale.set(pulse, pulse, 1);
            }
          }

          renderer.render(scene, perspCam);

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
      boundCanvas?.removeEventListener("wheel", handleWheel);
      if (zoomSyncTimerRef.current) {
        clearTimeout(zoomSyncTimerRef.current);
        zoomSyncTimerRef.current = null;
      }
      resizeObserver?.disconnect();
      if (threeRef.current && contentGroupRef.current) {
        disposeObjectTree(threeRef.current, contentGroupRef.current);
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
      liveNodePosRef.current.clear();
    };
  }, [onReadyChange]);

  // Rebuild 3D meshes, deck, edges, and lights whenever topology/telemetry/theme changes
  useEffect(() => {
    const T = threeRef.current;
    const contentGroup = contentGroupRef.current;
    const lights = lightsRef.current;
    if (!engineReady || !T || !contentGroup || !lights) return;

    while (contentGroup.children.length > 0) {
      const child = contentGroup.children[0]!;
      contentGroup.remove(child);
      disposeObjectTree(T, child);
    }
    packetsRef.current = [];
    nodeRigsRef.current = [];
    edgeRigsRef.current = [];
    liveNodePosRef.current.clear();

    const styleCfg = STUDIO_STYLES[styleId];
    const isLight = !styleCfg.isDark;

    // Theme-tuned lighting rig
    if (styleId === "control") {
      lights.hemi.color.set("#cbd5e1");
      lights.hemi.groundColor.set("#0f172a");
      lights.hemi.intensity = 1.05;
      lights.key.color.set("#e0f2fe");
      lights.key.intensity = 1.15;
      lights.rim.color.set("#38bdf8");
      lights.rim.intensity = 0.75;
    } else if (styleId === "pop") {
      lights.hemi.color.set("#ffffff");
      lights.hemi.groundColor.set("#fef3c7");
      lights.hemi.intensity = 1.35;
      lights.key.color.set("#ffffff");
      lights.key.intensity = 1.05;
      lights.rim.color.set("#bae6fd");
      lights.rim.intensity = 0.45;
    } else if (styleId === "blueprint") {
      lights.hemi.color.set("#f0f9ff");
      lights.hemi.groundColor.set("#bfdbfe");
      lights.hemi.intensity = 1.3;
      lights.key.color.set("#ffffff");
      lights.key.intensity = 1.05;
      lights.rim.color.set("#60a5fa");
      lights.rim.intensity = 0.55;
    } else {
      lights.hemi.color.set("#ffffff");
      lights.hemi.groundColor.set("#dbeafe");
      lights.hemi.intensity = 1.22;
      lights.key.color.set("#ffffff");
      lights.key.intensity = 1.25;
      lights.rim.color.set("#93c5fd");
      lights.rim.intensity = 0.5;
    }

    // 1. Real 3D Platform Deck Slab + Surface Grid Lines
    const minX = deckBounds.minX * WORLD_SCALE;
    const maxX = deckBounds.maxX * WORLD_SCALE;
    const minZ = deckBounds.minZ * WORLD_SCALE;
    const maxZ = deckBounds.maxZ * WORLD_SCALE;
    const deckW = Math.max(4.6, maxX - minX);
    const deckD = Math.max(3.6, maxZ - minZ);
    const deckCx = (minX + maxX) / 2;
    const deckCz = (minZ + maxZ) / 2;
    const deckH = 0.22;

    const deckTopMat = new T.MeshStandardMaterial({
      color: new T.Color(styleCfg.deckTopFill),
      roughness: styleId === "control" ? 0.52 : 0.78,
      metalness: styleId === "control" ? 0.2 : 0.04,
    });
    const deckSideMat = new T.MeshStandardMaterial({
      color: new T.Color(styleCfg.deckRimFill),
      roughness: 0.72,
      metalness: 0.06,
    });
    const deckGeo = new T.BoxGeometry(deckW, deckH, deckD);
    const deckMesh = new T.Mesh(deckGeo, [
      deckSideMat,
      deckSideMat,
      deckTopMat,
      deckSideMat,
      deckSideMat,
      deckSideMat,
    ]);
    deckMesh.position.set(deckCx, -deckH / 2, deckCz);
    deckMesh.receiveShadow = true;
    const deckEdgeMat = new T.LineBasicMaterial({
      color: new T.Color(styleCfg.deckStroke),
      transparent: styleId !== "pop",
      opacity: styleId === "pop" ? 1 : isLight ? 0.85 : 0.65,
    });
    deckMesh.add(new T.LineSegments(new T.EdgesGeometry(deckGeo), deckEdgeMat));
    contentGroup.add(deckMesh);

    // Uniform subtle CAD drafting grid across the deck surface
    const gridVerts: number[] = [];
    const gridStep = 1.0;
    for (let gx = Math.ceil(minX / gridStep) * gridStep; gx <= maxX; gx += gridStep) {
      gridVerts.push(gx, 0.006, minZ, gx, 0.006, maxZ);
    }
    for (let gz = Math.ceil(minZ / gridStep) * gridStep; gz <= maxZ; gz += gridStep) {
      gridVerts.push(minX, 0.006, gz, maxX, 0.006, gz);
    }
    if (gridVerts.length > 0) {
      const gridGeo = new T.BufferGeometry();
      gridGeo.setAttribute("position", new T.Float32BufferAttribute(gridVerts, 3));
      const gridLine = new T.LineSegments(
        gridGeo,
        new T.LineBasicMaterial({
          color: new T.Color(styleCfg.deckGridStroke),
          transparent: true,
          opacity: isLight ? 0.16 : 0.14,
        }),
      );
      contentGroup.add(gridLine);
    }

    // Dynamic Architectural Trust Zones (UML 2.5 Deployment Environment / C4 System Boundary / CodeCity Districts)
    const rawZones = [
      {
        key: "EDGE",
        title: "EDGE / INGRESS",
        accent: isLight ? "#0284c7" : "#38bdf8",
        members: nodes.filter((n) => n.archetype === "GATEWAY"),
      },
      {
        key: "CORE",
        title: "CORE SERVICES · DOCKER NET",
        accent: isLight ? "#4f46e5" : "#818cf8",
        members: nodes.filter((n) => n.archetype === "SERVICE"),
      },
      {
        key: "DATA",
        title: "DATA & MESSAGING",
        accent: isLight ? "#0d9488" : "#2dd4bf",
        members: nodes.filter((n) => n.archetype === "DATABASE" || n.archetype === "QUEUE"),
      },
    ].filter((z) => z.members.length > 0);

    type ZoneRect = {
      key: string;
      title: string;
      accent: string;
      nodeMinX: number;
      nodeMaxX: number;
      bx0: number;
      bx1: number;
      bz0: number;
      bz1: number;
    };
    const zoneRects: ZoneRect[] = rawZones.map((zone) => {
      let zMinX = Infinity;
      let zMaxX = -Infinity;
      let zMinZ = Infinity;
      let zMaxZ = -Infinity;
      for (const m of zone.members) {
        const mx = m.wx * WORLD_SCALE;
        const mz = m.wz * WORLD_SCALE;
        zMinX = Math.min(zMinX, mx);
        zMaxX = Math.max(zMaxX, mx);
        zMinZ = Math.min(zMinZ, mz);
        zMaxZ = Math.max(zMaxZ, mz);
      }
      // Generous clearance outside 1.24x0.92 plinths + extra top headroom for the rim header badge
      const padX = 0.96;
      const padTopZ = 1.08;
      const padBottomZ = 0.86;
      return {
        key: zone.key,
        title: zone.title,
        accent: zone.accent,
        nodeMinX: zMinX,
        nodeMaxX: zMaxX,
        bx0: Math.max(minX + 0.16, zMinX - padX),
        bx1: Math.min(maxX - 0.16, zMaxX + padX),
        bz0: Math.max(minZ + 0.16, zMinZ - padTopZ),
        bz1: Math.min(maxZ - 0.16, zMaxZ + padBottomZ),
      };
    });

    // Keep adjacent horizontal zones cleanly separated so dashed borders never collide
    const edgeRect = zoneRects.find((z) => z.key === "EDGE");
    const coreRect = zoneRects.find((z) => z.key === "CORE");
    if (edgeRect && coreRect && edgeRect.nodeMaxX < coreRect.nodeMinX && edgeRect.bx1 > coreRect.bx0 - 0.16) {
      const splitX = (edgeRect.nodeMaxX + coreRect.nodeMinX) / 2;
      edgeRect.bx1 = Math.max(edgeRect.nodeMaxX + 0.68, splitX - 0.1);
      coreRect.bx0 = Math.min(coreRect.nodeMinX - 0.68, splitX + 0.1);
    }

    for (const zr of zoneRects) {
      const zw = Math.max(1.75, zr.bx1 - zr.bx0);
      const zd = Math.max(1.65, zr.bz1 - zr.bz0);
      const zoneGroup = createZonePlateGroup(T, zr.title, zw, zd, zr.accent, isLight);
      zoneGroup.position.set((zr.bx0 + zr.bx1) / 2, 0, (zr.bz0 + zr.bz1) / 2);
      contentGroup.add(zoneGroup);
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
      const rig = buildServiceRig(T, effectiveNode, styleId);
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

      const conduitMat = new T.MeshStandardMaterial({
        color: new T.Color(edge.color),
        emissive: new T.Color(edge.color),
        emissiveIntensity: styleId === "control" ? 0.52 : 0.16,
        roughness: 0.3,
        metalness: 0.18,
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
        contentGroup.add(asyncLine);
      } else {
        // UML Sync HTTP/gRPC connector: solid continuous conduit
        const tubeGeo = new T.TubeGeometry(curve, 28, tubeRadius, 10, false);
        tubeMesh = new T.Mesh(tubeGeo, conduitMat);
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

      // Animated Glowing 3D Packet Sphere matching edge health state
      const pktColor = edge.isSevered
        ? "#f43f5e"
        : edge.isDegraded
          ? "#f59e0b"
          : styleId === "control"
            ? "#34d399"
            : "#10b981";
      const pktGeo = new T.SphereGeometry(Math.max(0.07, tubeRadius * 1.9), 12, 12);
      const pktMat = new T.MeshBasicMaterial({ color: new T.Color(pktColor) });
      const pktMesh = new T.Mesh(pktGeo, pktMat);
      contentGroup.add(pktMesh);
      packetsRef.current.push({
        mesh: pktMesh,
        curve,
        speed: 1 / Math.max(0.8, edge.speedSec ?? 1.8),
        phase: (edge.id.length * 0.19) % 1,
      });

      // Floating Traffic Metric Badge at Cleared Apex
      let badgeSprite: THREE.Sprite | undefined;
      if (edge.label) {
        badgeSprite = createEdgeBadgeSprite(T, edge.label, edge, isLight);
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
        ref={canvasRef}
        data-testid="studio-3d-webgl"
        data-studio-webgl-canvas
        data-studio-engine="three-webgl"
        data-studio-style={styleId}
        data-camera-yaw={String(Math.round(((((camera.yaw * 180) / Math.PI) % 360) + 360) % 360))}
        data-camera-pitch={String(Math.round((Math.max(THREE_PITCH_MIN, Math.min(THREE_PITCH_MAX, camera.pitch)) * 180) / Math.PI))}
        aria-label="Live 3D WebGL runtime topology"
        className={`block h-full w-full touch-none select-none ${
          isDragging ? "cursor-grabbing" : hoveredService ? "cursor-grab" : "cursor-default"
        }`}
        onContextMenu={(event) => event.preventDefault()}
        onPointerDown={(event) => {
          if (![0, 1, 2].includes(event.button)) return;
          event.preventDefault();

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
            if (hit !== hoveredService) setHoveredService(hit);
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
              callbacksRef.current.onSelect("");
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
        onPointerLeave={() => {
          if (!dragRef.current) setHoveredService(null);
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
          const toolId = event.dataTransfer.getData("application/x-mavis-studio-tool");
          if (hit && toolId && callbacksRef.current.onDropTool) {
            callbacksRef.current.onDropTool(toolId, hit);
          }
        }}
      />
    </div>
  );
}
