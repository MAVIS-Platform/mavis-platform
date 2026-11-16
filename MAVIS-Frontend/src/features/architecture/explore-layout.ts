import type { ArchitecturalModel } from "@/types/domain";

const palette = ["#a78bfa", "#fb923c", "#34d399", "#60a5fa", "#f472b6", "#facc15", "#22d3ee"];

export function exploreClusters(model: ArchitecturalModel) {
  const nodes = [...model.elements].sort((a, b) => a.id.localeCompare(b.id));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const adjacent = new Map(nodes.map((n) => [n.id, new Set<string>()]));
  for (const e of model.edges) {
    if (!byId.has(e.from) || !byId.has(e.to) || e.from === e.to) continue;
    adjacent.get(e.from)!.add(e.to);
    adjacent.get(e.to)!.add(e.from);
  }
  const seeds = nodes.filter((n) => n.elementType === "SERVICE_CONTAINER");
  if (!seeds.length && nodes.length)
    seeds.push(
      [...nodes].sort(
        (a, b) => adjacent.get(b.id)!.size - adjacent.get(a.id)!.size || a.id.localeCompare(b.id),
      )[0]!,
    );
  const owners = new Map<string, string>();
  // Multi-source traversal: each visible service owns itself. Other elements
  // attach to a connected service, with stable tie-breaking by source ID.
  const queue = seeds.map((n) => n.id);
  for (const id of queue) owners.set(id, id);
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i]!;
    for (const neighbor of [...adjacent.get(id)!].sort()) {
      if (!owners.has(neighbor)) {
        owners.set(neighbor, owners.get(id)!);
        queue.push(neighbor);
      }
    }
  }
  // Explicit parent ownership takes precedence over proximity through edges.
  for (const n of nodes) {
    const seen = new Set<string>();
    let parent = n.parentId;
    while (parent && byId.has(parent) && !seen.has(parent)) {
      seen.add(parent);
      if (seeds.some((s) => s.id === parent)) {
        owners.set(n.id, parent);
        break;
      }
      parent = byId.get(parent)?.parentId;
    }
  }
  return { nodes, seeds, owners };
}

export function explorePositions(model: ArchitecturalModel) {
  const { nodes, seeds, owners } = exploreClusters(model);
  const positions = new Map<string, { x: number; y: number }>();
  const count = seeds.length;
  const radius = count <= 1 ? 0 : Math.max(150, count * 37);
  const anchors = seeds.map((seed, i) => {
    const angle = (i * Math.PI * 2) / count - Math.PI / 2;
    return { id: seed.id, x: Math.cos(angle) * radius, y: Math.sin(angle) * radius * 0.66 };
  });
  const links = new Set(
    model.edges.map((e) => {
      const a = owners.get(e.from),
        b = owners.get(e.to);
      return a && b && a !== b ? [a, b].sort().join("\u0000") : "";
    }),
  );
  for (let step = 0; step < 100; step++) {
    const forces = anchors.map((p) => ({ x: -p.x * 0.002, y: -p.y * 0.002 }));
    for (let i = 0; i < anchors.length; i++)
      for (let j = i + 1; j < anchors.length; j++) {
        const a = anchors[i]!,
          b = anchors[j]!,
          dx = b.x - a.x,
          dy = b.y - a.y;
        const distance = Math.max(1, Math.hypot(dx, dy));
        const spring = links.has([a.id, b.id].sort().join("\u0000")) ? (distance - 205) * 0.015 : 0;
        const repulsion = 16000 / (distance * distance) + Math.max(0, 180 - distance) * 0.08;
        const fx = (dx / distance) * (spring - repulsion),
          fy = (dy / distance) * (spring - repulsion);
        forces[i]!.x += fx;
        forces[i]!.y += fy;
        forces[j]!.x -= fx;
        forces[j]!.y -= fy;
      }
    anchors.forEach((p, i) => {
      p.x += Math.max(-6, Math.min(6, forces[i]!.x));
      p.y += Math.max(-6, Math.min(6, forces[i]!.y));
    });
  }
  seeds.forEach((seed, i) => {
    const angle = (i * Math.PI * 2) / count - Math.PI / 2;
    const center = { x: anchors[i]!.x, y: anchors[i]!.y };
    positions.set(seed.id, center);
    const members = nodes.filter((n) => n.id !== seed.id && owners.get(n.id) === seed.id);
    members.forEach((node, j) => {
      const theta = angle + j * 2.399963;
      const distance = 70 + 26 * Math.sqrt(j);
      positions.set(node.id, {
        x: center.x + Math.cos(theta) * distance,
        y: center.y + Math.sin(theta) * distance,
      });
    });
  });
  const isolated = nodes.filter((n) => !positions.has(n.id));
  isolated.forEach((n, i) => {
    const a = ((i + 0.5) * Math.PI * 2) / Math.max(1, isolated.length);
    positions.set(n.id, { x: Math.cos(a) * (radius + 150), y: Math.sin(a) * (radius + 150) * 0.7 });
  });
  return positions;
}

export function exploreAppearance(model: ArchitecturalModel) {
  const { nodes, seeds, owners } = exploreClusters(model);
  return new Map(
    nodes.map((n) => {
      const cluster = seeds.findIndex((s) => s.id === owners.get(n.id));
      const knownType = [
        "SERVICE_CONTAINER",
        "COMPONENT",
        "DATABASE",
        "QUEUE_BROKER",
        "MESSAGE_CHANNEL",
        "EXTERNAL_SYSTEM",
      ].includes(n.elementType ?? "");
      const color = cluster < 0 || !knownType ? "#94a3b8" : palette[cluster % palette.length]!;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><defs><radialGradient id="g"><stop stop-color="${color}" stop-opacity=".4"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient></defs><circle cx="60" cy="60" r="60" fill="url(#g)"/><circle cx="60" cy="60" r="44" fill="${color}" opacity=".07"/><circle cx="60" cy="60" r="31" fill="${color}" opacity=".13"/><circle cx="60" cy="60" r="20" fill="${color}" opacity=".25"/><circle cx="60" cy="60" r="10" fill="${color}"/><circle cx="57" cy="57" r="3" fill="white" opacity=".3"/></svg>`;
      return [n.id, { color, image: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}` }];
    }),
  );
}
