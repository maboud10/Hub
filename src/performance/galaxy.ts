/**
 * Goal Galaxy layout — a radial tree. Company objectives are stars on the inner
 * orbit, team objectives orbit their parent star, individual objectives sit on the
 * outer orbit inside their parent's sector. Sectors are sized by subtree weight so
 * busy branches get more room. Unaligned objectives share their own sector.
 */
import type { OkrLevel } from './types';

export interface GalaxyInput {
  id: string;
  level: OkrLevel;
  parentId?: string;
  /** Number of key results (drives the node size). */
  krs: number;
}

export interface GalaxyNode {
  id: string;
  level: OkrLevel;
  parentId?: string;
  x: number;
  y: number;
  r: number;
  ring: 0 | 1 | 2 | 3;
  angle: number;
  /** Sector (radians) owned by this node. */
  a0: number;
  a1: number;
  unaligned: boolean;
}

export interface GalaxyLayout {
  size: number;
  center: number;
  rings: number[];
  nodes: GalaxyNode[];
  links: { from: string; to: string }[];
}

const RING_FRACTION = [0, 0.3, 0.62, 0.88] as const;
const LEVEL_RING: Record<OkrLevel, 1 | 2 | 3> = { company: 1, team: 2, individual: 3 };
const UNALIGNED = '__unaligned__';

export function nodeRadius(level: OkrLevel, krs: number) {
  const base = level === 'company' ? 17 : level === 'team' ? 10.5 : 6.5;
  return base + Math.sqrt(Math.max(0, krs)) * (level === 'company' ? 3.2 : level === 'team' ? 2.2 : 1.6);
}

export function layoutGalaxy(input: GalaxyInput[], size = 640): GalaxyLayout {
  const center = size / 2;
  const R = center - 26;
  const rings = RING_FRACTION.slice(1).map((f) => f * R);
  const ids = new Set(input.map((n) => n.id));
  const byId = new Map(input.map((n) => [n.id, n]));

  // Resolve the effective parent (must exist and sit on an inner ring).
  const parentOf = (n: GalaxyInput): string | undefined => {
    if (!n.parentId || !ids.has(n.parentId)) return undefined;
    const p = byId.get(n.parentId)!;
    return LEVEL_RING[p.level] < LEVEL_RING[n.level] ? p.id : undefined;
  };
  const children = new Map<string, GalaxyInput[]>();
  const roots: GalaxyInput[] = [];
  const unaligned: GalaxyInput[] = [];
  for (const n of input) {
    const p = parentOf(n);
    if (p) children.set(p, [...(children.get(p) ?? []), n]);
    else if (n.level === 'company') roots.push(n);
    else unaligned.push(n);
  }
  const weight = (n: GalaxyInput): number => 1 + (children.get(n.id) ?? []).reduce((s, c) => s + weight(c), 0);

  type Branch = { node: GalaxyInput | null; w: number };
  const top: Branch[] = roots.map((n) => ({ node: n, w: weight(n) }));
  const unalignedW = unaligned.reduce((s, n) => s + weight(n), 0);
  if (unaligned.length) top.push({ node: null, w: unalignedW });
  const total = top.reduce((s, b) => s + b.w, 0) || 1;

  const nodes: GalaxyNode[] = [];
  const links: { from: string; to: string }[] = [];
  const place = (n: GalaxyInput, a0: number, a1: number, isUnaligned: boolean) => {
    const ring = LEVEL_RING[n.level];
    const angle = (a0 + a1) / 2;
    const rad = roots.length === 1 && n.level === 'company' && !unaligned.length ? 0 : rings[ring - 1];
    nodes.push({
      id: n.id,
      level: n.level,
      parentId: parentOf(n),
      x: center + Math.cos(angle) * rad,
      y: center + Math.sin(angle) * rad,
      r: nodeRadius(n.level, n.krs),
      ring,
      angle,
      a0,
      a1,
      unaligned: isUnaligned,
    });
    const kids = (children.get(n.id) ?? []).slice().sort((a, b) => a.id.localeCompare(b.id));
    const kw = kids.reduce((s, c) => s + weight(c), 0) || 1;
    // children share the parent's sector, padded a little so siblings don't touch
    const pad = Math.min(0.08, (a1 - a0) * 0.06);
    let cur = a0 + pad;
    const span = a1 - a0 - pad * 2;
    for (const c of kids) {
      const w = (weight(c) / kw) * span;
      links.push({ from: c.id, to: n.id });
      place(c, cur, cur + w, isUnaligned);
      cur += w;
    }
  };

  let a = -Math.PI / 2;
  for (const b of top) {
    const sweep = (b.w / total) * Math.PI * 2;
    if (b.node) place(b.node, a, a + sweep, false);
    else {
      const uw = unaligned.reduce((s, n) => s + weight(n), 0) || 1;
      let cur = a;
      for (const n of unaligned.slice().sort((x, y) => x.id.localeCompare(y.id))) {
        const w = (weight(n) / uw) * sweep;
        place(n, cur, cur + w, true);
        cur += w;
      }
    }
    a += sweep;
  }
  return { size, center, rings, nodes, links };
}

/** All ids in the branch of `id` (ancestors + descendants), used to focus/zoom. */
export function branchIds(layout: GalaxyLayout, id: string): Set<string> {
  const byId = new Map(layout.nodes.map((n) => [n.id, n]));
  const out = new Set<string>([id]);
  let cur = byId.get(id)?.parentId;
  while (cur && !out.has(cur)) {
    out.add(cur);
    cur = byId.get(cur)?.parentId;
  }
  const walk = (pid: string) => {
    for (const n of layout.nodes) if (n.parentId === pid && !out.has(n.id)) {
      out.add(n.id);
      walk(n.id);
    }
  };
  walk(id);
  return out;
}

export { UNALIGNED };
