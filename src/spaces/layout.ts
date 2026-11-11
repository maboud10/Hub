/**
 * Spaces — static workplace layout: the four hub sites, their isometric floor
 * plans (zones, desks, rooms), parking, lockers, office announcements, the
 * Calendar room fallback and the seeded travel fallback.
 *
 * Plans use a 24 × 14 floor grid. Calendar's Spatial Rooms (Dubai, London,
 * Singapore) are mapped onto the plans through `CAL_LAYOUT`; New York and the
 * Spaces-native rooms (huddles, phone booths, wellness rooms) live here.
 */
import type { Amenity, CalRoomLite, Desk, Locker, ParkingSpot, Room, RoomGear, RoomKind, Sensors, Site, SiteId, Zone, ZoneKind } from './types';

export const SITES: Site[] = [
  {
    id: 'dubai',
    city: 'Dubai',
    label: 'Dubai HQ',
    building: 'Helix Tower · Dubai Marina',
    timezone: 'Asia/Dubai',
    currency: 'AED',
    headcount: 58,
    floors: [
      { id: 'L40', label: 'L40', desks: 12, plan: false, share: 0.3 },
      { id: 'L41', label: 'L41', desks: 26, plan: true, share: 0.7 },
    ],
    grid: { w: 24, h: 14 },
    weather: { tempC: 29, kind: 'sunny', commuteMins: 24, transit: 'Metro Red Line' },
    costPerDeskDay: 96,
    kgCo2PerDeskDay: 2.4,
    kwhPerDay: 1840,
    renewablePct: 38,
    rhythm: [0.62, 0.78, 0.74, 0.66, 0.3, 0.04, 0.02],
    wifiSsid: 'Helix-Guest-DXB',
    color: '#e879f9',
  },
  {
    id: 'london',
    city: 'London',
    label: 'London Studio',
    building: 'Shoreditch Studio',
    timezone: 'Europe/London',
    currency: 'GBP',
    headcount: 38,
    floors: [
      { id: 'L3', label: 'L3', desks: 14, plan: false, share: 0.32 },
      { id: 'L6', label: 'L6', desks: 22, plan: true, share: 0.68 },
    ],
    grid: { w: 24, h: 14 },
    weather: { tempC: 11, kind: 'rain', commuteMins: 31, transit: 'Elizabeth line' },
    costPerDeskDay: 38,
    kgCo2PerDeskDay: 1.65,
    kwhPerDay: 960,
    renewablePct: 72,
    rhythm: [0.48, 0.81, 0.77, 0.69, 0.22, 0.02, 0.01],
    wifiSsid: 'Helix-Guest-LDN',
    color: '#a855f7',
  },
  {
    id: 'singapore',
    city: 'Singapore',
    label: 'Singapore Hub',
    building: 'Marina Bay Hub',
    timezone: 'Asia/Singapore',
    currency: 'SGD',
    headcount: 30,
    floors: [{ id: 'L28', label: 'L28', desks: 20, plan: true, share: 1 }],
    grid: { w: 24, h: 14 },
    weather: { tempC: 31, kind: 'humid', commuteMins: 18, transit: 'MRT Downtown Line' },
    costPerDeskDay: 64,
    kgCo2PerDeskDay: 2.1,
    kwhPerDay: 1120,
    renewablePct: 24,
    rhythm: [0.55, 0.72, 0.7, 0.64, 0.41, 0.03, 0.01],
    wifiSsid: 'Helix-Guest-SIN',
    color: '#f472b6',
  },
  {
    id: 'newyork',
    city: 'New York',
    label: 'New York Loft',
    building: 'Hudson Yards Loft',
    timezone: 'America/New_York',
    currency: 'USD',
    headcount: 22,
    floors: [{ id: 'F18', label: 'F18', desks: 18, plan: true, share: 1 }],
    grid: { w: 24, h: 14 },
    weather: { tempC: 9, kind: 'clear', commuteMins: 27, transit: 'Subway 7 line' },
    costPerDeskDay: 58,
    kgCo2PerDeskDay: 1.9,
    kwhPerDay: 780,
    renewablePct: 41,
    rhythm: [0.4, 0.7, 0.75, 0.6, 0.18, 0.02, 0.01],
    wifiSsid: 'Helix-Guest-NYC',
    color: '#818cf8',
  },
];

export const SITE_IDS: SiteId[] = SITES.map((s) => s.id);
export const SITE_BY_ID: Record<SiteId, Site> = Object.fromEntries(SITES.map((s) => [s.id, s])) as Record<SiteId, Site>;

/** "Dubai" / "london" / "New York" / "NYC" → site id. */
export function siteFromText(text: string | undefined | null): SiteId | null {
  const t = (text ?? '').toLowerCase();
  if (!t) return null;
  if (/dubai|dxb|uae/.test(t)) return 'dubai';
  if (/london|ldn|\buk\b/.test(t)) return 'london';
  if (/singapore|\bsg\b|sin\b/.test(t)) return 'singapore';
  if (/new york|newyork|nyc|\bny\b/.test(t)) return 'newyork';
  return null;
}

/* ───────────────────────── zones & desks ───────────────────────── */

interface DeskGrid {
  cols: number;
  rows: number;
  x0: number;
  y0: number;
  dx: number;
  dy: number;
  /** Which desks sit on the window line. */
  window: 'top' | 'left';
}
interface ZoneSeed {
  key: string;
  kind: ZoneKind;
  x: number;
  y: number;
  w: number;
  h: number;
  s: [number, number, number];
  team?: string;
  desks?: DeskGrid;
}

const ZONE_SEEDS: Record<SiteId, ZoneSeed[]> = {
  dubai: [
    { key: 'focus', kind: 'focus', x: 0.5, y: 0.5, w: 10, h: 7.5, s: [640, 22.4, 44], team: 'Engineering', desks: { cols: 4, rows: 3, x0: 1.9, y0: 1.9, dx: 2.4, dy: 2.3, window: 'top' } },
    { key: 'collab', kind: 'collab', x: 11, y: 0.5, w: 7.5, h: 6, s: [780, 23.1, 56], team: 'Product & Design', desks: { cols: 4, rows: 2, x0: 12.1, y0: 2, dx: 1.8, dy: 2.6, window: 'top' } },
    { key: 'phone', kind: 'phone', x: 19, y: 0.5, w: 4.5, h: 3.6, s: [560, 22.8, 38] },
    { key: 'quiet', kind: 'quiet', x: 0.5, y: 8.5, w: 8, h: 5, s: [520, 22, 34], team: 'People & Ops', desks: { cols: 3, rows: 2, x0: 1.7, y0: 9.8, dx: 2.1, dy: 2.3, window: 'left' } },
    { key: 'wellness', kind: 'wellness', x: 20, y: 8.5, w: 3.5, h: 5, s: [450, 23, 30] },
  ],
  london: [
    { key: 'collab', kind: 'collab', x: 0.5, y: 0.5, w: 9, h: 6, s: [820, 21.4, 58], team: 'Product & Growth', desks: { cols: 4, rows: 2, x0: 1.7, y0: 2, dx: 2.2, dy: 2.6, window: 'top' } },
    { key: 'focus', kind: 'focus', x: 10, y: 0.5, w: 8, h: 6, s: [610, 21, 42], team: 'Finance & Data', desks: { cols: 4, rows: 2, x0: 11.2, y0: 2, dx: 1.9, dy: 2.6, window: 'top' } },
    { key: 'phone', kind: 'phone', x: 19, y: 0.5, w: 4.5, h: 3.6, s: [570, 21.6, 39] },
    { key: 'quiet', kind: 'quiet', x: 0.5, y: 7.5, w: 7, h: 6, s: [540, 20.8, 35], team: 'Engineering', desks: { cols: 3, rows: 2, x0: 1.7, y0: 9, dx: 2.1, dy: 2.6, window: 'left' } },
    { key: 'wellness', kind: 'wellness', x: 19.5, y: 8, w: 4, h: 5.5, s: [460, 21.5, 31] },
  ],
  singapore: [
    { key: 'collab', kind: 'collab', x: 0.5, y: 0.5, w: 9, h: 6, s: [700, 23.4, 52], team: 'Design & Research', desks: { cols: 4, rows: 2, x0: 1.7, y0: 2, dx: 2.2, dy: 2.6, window: 'top' } },
    { key: 'focus', kind: 'focus', x: 10, y: 0.5, w: 7, h: 6, s: [600, 22.9, 41], team: 'Finance', desks: { cols: 3, rows: 2, x0: 11.3, y0: 2, dx: 2.2, dy: 2.6, window: 'top' } },
    { key: 'quiet', kind: 'quiet', x: 0.5, y: 7.5, w: 6.5, h: 6, s: [510, 22.5, 33], team: 'Product', desks: { cols: 3, rows: 2, x0: 1.6, y0: 9, dx: 2, dy: 2.6, window: 'left' } },
    { key: 'phone', kind: 'phone', x: 7.5, y: 7.5, w: 4, h: 3, s: [580, 23, 38] },
    { key: 'wellness', kind: 'wellness', x: 17.5, y: 7.5, w: 6, h: 6, s: [470, 23.2, 30] },
  ],
  newyork: [
    { key: 'collab', kind: 'collab', x: 0.5, y: 0.5, w: 8, h: 6, s: [740, 21.8, 55], team: 'Sales', desks: { cols: 4, rows: 2, x0: 1.6, y0: 2, dx: 1.9, dy: 2.6, window: 'top' } },
    { key: 'focus', kind: 'focus', x: 9, y: 0.5, w: 7, h: 6, s: [590, 21.5, 42], team: 'Customer Success', desks: { cols: 3, rows: 2, x0: 10.3, y0: 2, dx: 2.2, dy: 2.6, window: 'top' } },
    { key: 'quiet', kind: 'quiet', x: 0.5, y: 7.5, w: 6, h: 6, s: [500, 21.2, 33], team: 'Product', desks: { cols: 2, rows: 2, x0: 1.9, y0: 9, dx: 2.6, dy: 2.6, window: 'left' } },
    { key: 'phone', kind: 'phone', x: 7, y: 7.5, w: 4, h: 3, s: [560, 21.6, 37] },
    { key: 'wellness', kind: 'wellness', x: 17, y: 7.5, w: 6.5, h: 6, s: [455, 21.8, 30] },
  ],
};

const SITE_CODE: Record<SiteId, string> = { dubai: 'dxb', london: 'ldn', singapore: 'sgp', newyork: 'nyc' };
const DESK_LETTER: Partial<Record<ZoneKind, string>> = { focus: 'F', collab: 'C', quiet: 'Q' };
const sensorsOf = (s: [number, number, number]): Sensors => ({ co2: s[0], tempC: s[1], noiseDb: s[2] });

export const ZONES: Zone[] = SITES.flatMap((site) =>
  ZONE_SEEDS[site.id].map((z) => ({
    id: `${SITE_CODE[site.id]}-${z.key}`,
    site: site.id,
    kind: z.kind,
    team: z.team,
    x: z.x,
    y: z.y,
    w: z.w,
    h: z.h,
    sensors: sensorsOf(z.s),
  })),
);
export const ZONE_BY_ID: Record<string, Zone> = Object.fromEntries(ZONES.map((z) => [z.id, z]));

function amenitiesFor(kind: ZoneKind, index: number, onWindow: boolean): Amenity[] {
  const out: Amenity[] = [];
  if (kind === 'focus' || (kind === 'collab' && index % 2 === 0) || (kind === 'quiet' && index % 3 === 0)) out.push('dual-monitor');
  if (index % 3 === 1) out.push('standing');
  if (onWindow) out.push('window');
  return out;
}

export const DESKS: Desk[] = SITES.flatMap((site) =>
  ZONE_SEEDS[site.id].flatMap((z) => {
    const g = z.desks;
    const letter = DESK_LETTER[z.kind];
    if (!g || !letter) return [];
    const out: Desk[] = [];
    for (let r = 0; r < g.rows; r++)
      for (let c = 0; c < g.cols; c++) {
        const i = r * g.cols + c;
        const code = `${letter}-${String(i + 1).padStart(2, '0')}`;
        const onWindow = g.window === 'top' ? r === 0 : c === 0;
        out.push({
          id: `${SITE_CODE[site.id]}-${code.toLowerCase()}`,
          code,
          site: site.id,
          zoneId: `${SITE_CODE[site.id]}-${z.key}`,
          x: +(g.x0 + c * g.dx).toFixed(2),
          y: +(g.y0 + r * g.dy).toFixed(2),
          amenities: amenitiesFor(z.kind, i, onWindow),
        });
      }
    return out;
  }),
);
export const DESK_BY_ID: Record<string, Desk> = Object.fromEntries(DESKS.map((d) => [d.id, d]));

export const desksOf = (site: SiteId) => DESKS.filter((d) => d.site === site);
export const zonesOf = (site: SiteId) => ZONES.filter((z) => z.site === site);

/* ───────────────────────── rooms ───────────────────────── */

export function kindForCapacity(capacity: number): RoomKind {
  if (capacity <= 1) return 'pod';
  if (capacity <= 5) return 'huddle';
  if (capacity <= 10) return 'meeting';
  return 'boardroom';
}

/** Calendar equipment strings → Spaces gear filters. */
export function gearFromEquipment(equipment: string[]): RoomGear[] {
  const text = equipment.join(' | ').toLowerCase();
  const out = new Set<RoomGear>();
  if (/holo|spatial camera|spatial holo/.test(text)) out.add('holomeet');
  if (/whiteboard|figma|canvas|touch foil/.test(text)) out.add('whiteboard');
  if (/codec|camera|mic|eye-contact|subtitle|audio bar/.test(text)) out.add('vc');
  if (/8k|display|hud|wall|canvas/.test(text)) out.add('display');
  return [...out];
}

/** "Room Nebula · Holo-Boardroom" → "Nebula". */
export function shortRoomName(name: string): string {
  return name.split('·')[0].replace(/^(room|pod)\s+/i, '').trim() || name;
}

interface RoomPlace {
  site: SiteId;
  zone?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  kind?: RoomKind;
  gear?: RoomGear[];
  co2Load?: number;
}

/** Where Calendar's Spatial Rooms sit on the Spaces plans. */
export const CAL_LAYOUT: Record<string, RoomPlace> = {
  'room-nebula': { site: 'dubai', x: 9, y: 8.5, w: 6.5, h: 5, kind: 'boardroom', gear: ['holomeet', 'vc', 'display', 'whiteboard'], co2Load: 2.1 },
  'room-orbit': { site: 'dubai', x: 16, y: 8.5, w: 3.5, h: 5, kind: 'meeting', gear: ['vc', 'display'] },
  'pod-solitude': { site: 'dubai', zone: 'dxb-quiet', x: 6.9, y: 9, w: 1.3, h: 1.6, kind: 'pod', gear: [] },
  'pod-zenith': { site: 'london', x: 19, y: 4.5, w: 4.5, h: 3, kind: 'huddle', gear: ['vc', 'whiteboard'] },
  'room-aurora': { site: 'singapore', x: 17.5, y: 0.5, w: 6, h: 6, kind: 'meeting', gear: ['holomeet', 'vc', 'display', 'whiteboard'] },
};

interface NativeRoom extends RoomPlace {
  id: string;
  name: string;
  code: string;
  floor: string;
  capacity: number;
  kind: RoomKind;
  gear: RoomGear[];
  s: [number, number, number];
  color: string;
}

const booths = (site: SiteId, code: string, floor: string, zone: string, n: number, x0: number, y: number, w: number, h: number, step: number): NativeRoom[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `${SITE_CODE[site]}-booth-${i + 1}`,
    name: `Booth ${i + 1}`,
    code: `${code}-PB-${i + 1}`,
    site,
    zone,
    floor,
    capacity: 1,
    kind: 'phone' as const,
    gear: ['vc'] as RoomGear[],
    x: +(x0 + i * step).toFixed(2),
    y,
    w,
    h,
    s: [560 + i * 25, 22.4, 36] as [number, number, number],
    color: '#38bdf8',
  }));

const NATIVE_ROOMS: NativeRoom[] = [
  // Dubai · L41
  { id: 'dxb-orion', name: 'Orion', code: 'DXB-HUDDLE-07', site: 'dubai', floor: 'L41', capacity: 6, kind: 'huddle', gear: ['holomeet', 'whiteboard', 'vc', 'display'], x: 19, y: 4.5, w: 4.5, h: 3.5, s: [590, 22.2, 33], color: '#c084fc' },
  ...booths('dubai', 'DXB', 'L41', 'dxb-phone', 3, 19.2, 0.7, 1.25, 3.2, 1.45),
  { id: 'dxb-oasis', name: 'Oasis', code: 'DXB-WELL-01', site: 'dubai', zone: 'dxb-wellness', floor: 'L41', capacity: 2, kind: 'wellness', gear: [], x: 20.3, y: 8.9, w: 2.9, h: 4.2, s: [430, 23, 28], color: '#34d399' },
  // London · L6
  { id: 'ldn-thames', name: 'Thames', code: 'LDN-MEET-03', site: 'london', floor: 'L6', capacity: 10, kind: 'meeting', gear: ['vc', 'display', 'whiteboard'], x: 8, y: 7.5, w: 6.5, h: 6, s: [690, 21.2, 36], color: '#60a5fa' },
  { id: 'ldn-bricklane', name: 'Brick Lane', code: 'LDN-HUDDLE-05', site: 'london', floor: 'L6', capacity: 5, kind: 'huddle', gear: ['whiteboard', 'display'], x: 15, y: 7.5, w: 4, h: 6, s: [640, 21.4, 35], color: '#fb923c' },
  ...booths('london', 'LDN', 'L6', 'ldn-phone', 2, 19.3, 0.7, 1.9, 3.2, 2.1),
  { id: 'ldn-haven', name: 'Haven', code: 'LDN-WELL-01', site: 'london', zone: 'ldn-wellness', floor: 'L6', capacity: 2, kind: 'wellness', gear: [], x: 19.8, y: 8.4, w: 3.4, h: 4.7, s: [440, 21.6, 29], color: '#34d399' },
  // Singapore · L28
  { id: 'sgp-orchid', name: 'Orchid', code: 'SGP-MEET-05', site: 'singapore', floor: 'L28', capacity: 6, kind: 'meeting', gear: ['holomeet', 'vc', 'display'], x: 12, y: 7.5, w: 5, h: 6, s: [620, 23, 35], color: '#f472b6' },
  { id: 'sgp-merlion', name: 'Merlion', code: 'SGP-HUDDLE-02', site: 'singapore', floor: 'L28', capacity: 4, kind: 'huddle', gear: ['vc', 'whiteboard'], x: 7.5, y: 11, w: 4, h: 2.5, s: [600, 23.1, 34], color: '#22d3ee' },
  ...booths('singapore', 'SGP', 'L28', 'sgp-phone', 2, 7.7, 7.7, 1.7, 2.6, 1.9),
  { id: 'sgp-lotus', name: 'Lotus', code: 'SGP-WELL-01', site: 'singapore', zone: 'sgp-wellness', floor: 'L28', capacity: 2, kind: 'wellness', gear: [], x: 18, y: 8, w: 5, h: 5, s: [450, 23.2, 29], color: '#34d399' },
  // New York · F18
  { id: 'ny-hudson', name: 'Hudson', code: 'NYC-BOARD-01', site: 'newyork', floor: 'F18', capacity: 12, kind: 'boardroom', gear: ['holomeet', 'vc', 'display', 'whiteboard'], x: 16.5, y: 0.5, w: 7, h: 6, s: [610, 21.4, 34], color: '#818cf8' },
  { id: 'ny-chelsea', name: 'Chelsea', code: 'NYC-MEET-04', site: 'newyork', floor: 'F18', capacity: 6, kind: 'meeting', gear: ['vc', 'display'], x: 11.5, y: 7.5, w: 5, h: 6, s: [650, 21.6, 36], color: '#fbbf24' },
  { id: 'ny-highline', name: 'Highline', code: 'NYC-HUDDLE-06', site: 'newyork', floor: 'F18', capacity: 4, kind: 'huddle', gear: ['whiteboard'], x: 7, y: 11, w: 4, h: 2.5, s: [600, 21.5, 34], color: '#34d399' },
  ...booths('newyork', 'NYC', 'F18', 'nyc-phone', 2, 7.2, 7.7, 1.7, 2.6, 1.9),
  { id: 'ny-sanctuary', name: 'Sanctuary', code: 'NYC-WELL-01', site: 'newyork', zone: 'nyc-wellness', floor: 'F18', capacity: 2, kind: 'wellness', gear: [], x: 17.5, y: 8, w: 5.5, h: 5, s: [440, 21.8, 28], color: '#34d399' },
];

export const NATIVE_ROOM_LIST: Room[] = NATIVE_ROOMS.map((r) => ({
  id: r.id,
  name: r.name,
  code: r.code,
  site: r.site,
  floor: r.floor,
  capacity: r.capacity,
  kind: r.kind,
  gear: r.gear,
  zoneId: r.zone,
  x: r.x,
  y: r.y,
  w: r.w,
  h: r.h,
  sensors: sensorsOf(r.s),
  co2Load: 1,
  color: r.color,
  source: 'spaces',
}));

/** Helix Calendar's seeded Spatial Rooms (used when Calendar can't be loaded). */
export const FALLBACK_CAL_ROOMS: CalRoomLite[] = [
  { id: 'room-nebula', name: 'Room Nebula · Holo-Boardroom', code: 'DXB-ATRIUM-01', hub: 'Dubai', floor: 'Level 42 · Sky Atrium', capacity: 14, color: '#22d3ee', status: 'occupied', currentEventTitle: 'Platform Architecture & Release Stand-up', nextFreeLabel: 'Free in 18m', equipment: ['360° Spatial Holo-Wall', 'Nova Live Scribe Array', 'Bilingual EN/AR Beamforming Mics', 'Dual 8K Canvas'], telemetry: { co2Ppm: 465, tempC: 21.5, acousticDb: 34, holoArrayHealth: 99 } },
  { id: 'room-orbit', name: 'Room Orbit · Executive Briefing Pod', code: 'DXB-EXEC-04', hub: 'Dubai', floor: 'Level 41 · Executive Wing', capacity: 8, color: '#fb923c', status: 'available', nextFreeLabel: 'Available now · Pre-warmed for 11:00', equipment: ['Zero-Trust Encrypted Codec', 'Nova CRM Deal HUD', 'Spatial Audio Bar', 'Smart Privacy Glass'], telemetry: { co2Ppm: 410, tempC: 21, acousticDb: 28, holoArrayHealth: 100 } },
  { id: 'pod-zenith', name: 'Pod Zenith · Acoustic Deep-Sync', code: 'LDN-SHORE-02', hub: 'London', floor: 'Level 6 · Shoreditch Studio', capacity: 4, color: '#a855f7', status: 'available', nextFreeLabel: 'Available all afternoon', equipment: ['4K Eye-Contact Corrector', 'Studio Condenser Array', 'Whiteboard Touch Foil'], telemetry: { co2Ppm: 430, tempC: 20.5, acousticDb: 26, holoArrayHealth: 98 } },
  { id: 'room-aurora', name: 'Room Aurora · APAC Design Lab', code: 'SGP-MARINA-03', hub: 'Singapore', floor: 'Level 28 · Marina Bay', capacity: 10, color: '#f472b6', status: 'pre_warming', currentEventTitle: 'Pre-warming for Design Critique (15:00)', nextFreeLabel: 'Reserved in 25m', equipment: ['Figma Interactive Wall', 'Multilingual EN/AR/JP Subtitles', 'Spatial Camera Rig'], telemetry: { co2Ppm: 440, tempC: 22, acousticDb: 30, holoArrayHealth: 99 } },
  { id: 'pod-solitude', name: 'Pod Solitude · Biometric Focus Capsule', code: 'DXB-QUIET-09', hub: 'Dubai', floor: 'Level 40 · Library Wing', capacity: 1, color: '#34d399', status: 'available', nextFreeLabel: 'Available now · Circadian Lighting Ready', equipment: ['Active Noise Cancelling Dome', 'Circadian Daylight Lamp', 'Focus Timer Hardware Sync'], telemetry: { co2Ppm: 395, tempC: 21.2, acousticDb: 19, holoArrayHealth: 100 } },
];

/** Merge Calendar's live rooms (mapped onto the plans) with the Spaces-native rooms. */
export function buildRooms(calRooms: CalRoomLite[]): Room[] {
  const fromCal: Room[] = [];
  for (const r of calRooms) {
    const place = CAL_LAYOUT[r.id];
    const site = place?.site ?? siteFromText(r.hub);
    if (!site) continue;
    fromCal.push({
      id: r.id,
      name: shortRoomName(r.name),
      code: r.code,
      site,
      floor: r.floor.split('·')[0].replace(/level\s*/i, 'L').trim(),
      capacity: r.capacity,
      kind: place?.kind ?? kindForCapacity(r.capacity),
      gear: place?.gear ?? gearFromEquipment(r.equipment),
      zoneId: place?.zone,
      x: place?.x,
      y: place?.y,
      w: place?.w,
      h: place?.h,
      sensors: { co2: r.telemetry.co2Ppm, tempC: r.telemetry.tempC, noiseDb: r.telemetry.acousticDb },
      co2Load: place?.co2Load ?? 1,
      color: r.color,
      source: 'calendar',
      calendarStatus: r.status,
      calendarTitle: r.currentEventTitle,
      calendarNextFree: r.nextFreeLabel,
    });
  }
  return [...fromCal, ...NATIVE_ROOM_LIST];
}

/* ───────────────────────── parking & lockers ───────────────────────── */

const PARKING_SEED: Record<SiteId, { n: number; ev: number; kw: number; level: string; accessible: number }> = {
  dubai: { n: 12, ev: 4, kw: 22, level: 'B2', accessible: 5 },
  london: { n: 6, ev: 2, kw: 7, level: 'B1', accessible: 3 },
  singapore: { n: 8, ev: 3, kw: 11, level: 'B1', accessible: 4 },
  newyork: { n: 4, ev: 1, kw: 11, level: 'G', accessible: 2 },
};

export const PARKING: ParkingSpot[] = SITES.flatMap((site) => {
  const p = PARKING_SEED[site.id];
  return Array.from({ length: p.n }, (_, i) => ({
    id: `${SITE_CODE[site.id]}-p-${i + 1}`,
    site: site.id,
    code: `P-${String(i + 1).padStart(2, '0')}`,
    ev: i < p.ev,
    kw: i < p.ev ? p.kw : undefined,
    accessible: i + 1 === p.accessible,
    level: p.level,
  }));
});

export const LOCKERS: Locker[] = SITES.flatMap((site) =>
  Array.from({ length: 24 }, (_, i) => ({
    id: `${SITE_CODE[site.id]}-l-${i + 1}`,
    site: site.id,
    code: `L-${String(i + 1).padStart(2, '0')}`,
    bank: i < 12 ? 'A' : 'B',
    size: (i % 4 === 3 ? 'L' : i % 3 === 2 ? 'M' : 'S') as Locker['size'],
  })),
);

export const parkingOf = (site: SiteId) => PARKING.filter((p) => p.site === site);
export const lockersOf = (site: SiteId) => LOCKERS.filter((l) => l.site === site);

/* ───────────────────────── screening ───────────────────────── */

/** Seeded denied-party list used by visitor screening (demo scenario only). */
export const WATCHLIST: { name: string; company: string; reason: string }[] = [
  { name: 'Marcus Vane', company: 'Northwind Recon', reason: 'Denied-party screening match (export-control list)' },
];
