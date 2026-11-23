"use client";

import { useEffect, useRef, useState } from "react";
import type * as THREE from "three";
import { STUDIO_STYLES, type StudioNodeVisualPalette, type StudioStyleId } from "./studio-styles";

export type StudioThreeNode = {
  id: string;
  label: string;
  archetype: "DATABASE" | "GATEWAY" | "QUEUE" | "SERVICE";
  wx: number;
  wz: number;
  replicas: number;
  isStopped: boolean;
  isCritical: boolean;
  isWarning: boolean;
  isSelected: boolean;
  isDropTarget: boolean;
  palette: StudioNodeVisualPalette;
};

export type StudioThreeEdge = {
  id: string;
  from: string;
  to: string;
  kind: "static" | "observed";
  color: string;
  dashed: boolean;
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
  line?: THREE.Line | undefined;
  tubeMesh?: THREE.Mesh | undefined;
  arrowMesh?: THREE.Mesh | undefined;
  badgeSprite?: THREE.Sprite | undefined;
  curve?: THREE.QuadraticBezierCurve3 | undefined;
  isSevered?: boolean | undefined;
};

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
  const badge = node.isStopped ? "0" : `×${node.replicas}`;
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
  const edges = new T.LineSegments(new T.EdgesGeometry(geometry, 24), edgeMaterial);
  edges.userData = { serviceId };
  mesh.add(edges);
  parent.add(mesh);
  return mesh;
}

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

  const bodyMat = new T.MeshStandardMaterial({
    color: new T.Color(node.palette.cardFill),
    roughness: isPop ? 0.68 : isDark ? 0.34 : isBlueprint ? 0.82 : 0.46,
    metalness: isDark ? 0.32 : isPop ? 0.04 : 0.1,
    emissive: new T.Color(isDark ? node.palette.iconBg : node.isCritical ? "#4c0519" : "#000000"),
    emissiveIntensity: isDark ? 0.25 : node.isCritical ? 0.12 : 0,
    transparent: isBlueprint,
    opacity: isBlueprint ? 0.94 : 1,
  });

  const roofMat = new T.MeshStandardMaterial({
    color: new T.Color(node.palette.iconBg),
    roughness: isPop ? 0.58 : isDark ? 0.28 : 0.4,
    metalness: isDark ? 0.38 : 0.12,
    emissive: new T.Color(isDark ? node.palette.stroke : "#000000"),
    emissiveIntensity: isDark ? 0.22 : 0,
  });

  const accentMat = new T.MeshStandardMaterial({
    color: new T.Color(node.palette.accent),
    roughness: 0.3,
    metalness: isDark ? 0.45 : 0.2,
    emissive: new T.Color(node.palette.accent),
    emissiveIntensity: isDark ? 0.55 : node.isCritical || node.isWarning ? 0.3 : 0.08,
  });

  const ledMat = new T.MeshStandardMaterial({
    color: new T.Color(node.isStopped ? "#f43f5e" : node.isWarning ? "#f59e0b" : "#10b981"),
    emissive: new T.Color(node.isStopped ? "#f43f5e" : node.isWarning ? "#f59e0b" : "#10b981"),
    emissiveIntensity: isDark ? 0.95 : 0.45,
    roughness: 0.2,
  });

  const edgeMat = new T.LineBasicMaterial({
    color: new T.Color(node.palette.stroke),
    transparent: !isPop,
    opacity: isPop ? 1 : isDark ? 0.9 : isBlueprint ? 0.88 : 0.65,
  });

  const n = node.id.toLowerCase();
  const baseScale = node.isStopped ? 0.92 : 1 + 0.055 * Math.max(0, node.replicas - 1);
  const sculptureGroup = new T.Group();
  sculptureGroup.scale.setScalar(baseScale);
  group.add(sculptureGroup);

  let topY = 0.85;

  if (
    node.archetype === "GATEWAY" ||
    /(gateway|edge|proxy|ingress|cdn|waf)/.test(n)
  ) {
    // True 3D Twin-Pillar Architectural Gateway Arch
    addOutlinedMesh(T, sculptureGroup, new T.BoxGeometry(0.24, 0.64, 0.40), bodyMat, edgeMat, [-0.34, 0.32, 0], node.id);
    addOutlinedMesh(T, sculptureGroup, new T.BoxGeometry(0.24, 0.64, 0.40), bodyMat, edgeMat, [0.34, 0.32, 0], node.id);
    addOutlinedMesh(T, sculptureGroup, new T.BoxGeometry(1.06, 0.22, 0.52), roofMat, edgeMat, [0, 0.75, 0], node.id);
    // 3D Routing Arrow Emblem on Roof
    addOutlinedMesh(T, sculptureGroup, new T.BoxGeometry(0.36, 0.06, 0.09), accentMat, edgeMat, [-0.08, 0.89, 0], node.id);
    addOutlinedMesh(
      T,
      sculptureGroup,
      new T.ConeGeometry(0.11, 0.22, 4),
      accentMat,
      edgeMat,
      [0.2, 0.89, 0],
      node.id,
      [0, 0, -Math.PI / 2],
    );
    topY = 1.05;
  } else if (
    node.archetype === "DATABASE" ||
    /(postgres|mysql|mongo|nosql|redis|cache|s3|storage|elastic|search|\bdb\b)/.test(n)
  ) {
    // True 3D Multi-Platter Database Cylinder Stack
    addOutlinedMesh(T, sculptureGroup, new T.CylinderGeometry(0.46, 0.48, 0.22, 24), bodyMat, edgeMat, [0, 0.11, 0], node.id);
    addOutlinedMesh(T, sculptureGroup, new T.CylinderGeometry(0.41, 0.41, 0.06, 24), accentMat, edgeMat, [0, 0.25, 0], node.id);
    addOutlinedMesh(T, sculptureGroup, new T.CylinderGeometry(0.46, 0.46, 0.22, 24), bodyMat, edgeMat, [0, 0.39, 0], node.id);
    addOutlinedMesh(T, sculptureGroup, new T.CylinderGeometry(0.41, 0.41, 0.06, 24), accentMat, edgeMat, [0, 0.53, 0], node.id);
    addOutlinedMesh(T, sculptureGroup, new T.CylinderGeometry(0.46, 0.46, 0.22, 24), roofMat, edgeMat, [0, 0.67, 0], node.id);
    addOutlinedMesh(T, sculptureGroup, new T.CylinderGeometry(0.16, 0.16, 0.05, 16), ledMat, edgeMat, [0, 0.80, 0], node.id);
    topY = 0.92;
  } else if (
    node.archetype === "QUEUE" ||
    /(kafka|rabbit|amqp|broker|queue|\bmq\b|stream)/.test(n)
  ) {
    // True 3D Horizontal Message Conduit Pipe on Dual Cradles
    addOutlinedMesh(T, sculptureGroup, new T.BoxGeometry(0.16, 0.22, 0.52), bodyMat, edgeMat, [-0.28, 0.11, 0], node.id);
    addOutlinedMesh(T, sculptureGroup, new T.BoxGeometry(0.16, 0.22, 0.52), bodyMat, edgeMat, [0.28, 0.11, 0], node.id);
    addOutlinedMesh(
      T,
      sculptureGroup,
      new T.CylinderGeometry(0.28, 0.28, 0.98, 20),
      roofMat,
      edgeMat,
      [0, 0.44, 0],
      node.id,
      [0, 0, Math.PI / 2],
    );
    addOutlinedMesh(
      T,
      sculptureGroup,
      new T.CylinderGeometry(0.32, 0.32, 0.08, 20),
      accentMat,
      edgeMat,
      [-0.44, 0.44, 0],
      node.id,
      [0, 0, Math.PI / 2],
    );
    addOutlinedMesh(
      T,
      sculptureGroup,
      new T.CylinderGeometry(0.32, 0.32, 0.08, 20),
      accentMat,
      edgeMat,
      [0.44, 0.44, 0],
      node.id,
      [0, 0, Math.PI / 2],
    );
    topY = 0.86;
  } else if (/(order|cart|checkout)/.test(n)) {
    // True 3D Stepped Fulfillment Pavilion
    addOutlinedMesh(T, sculptureGroup, new T.BoxGeometry(1.00, 0.32, 0.84), bodyMat, edgeMat, [0, 0.16, 0], node.id);
    addOutlinedMesh(T, sculptureGroup, new T.BoxGeometry(0.64, 0.30, 0.56), roofMat, edgeMat, [0, 0.47, 0], node.id);
    addOutlinedMesh(T, sculptureGroup, new T.BoxGeometry(0.24, 0.16, 0.24), accentMat, edgeMat, [0, 0.70, 0], node.id, [0, Math.PI / 4, 0]);
    // Status LED indicators on front & back walls
    addOutlinedMesh(T, sculptureGroup, new T.BoxGeometry(0.14, 0.06, 0.04), ledMat, edgeMat, [-0.28, 0.16, 0.43], node.id);
    addOutlinedMesh(T, sculptureGroup, new T.BoxGeometry(0.14, 0.06, 0.04), ledMat, edgeMat, [0.28, 0.16, -0.43], node.id);
    topY = 0.90;
  } else if (/(payment|billing|ledger|wallet|invoice)/.test(n)) {
    // True 3D Armored Vault Unit
    addOutlinedMesh(T, sculptureGroup, new T.BoxGeometry(0.92, 0.54, 0.74), bodyMat, edgeMat, [0, 0.27, 0], node.id);
    addOutlinedMesh(T, sculptureGroup, new T.BoxGeometry(0.95, 0.08, 0.77), accentMat, edgeMat, [0, 0.27, 0], node.id);
    addOutlinedMesh(T, sculptureGroup, new T.BoxGeometry(0.64, 0.09, 0.44), roofMat, edgeMat, [0, 0.585, 0], node.id);
    addOutlinedMesh(T, sculptureGroup, new T.BoxGeometry(0.12, 0.06, 0.04), ledMat, edgeMat, [0.28, 0.42, 0.38], node.id);
    addOutlinedMesh(T, sculptureGroup, new T.BoxGeometry(0.12, 0.06, 0.04), ledMat, edgeMat, [-0.28, 0.42, -0.38], node.id);
    topY = 0.78;
  } else if (/(catalog|inventory|product|warehouse)/.test(n)) {
    // True 3D Modular Dual-Blade Server Stack + Parcel Cube
    addOutlinedMesh(T, sculptureGroup, new T.BoxGeometry(0.92, 0.22, 0.78), bodyMat, edgeMat, [0, 0.11, 0], node.id);
    addOutlinedMesh(T, sculptureGroup, new T.BoxGeometry(0.84, 0.07, 0.70), accentMat, edgeMat, [0, 0.255, 0], node.id);
    addOutlinedMesh(T, sculptureGroup, new T.BoxGeometry(0.92, 0.22, 0.78), roofMat, edgeMat, [0, 0.40, 0], node.id);
    addOutlinedMesh(T, sculptureGroup, new T.BoxGeometry(0.28, 0.24, 0.28), accentMat, edgeMat, [0, 0.63, 0], node.id, [0, Math.PI / 4, 0]);
    addOutlinedMesh(T, sculptureGroup, new T.BoxGeometry(0.12, 0.05, 0.04), ledMat, edgeMat, [-0.3, 0.40, 0.40], node.id);
    topY = 0.88;
  } else {
    // Generic True 3D Microservice Compute Block
    addOutlinedMesh(T, sculptureGroup, new T.BoxGeometry(0.86, 0.56, 0.76), bodyMat, edgeMat, [0, 0.28, 0], node.id);
    addOutlinedMesh(T, sculptureGroup, new T.BoxGeometry(0.76, 0.10, 0.66), roofMat, edgeMat, [0, 0.61, 0], node.id);
    addOutlinedMesh(T, sculptureGroup, new T.BoxGeometry(0.14, 0.06, 0.04), ledMat, edgeMat, [-0.24, 0.42, 0.39], node.id);
    topY = 0.82;
  }

  // Real 3D Replica Pods (visible when scaled to 2 or 3 replicas!)
  const replicaPods: THREE.Object3D[] = [];
  const extraPods = Math.max(0, Math.min(2, node.replicas - 1));
  for (let i = 0; i < extraPods; i++) {
    const angle = i === 0 ? Math.PI * 0.25 : Math.PI * 1.25;
    const pod = addOutlinedMesh(
      T,
      sculptureGroup,
      new T.BoxGeometry(0.24, 0.24, 0.24),
      roofMat,
      edgeMat,
      [Math.cos(angle) * 0.72, 0.12, Math.sin(angle) * 0.72],
      node.id,
    );
    replicaPods.push(pod);
  }

  // Selection / Drop-Target / Fault Floor Halo Ring
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
    const haloGeo = new T.RingGeometry(0.66, 0.78, 36);
    const haloMat = new T.MeshBasicMaterial({
      color: new T.Color(haloColor),
      side: T.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });
    halo = new T.Mesh(haloGeo, haloMat);
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.018;
    halo.userData = { serviceId: node.id };
    group.add(halo);
  }

  // Crisp 3D Floating Service Pill Sprite
  const labelSprite = createNodeLabelSprite(T, node, styleId);
  labelSprite.position.set(0, topY * baseScale + 0.32, 0);
  labelSprite.userData = { serviceId: node.id };
  group.add(labelSprite);

  return {
    id: node.id,
    group,
    baseY: 0,
    phase: (node.wx * 0.013 + node.wz * 0.017) % (Math.PI * 2),
    active: !node.isStopped,
    halo,
    replicaPods,
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

  // Smooth target vs current camera state (mutated inside RAF with zero React re-renders)
  const targetCamRef = useRef({ yaw: camera.yaw, pitch: camera.pitch, zoom, panX: pan.x, panY: pan.y });
  const liveCamRef = useRef({ yaw: camera.yaw, pitch: camera.pitch, zoom, panX: pan.x, panY: pan.y });
  const dragRef = useRef<StageDrag | null>(null);
  const callbacksRef = useRef({ onCameraChange, onZoomChange, onPanChange, onMoveNode, onSelect, onDropTool });
  callbacksRef.current = { onCameraChange, onZoomChange, onPanChange, onMoveNode, onSelect, onDropTool };

  useEffect(() => {
    // Do not fight active pointer drag with throttled/stale React camera props
    if (dragRef.current && (dragRef.current.mode === "ORBIT" || dragRef.current.mode === "PAN")) {
      targetCamRef.current.zoom = zoom;
      return;
    }
    targetCamRef.current = {
      yaw: camera.yaw,
      pitch: Math.max(THREE_PITCH_MIN, Math.min(THREE_PITCH_MAX, camera.pitch)),
      zoom,
      panX: pan.x,
      panY: pan.y,
    };
  }, [camera.yaw, camera.pitch, zoom, pan.x, pan.y]);

  // Boot Three.js WebGL renderer once (dynamic import so non-3D routes pay 0 KB)
  useEffect(() => {
    let cancelled = false;
    let rafId = 0;
    let resizeObserver: ResizeObserver | null = null;

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
            preserveDrawingBuffer: true,
            powerPreference: "high-performance",
          });
        } catch {
          onReadyChange?.(false);
          return;
        }

        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = T.PCFSoftShadowMap;
        renderer.outputColorSpace = T.SRGBColorSpace;
        renderer.toneMapping = T.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.06;

        const scene = new T.Scene();
        const width = Math.max(1, container.clientWidth);
        const height = Math.max(1, container.clientHeight);
        renderer.setSize(width, height, false);

        const perspCam = new T.PerspectiveCamera(34, width / height, 0.1, 140);

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

          // Smooth camera damping toward target state
          const target = targetCamRef.current;
          const live = liveCamRef.current;
          const smooth = dragRef.current ? 1 : Math.min(1, dt * 11);
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

          // Subtle alive animation on 3D traffic packets & active replica pods
          const tSec = now * 0.001;
          for (const pkt of packetsRef.current) {
            const u = (tSec * pkt.speed + pkt.phase) % 1;
            pkt.curve.getPoint(u, pkt.mesh.position);
          }
          for (const rig of nodeRigsRef.current) {
            if (rig.active) {
              for (let i = 0; i < rig.replicaPods.length; i++) {
                const pod = rig.replicaPods[i]!;
                pod.position.y = 0.12 + Math.sin(tSec * 2.4 + rig.phase + i * 1.4) * 0.03;
              }
            }
            if (rig.halo) {
              const pulse = 1 + Math.sin(tSec * 3.2 + rig.phase) * 0.04;
              rig.halo.scale.set(pulse, pulse, 1);
            }
          }

          renderer.render(scene, perspCam);

          // Update invisible projected bounding box for Guided Tour step 2 only when bounds shift
          const tourBox = tourBoxRef.current;
          const rigs = nodeRigsRef.current;
          if (tourBox && rigs.length > 0) {
            const w = container.clientWidth;
            const h = container.clientHeight;
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

    // Subtle tier divider lines on deck surface
    const gridVerts: number[] = [];
    const x1 = minX + deckW / 3;
    const x2 = minX + (deckW * 2) / 3;
    gridVerts.push(x1, 0.008, minZ, x1, 0.008, maxZ);
    gridVerts.push(x2, 0.008, minZ, x2, 0.008, maxZ);
    gridVerts.push(minX, 0.008, deckCz, maxX, 0.008, deckCz);
    const gridGeo = new T.BufferGeometry();
    gridGeo.setAttribute("position", new T.Float32BufferAttribute(gridVerts, 3));
    const gridLine = new T.LineSegments(
      gridGeo,
      new T.LineBasicMaterial({
        color: new T.Color(styleCfg.deckGridStroke),
        transparent: true,
        opacity: isLight ? 0.25 : 0.2,
      }),
    );
    contentGroup.add(gridLine);

    // 2. Real 3D Service Sculptures
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

    // 3. Real 3D Static Floor Lines + Elevated 3D Observed Traffic Arcs + Packets
    for (const edge of edges) {
      const from = nodeById.get(edge.from);
      const to = nodeById.get(edge.to);
      if (!from || !to) continue;

      const p0 = new T.Vector3(from.wx * WORLD_SCALE, 0.06, from.wz * WORLD_SCALE);
      const p2 = new T.Vector3(to.wx * WORLD_SCALE, 0.06, to.wz * WORLD_SCALE);
      const dist = p0.distanceTo(p2);
      if (dist < 0.05) continue;

      if (edge.kind === "static") {
        const lineGeo = new T.BufferGeometry().setFromPoints([
          new T.Vector3(p0.x, 0.024, p0.z),
          new T.Vector3(p2.x, 0.024, p2.z),
        ]);
        const lineMat = new T.LineDashedMaterial({
          color: new T.Color(edge.color),
          dashSize: 0.16,
          gapSize: 0.12,
          transparent: true,
          opacity: edge.isSevered ? 0.9 : 0.55,
        });
        const line = new T.Line(lineGeo, lineMat);
        line.computeLineDistances();
        contentGroup.add(line);
        edgeRigsRef.current.push({ from: edge.from, to: edge.to, kind: "static", line });
        continue;
      }

      // Observed Live OTel 3D Arch Tube
      const lift = Math.min(1.55, Math.max(0.62, dist * 0.27));
      const mid = new T.Vector3((p0.x + p2.x) / 2, lift, (p0.z + p2.z) / 2);
      const curve = new T.QuadraticBezierCurve3(p0, mid, p2);
      const tubeGeo = new T.TubeGeometry(curve, 28, edge.isSevered ? 0.032 : 0.036, 8, false);
      const tubeMat = new T.MeshStandardMaterial({
        color: new T.Color(edge.color),
        emissive: new T.Color(edge.color),
        emissiveIntensity: styleId === "control" ? 0.55 : 0.15,
        roughness: 0.35,
      });
      const tubeMesh = new T.Mesh(tubeGeo, tubeMat);
      contentGroup.add(tubeMesh);

      // 3D Directional Cone Arrowhead near Target
      const arrowPos = curve.getPoint(0.84);
      const arrowTan = curve.getTangent(0.84).normalize();
      const arrowGeo = new T.ConeGeometry(0.09, 0.22, 10);
      const arrowMesh = new T.Mesh(arrowGeo, tubeMat);
      arrowMesh.position.copy(arrowPos);
      arrowMesh.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), arrowTan);
      contentGroup.add(arrowMesh);

      // Animated Glowing 3D Packet Sphere
      const pktColor = edge.isSevered ? "#f43f5e" : styleId === "control" ? "#38bdf8" : "#0ea5e9";
      const pktGeo = new T.SphereGeometry(0.085, 12, 12);
      const pktMat = new T.MeshBasicMaterial({ color: new T.Color(pktColor) });
      const pktMesh = new T.Mesh(pktGeo, pktMat);
      contentGroup.add(pktMesh);
      packetsRef.current.push({
        mesh: pktMesh,
        curve,
        speed: 1 / Math.max(0.8, edge.speedSec ?? 1.8),
        phase: (edge.id.length * 0.19) % 1,
      });

      // Floating Traffic Metric Badge at Apex
      let badgeSprite: THREE.Sprite | undefined;
      if (edge.label) {
        badgeSprite = createEdgeBadgeSprite(T, edge.label, edge, isLight);
        const apex = curve.getPoint(0.5);
        badgeSprite.position.set(apex.x, apex.y + 0.22, apex.z);
        contentGroup.add(badgeSprite);
      }

      edgeRigsRef.current.push({
        from: edge.from,
        to: edge.to,
        kind: "observed",
        tubeMesh,
        arrowMesh,
        badgeSprite,
        curve,
        isSevered: edge.isSevered,
      });
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
    const up = new T.Vector3(0, 1, 0);
    for (const edge of edgeRigsRef.current) {
      if (edge.from !== serviceId && edge.to !== serviceId) continue;
      const a = liveNodePosRef.current.get(edge.from);
      const b = liveNodePosRef.current.get(edge.to);
      if (!a || !b) continue;
      const ax = a.wx * WORLD_SCALE;
      const az = a.wz * WORLD_SCALE;
      const bx = b.wx * WORLD_SCALE;
      const bz = b.wz * WORLD_SCALE;
      if (edge.kind === "static" && edge.line) {
        const pos = edge.line.geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
        if (pos) {
          pos.setXYZ(0, ax, 0.024, az);
          pos.setXYZ(1, bx, 0.024, bz);
          pos.needsUpdate = true;
          edge.line.computeLineDistances();
        }
      } else if (edge.kind === "observed" && edge.curve && edge.tubeMesh) {
        edge.curve.v0.set(ax, 0.06, az);
        edge.curve.v2.set(bx, 0.06, bz);
        const dist = edge.curve.v0.distanceTo(edge.curve.v2);
        const lift = Math.min(1.55, Math.max(0.62, dist * 0.27));
        edge.curve.v1.set((ax + bx) / 2, lift, (az + bz) / 2);
        const nextGeo = new T.TubeGeometry(edge.curve, 24, edge.isSevered ? 0.032 : 0.036, 8, false);
        edge.tubeMesh.geometry.dispose();
        edge.tubeMesh.geometry = nextGeo;
        if (edge.arrowMesh) {
          edge.arrowMesh.position.copy(edge.curve.getPoint(0.84));
          edge.arrowMesh.quaternion.setFromUnitVectors(up, edge.curve.getTangent(0.84).normalize());
        }
        if (edge.badgeSprite) {
          const apex = edge.curve.getPoint(0.5);
          edge.badgeSprite.position.set(apex.x, apex.y + 0.22, apex.z);
        }
      }
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
        onWheel={(event) => {
          event.preventDefault();
          const factor = event.deltaY < 0 ? 1.1 : 0.91;
          const nextZoom = Math.max(0.45, Math.min(2.2, Number((targetCamRef.current.zoom * factor).toFixed(2))));
          targetCamRef.current.zoom = nextZoom;
          callbacksRef.current.onZoomChange(nextZoom);
        }}
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
            const now = performance.now();
            if (now - drag.lastSyncAt >= 100) {
              drag.lastSyncAt = now;
              callbacksRef.current.onCameraChange({ yaw: nextYaw, pitch: nextPitch });
            }
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
