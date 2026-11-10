/**
 * Dependency constellation engine — pure, no DOM.
 *
 * Edges point from a blocker to the task it blocks (`task.blockedBy` lists
 * the blockers). Layout = longest-path topological layering (left → right),
 * barycenter sweeps to reduce crossings, and a CPM-style critical path: the
 * chain with the most remaining work (done tasks and milestones weigh 0).
 */

export interface GraphInput {
  id: string;
  blockedBy: string[];
  done: boolean;
  /** Remaining effort in hours (defaults to `DEFAULT_HOURS`). */
  estimate?: number;
  milestone?: boolean;
}

export interface Dag {
  ids: string[];
  /** blockers of each node */
  preds: Map<string, string[]>;
  /** dependents of each node */
  succs: Map<string, string[]>;
  /** edges ignored to break cycles or because the blocker is unknown */
  dropped: [string, string][];
}

export interface GraphNode {
  id: string;
  layer: number;
  row: number;
  x: number;
  y: number;
}

export interface GraphEdge {
  from: string;
  to: string;
  critical: boolean;
}

export interface GraphLayout {
  nodes: GraphNode[];
  edges: GraphEdge[];
  layers: string[][];
  critical: string[];
  criticalHours: number;
  width: number;
  height: number;
}

export const DEFAULT_HOURS = 4;

export function buildDag(nodes: GraphInput[]): Dag {
  const ids = nodes.map((n) => n.id);
  const known = new Set(ids);
  const preds = new Map<string, string[]>(ids.map((id) => [id, []]));
  const succs = new Map<string, string[]>(ids.map((id) => [id, []]));
  const dropped: [string, string][] = [];
  for (const n of nodes) {
    for (const b of new Set(n.blockedBy)) {
      if (!known.has(b) || b === n.id) {
        dropped.push([b, n.id]);
        continue;
      }
      preds.get(n.id)!.push(b);
      succs.get(b)!.push(n.id);
    }
  }
  // Break cycles: iterative DFS over succs, drop back-edges.
  const state = new Map<string, 0 | 1 | 2>(ids.map((id) => [id, 0]));
  for (const root of ids) {
    if (state.get(root) !== 0) continue;
    const stack: { id: string; i: number }[] = [{ id: root, i: 0 }];
    state.set(root, 1);
    while (stack.length) {
      const top = stack[stack.length - 1];
      const out = succs.get(top.id)!;
      if (top.i >= out.length) {
        state.set(top.id, 2);
        stack.pop();
        continue;
      }
      const next = out[top.i];
      const st = state.get(next);
      if (st === 1) {
        // back-edge top.id → next closes a cycle
        out.splice(top.i, 1);
        const p = preds.get(next)!;
        p.splice(p.indexOf(top.id), 1);
        dropped.push([top.id, next]);
        continue;
      }
      top.i += 1;
      if (st === 0) {
        state.set(next, 1);
        stack.push({ id: next, i: 0 });
      }
    }
  }
  return { ids, preds, succs, dropped };
}

/** Kahn topological order (stable with respect to input order). */
export function topoOrder(dag: Dag): string[] {
  const indeg = new Map(dag.ids.map((id) => [id, dag.preds.get(id)!.length]));
  const queue = dag.ids.filter((id) => indeg.get(id) === 0);
  const out: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    out.push(id);
    for (const s of dag.succs.get(id)!) {
      const d = indeg.get(s)! - 1;
      indeg.set(s, d);
      if (d === 0) queue.push(s);
    }
  }
  return out;
}

/** Longest-path layering: sources at 0, every node one layer right of its deepest blocker. */
export function layerOf(dag: Dag): Map<string, number> {
  const layer = new Map<string, number>();
  for (const id of topoOrder(dag)) {
    const ps = dag.preds.get(id)!;
    layer.set(id, ps.length ? Math.max(...ps.map((p) => layer.get(p) ?? 0)) + 1 : 0);
  }
  return layer;
}

function crossings(upper: string[], lower: string[], preds: Map<string, string[]>): number {
  const pos = new Map(upper.map((id, i) => [id, i]));
  const edges: [number, number][] = [];
  lower.forEach((id, j) => {
    for (const p of preds.get(id) ?? []) {
      const i = pos.get(p);
      if (i !== undefined) edges.push([i, j]);
    }
  });
  let c = 0;
  for (let a = 0; a < edges.length; a++)
    for (let b = a + 1; b < edges.length; b++) {
      const [i1, j1] = edges[a];
      const [i2, j2] = edges[b];
      if ((i1 - i2) * (j1 - j2) < 0) c++;
    }
  return c;
}

/** Total edge crossings between adjacent layers (used by tests and the layout). */
export function countCrossings(layers: string[][], dag: Dag): number {
  let c = 0;
  for (let i = 1; i < layers.length; i++) c += crossings(layers[i - 1], layers[i], dag.preds);
  return c;
}

/** Barycenter heuristic: alternate down/up sweeps, keep the best ordering found. */
export function orderLayers(layers: string[][], dag: Dag, sweeps = 6): string[][] {
  const cur = layers.map((l) => [...l]);
  let best = cur.map((l) => [...l]);
  let bestC = countCrossings(cur, dag);
  const bary = (neigh: string[], ref: Map<string, number>, fallback: number) => {
    const xs = neigh.map((n) => ref.get(n)).filter((v): v is number => v !== undefined);
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : fallback;
  };
  for (let s = 0; s < sweeps && bestC > 0; s++) {
    const down = s % 2 === 0;
    const order = down ? cur.map((_, i) => i).slice(1) : cur.map((_, i) => i).slice(0, -1).reverse();
    for (const li of order) {
      const refLayer = cur[down ? li - 1 : li + 1];
      const ref = new Map(refLayer.map((id, i) => [id, i]));
      const keyed = cur[li].map((id, i) => ({ id, k: bary(down ? dag.preds.get(id)! : dag.succs.get(id)!, ref, i) }));
      keyed.sort((a, b) => a.k - b.k);
      cur[li] = keyed.map((x) => x.id);
    }
    const c = countCrossings(cur, dag);
    if (c < bestC) {
      bestC = c;
      best = cur.map((l) => [...l]);
    }
  }
  return best;
}

const weight = (n: GraphInput | undefined) => (!n || n.done || n.milestone ? 0 : Math.max(0, n.estimate ?? DEFAULT_HOURS));

/** Longest remaining-work chain. Empty when nothing is left to do. */
export function criticalPath(nodes: GraphInput[], dag: Dag = buildDag(nodes)): { path: string[]; hours: number } {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const dist = new Map<string, number>();
  const parent = new Map<string, string | null>();
  for (const id of topoOrder(dag)) {
    let bestP: string | null = null;
    let bestD = 0;
    for (const p of dag.preds.get(id)!) {
      const d = dist.get(p) ?? 0;
      if (d > bestD) {
        bestD = d;
        bestP = p;
      }
    }
    dist.set(id, bestD + weight(byId.get(id)));
    parent.set(id, bestP);
  }
  let end: string | null = null;
  let max = 0;
  for (const [id, d] of dist) if (d > max) [end, max] = [id, d];
  if (!end) return { path: [], hours: 0 };
  const path: string[] = [];
  const seen = new Set<string>();
  let cur: string | null = end;
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    path.unshift(cur);
    cur = parent.get(cur) ?? null;
  }
  // Append the zero-weight tail in order.
  let t = end;
  for (;;) {
    const next = dag.succs.get(t)!.find((s) => weight(byId.get(s)) === 0 && !byId.get(s)!.done && !seen.has(s));
    if (!next) break;
    path.push(next);
    seen.add(next);
    t = next;
  }
  return { path, hours: max };
}

/**
 * Would "taskId is blocked by blockerId" close a loop? True when the blocker
 * already (transitively) waits on the task, or for self-dependencies.
 */
export function wouldCreateCycle(nodes: Pick<GraphInput, 'id' | 'blockedBy'>[], taskId: string, blockerId: string): boolean {
  if (taskId === blockerId) return true;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const stack = [blockerId];
  const seen = new Set<string>();
  while (stack.length) {
    const id = stack.pop()!;
    if (id === taskId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const b of byId.get(id)?.blockedBy ?? []) stack.push(b);
  }
  return false;
}

/** Open blockers of a task. */
export function openBlockers<T extends { id: string; blockedBy: string[]; completedAt?: number }>(task: T, byId: Map<string, T>): T[] {
  return task.blockedBy.map((id) => byId.get(id)).filter((t): t is T => !!t && !t.completedAt);
}

export interface LayoutOptions {
  colW?: number;
  rowH?: number;
  padX?: number;
  padY?: number;
  /** Only keep nodes that have at least one edge. */
  connectedOnly?: boolean;
}

export function layoutGraph(input: GraphInput[], opts: LayoutOptions = {}): GraphLayout {
  const { colW = 230, rowH = 74, padX = 40, padY = 44, connectedOnly = false } = opts;
  let nodes = input;
  if (connectedOnly) {
    const ids = new Set(input.map((n) => n.id));
    const linked = new Set<string>();
    for (const n of input)
      for (const b of n.blockedBy)
        if (ids.has(b) && b !== n.id) {
          linked.add(b);
          linked.add(n.id);
        }
    nodes = input.filter((n) => linked.has(n.id));
  }
  const dag = buildDag(nodes);
  const layerMap = layerOf(dag);
  const depth = Math.max(-1, ...layerMap.values()) + 1;
  const layers: string[][] = Array.from({ length: depth }, () => []);
  for (const id of dag.ids) layers[layerMap.get(id) ?? 0].push(id);
  const ordered = orderLayers(layers, dag);
  const { path, hours } = criticalPath(nodes, dag);
  const crit = new Set(path);
  const critEdges = new Set<string>();
  for (let i = 1; i < path.length; i++) critEdges.add(`${path[i - 1]}>${path[i]}`);

  const tallest = Math.max(1, ...ordered.map((l) => l.length));
  const out: GraphNode[] = [];
  ordered.forEach((layer, li) => {
    const offset = ((tallest - layer.length) * rowH) / 2;
    layer.forEach((id, ri) => out.push({ id, layer: li, row: ri, x: padX + li * colW, y: padY + offset + ri * rowH }));
  });
  const edges: GraphEdge[] = [];
  for (const id of dag.ids) for (const s of dag.succs.get(id)!) edges.push({ from: id, to: s, critical: critEdges.has(`${id}>${s}`) });
  return {
    nodes: out,
    edges,
    layers: ordered,
    critical: path.filter((id) => crit.has(id)),
    criticalHours: hours,
    width: padX * 2 + Math.max(0, depth - 1) * colW,
    height: padY * 2 + Math.max(0, tallest - 1) * rowH,
  };
}
