/**
 * Stratos · Cloud Console — lightweight world geometry for the hero map.
 * Coarse continent outlines (lon/lat) rasterised into a dot matrix once,
 * plus an equirectangular projection for region nodes and traffic arcs.
 */

export interface MapView {
  lonMin: number;
  lonMax: number;
  latMin: number;
  latMax: number;
  w: number;
  h: number;
}

export const MAP_VIEW: MapView = { lonMin: -132, lonMax: 158, latMin: -46, latMax: 72, w: 1000, h: 407 };

type Poly = [number, number][];

/** Rough continent outlines — stylised, recognisable at dot-matrix resolution. */
const LAND: Poly[] = [
  // North America
  [[-168, 66], [-162, 70], [-156, 71], [-140, 70], [-128, 70], [-115, 68], [-95, 72], [-82, 73], [-75, 68], [-64, 60], [-56, 52], [-66, 45], [-70, 42], [-76, 38], [-81, 31], [-80, 25], [-82, 28], [-84, 30], [-90, 29], [-97, 26], [-97, 21], [-95, 18], [-90, 21], [-87, 21], [-88, 16], [-84, 11], [-79, 9], [-80, 8], [-85, 10], [-92, 14], [-100, 17], [-105, 20], [-110, 24], [-112, 30], [-117, 33], [-122, 37], [-124, 42], [-124, 48], [-130, 55], [-138, 59], [-146, 61], [-152, 59], [-158, 57], [-165, 60], [-166, 64]],
  // Greenland
  [[-55, 60], [-44, 60], [-38, 65], [-22, 70], [-20, 76], [-30, 82], [-50, 82], [-65, 80], [-72, 77], [-58, 75], [-53, 70]],
  // Cuba
  [[-85, 22], [-80, 23.2], [-74.5, 20.2], [-78, 20], [-82, 22]],
  // South America
  [[-80, 9], [-75, 11], [-71, 12], [-62, 11], [-52, 5], [-50, 0], [-44, -2], [-35, -6], [-35, -10], [-39, -15], [-40, -22], [-48, -26], [-53, -34], [-58, -38], [-62, -40], [-65, -45], [-68, -50], [-69, -54], [-74, -52], [-75, -46], [-73, -40], [-71, -30], [-70, -18], [-76, -14], [-81, -6], [-80, 0], [-78, 2], [-77, 7]],
  // Iceland
  [[-24, 64], [-22, 66.5], [-15, 66.5], [-13, 65], [-18, 63.4]],
  // Great Britain
  [[-5.7, 50], [1.7, 51], [1.7, 52.8], [0, 53.5], [-1.5, 55], [-2, 57], [-3.8, 58.6], [-5, 58.6], [-6.2, 56.5], [-5, 55], [-3, 54.5], [-4.5, 53.3], [-5.3, 51.7]],
  // Ireland
  [[-10, 51.5], [-6, 52], [-6, 54.5], [-8, 55.2], [-10, 54]],
  // Europe
  [[-10, 36], [-9, 43], [-2, 43.5], [-1, 46], [-4, 48], [2, 51], [5, 53], [8, 54], [9, 57], [11, 58], [8, 63], [14, 67], [20, 70], [28, 71], [33, 69], [41, 67], [44, 68], [56, 68], [60, 69], [60, 55], [50, 46], [48, 42], [41, 41], [36, 41], [28, 41], [26, 40], [24, 38], [22, 37], [21, 39], [19, 42], [16, 43], [13, 45], [12, 44], [16, 41], [18, 40], [16, 38], [15, 40], [12, 42], [9, 44], [6, 43], [3, 43], [0, 40], [-1, 37], [-6, 36]],
  // Africa
  [[-17, 21], [-16, 28], [-10, 30], [-9, 33], [-6, 36], [0, 36], [10, 37], [11, 33], [20, 31], [25, 32], [32, 31], [35, 28], [37, 22], [43, 12], [51, 12], [51, 10], [47, 4], [40, -3], [40, -10], [38, -17], [35, -24], [33, -27], [27, -34], [20, -35], [18, -32], [15, -27], [12, -18], [13, -12], [9, -1], [10, 3], [5, 5], [-2, 5], [-8, 4], [-13, 8], [-17, 13], [-17, 16]],
  // Madagascar
  [[44, -25], [47, -25], [50, -15], [49, -12], [44, -17]],
  // Arabian peninsula
  [[35, 28], [39, 22], [43, 13], [45, 13], [52, 16], [57, 19], [59.5, 22.5], [56.3, 26.2], [54, 24.2], [51.5, 24.5], [51, 26], [49, 29], [48, 30], [45, 31], [39, 32], [35, 32]],
  // Asia
  [[28, 41], [36, 36], [42, 37], [48, 30], [52, 27], [57, 25], [62, 25], [67, 24], [72, 21], [73, 16], [77, 8], [80, 13], [80, 16], [87, 22], [91, 22], [94, 17], [98, 16], [98, 8], [100, 6], [103, 1.5], [104, 1.5], [103, 5], [101, 7], [100, 13], [105, 9], [109, 12], [109, 16], [107, 21], [111, 21], [117, 23], [121, 28], [122, 31], [120, 35], [122, 37], [119, 39], [121, 41], [125, 40], [129, 35], [129, 41], [135, 43], [140, 48], [141, 53], [137, 54], [140, 58], [150, 59], [156, 58], [163, 60], [170, 60], [180, 65], [180, 69], [170, 70], [160, 70], [150, 72], [140, 72], [128, 73], [112, 74], [100, 78], [90, 76], [80, 73], [70, 73], [68, 69], [60, 69], [60, 55], [50, 46], [48, 42], [41, 41], [36, 41]],
  // Sri Lanka
  [[79.8, 6], [81.8, 7], [80.2, 9.8]],
  // Japan
  [[130, 31], [131, 34], [135, 34], [140, 35], [141, 38], [142, 40], [141, 42], [140, 41], [139, 38], [136, 36], [133, 35]],
  [[140, 42], [145, 43], [145, 44.5], [142, 45.5], [140, 43.5]],
  // Taiwan · Philippines
  [[120.5, 22.5], [121.9, 25], [121, 25], [120.2, 23.5]],
  [[120, 18], [122, 18], [124, 12], [126, 7], [122, 7], [120, 12]],
  // Indonesia & New Guinea
  [[95, 5.5], [98, 4], [104, -2], [106, -6], [102, -4], [99, 0], [96, 3]],
  [[105, -6], [110, -7], [114, -7.7], [114, -8.7], [106, -7.4]],
  [[109, 1], [111, -3], [116, -4], [119, 0], [118, 5], [117, 7], [115, 5], [111, 2]],
  [[119, -5], [121, -1], [125, 1.5], [123, -1], [122, -5]],
  [[131, -1], [138, -1.5], [145, -5], [150, -10], [143, -9], [138, -8], [132, -4]],
  // Australia · New Zealand
  [[114, -22], [114, -26], [115, -34], [118, -35], [124, -34], [130, -32], [135, -35], [138, -35], [140, -38], [146, -39], [150, -37], [153, -31], [153, -25], [150, -22], [146, -19], [145, -15], [143, -11], [141, -13], [141, -17], [137, -16], [136, -12], [132, -11], [130, -13], [127, -14], [122, -17], [121, -19]],
  [[166, -46], [172, -41], [175, -37], [178, -38], [174, -42], [170, -46]],
];

function inside(lon: number, lat: number, poly: Poly): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

export function isLand(lon: number, lat: number): boolean {
  return LAND.some((p) => inside(lon, lat, p));
}

/** Equirectangular projection into the map's viewBox. */
export function project(lon: number, lat: number, view: MapView = MAP_VIEW): { x: number; y: number } {
  const x = ((lon - view.lonMin) / (view.lonMax - view.lonMin)) * view.w;
  const y = ((view.latMax - lat) / (view.latMax - view.latMin)) * view.h;
  return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
}

let dotCache: { key: string; d: string; count: number } | null = null;

/** One SVG path of round "dots" (zero-length segments with round caps) for every land cell. */
export function landDots(step = 2.4, view: MapView = MAP_VIEW): { d: string; count: number } {
  const key = `${step}:${view.lonMin}:${view.lonMax}:${view.latMin}:${view.latMax}:${view.w}:${view.h}`;
  if (dotCache?.key === key) return dotCache;
  const parts: string[] = [];
  let count = 0;
  let row = 0;
  for (let lat = view.latMax - step / 2; lat > view.latMin; lat -= step, row++) {
    const shift = row % 2 ? step / 2 : 0;
    for (let lon = view.lonMin + step / 2 + shift; lon < view.lonMax; lon += step) {
      if (!isLand(lon, lat)) continue;
      const { x, y } = project(lon, lat, view);
      parts.push(`M${x} ${y}h0`);
      count++;
    }
  }
  dotCache = { key, d: parts.join(''), count };
  return dotCache;
}

/** Quadratic arc between two points, bowed "up" by a share of the distance. */
export function arcPath(a: { x: number; y: number }, b: { x: number; y: number }, bow = 0.28): string {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy);
  // perpendicular, always bending towards the top of the map
  let nx = -dy / (dist || 1);
  let ny = dx / (dist || 1);
  if (ny > 0) {
    nx = -nx;
    ny = -ny;
  }
  const cx = mx + nx * dist * bow;
  const cy = my + ny * dist * bow;
  return `M${a.x} ${a.y} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${b.x} ${b.y}`;
}
