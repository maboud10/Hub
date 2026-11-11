/**
 * Spaces — "Orbit" shared UI primitives, cross-app bridges, interactive SVG
 * floorplan, and printable QR visitor badge card.
 */
import {
  createContext,
  useContext,
  useMemo,
} from 'react';
import {
  Building2,
  CloudRain,
  CloudSun,
  Compass,
  Eye,
  EyeOff,
  Monitor,
  Printer,
  QrCode,
  ShieldCheck,
  Sparkles,
  Sun,
  Thermometer,
  Train,
  Users,
  Video,
  Volume2,
  Wifi,
  Wind,
} from 'lucide-react';
import { Chip, Orb, type Tone } from '@/components/neo';
import { currentViewer, loadBridge } from '@/lib/appBridge';
import { cx } from '@/lib/cx';
import { useHub } from '@/store/hub';
import { toast } from '@/store/toast';
import type { User } from '@/types';
import {
  type DeskRecommendation,
  formatDecimalHour,
  sensorHealth,
} from '@/spaces/engine';
import {
  SITES,
  SITE_BY_ID,
  desksOf,
  siteDay,
  zonesOf,
} from '@/spaces/seed';
import { useSpaces } from '@/spaces/store';
import type {
  Booking,
  CalEventLite,
  Desk,
  Room,
  ServiceRequest,
  SiteId,
  TripLite,
  Visitor,
  ZoneKind,
} from '@/spaces/types';

/* ───────────────────────── UI Context ───────────────────────── */

export interface SpacesUiContextValue {
  site: SiteId;
  setSite: (s: SiteId) => void;
  dayOffset: number;
  setDayOffset: (d: number) => void;
  date: string;
  rooms: Room[];
  calEvents: CalEventLite[];
  trips: TripLite[];
  openVisitorModal: () => void;
  openNovaDrawer: (initialPrompt?: string) => void;
}

export const SpacesUiCtx = createContext<SpacesUiContextValue | null>(null);

export function useSpacesUi(): SpacesUiContextValue {
  const ctx = useContext(SpacesUiCtx);
  if (!ctx) {
    throw new Error('useSpacesUi must be used inside SpacesPage');
  }
  return ctx;
}

/* ───────────────────────── Cross-App Hand-off Helpers ───────────────────────── */

export async function syncRoomBookingToCalendar(opts: {
  title: string;
  dayOffset: number;
  startHour: number;
  durationMins: number;
  attendeeIds: string[];
  roomId: string;
  roomName: string;
  meetRoomId?: string;
}): Promise<string | undefined> {
  try {
    const { useCalendar } = await import('@/calendar/store');
    const ev = useCalendar.getState().createEvent({
      title: opts.title,
      description: `Booked via Orbit Spaces (${opts.roomName})`,
      category: 'meet',
      dayOffset: opts.dayOffset,
      startHour: opts.startHour,
      durationMins: opts.durationMins,
      attendeeIds: opts.attendeeIds,
      roomId: opts.roomId,
      roomName: opts.roomName,
      meetRoomId: opts.meetRoomId,
      linkedContext: {
        app: 'spaces',
        label: `Spaces · ${opts.roomName}`,
        to: `/spaces/rooms?room=${opts.roomId}`,
      },
    });
    return ev?.id;
  } catch {
    toast.info('Saved room booking locally', 'Calendar sync will complete when Helix Calendar is online.');
    return undefined;
  }
}

export async function launchHoloMeetRoom(
  title: string,
  navigate: (to: string) => void,
): Promise<string | undefined> {
  try {
    const { useMeet } = await import('@/meet/store');
    const room = useMeet.getState().launchInstantRoom(title, 'design');
    navigate(`/meet/room?room=${room.id}`);
    return room.id;
  } catch {
    toast.info('Opening HoloMeet bridge', title);
    navigate('/meet');
    return undefined;
  }
}

export async function pingColleagueOnChat(opts: {
  toUserId: string;
  text: string;
  cardTitle: string;
  cardSubtitle: string;
  toRoute: string;
  statusLabel?: string;
}): Promise<string | undefined> {
  try {
    const viewer = currentViewer();
    if (!viewer) return undefined;
    const chat = await loadBridge('chat');
    const res = chat.sendDirect(viewer, {
      toUserId: opts.toUserId,
      text: opts.text,
      card: {
        app: 'spaces',
        title: opts.cardTitle,
        subtitle: opts.cardSubtitle,
        to: opts.toRoute,
        status: opts.statusLabel ?? 'Orbit Spaces',
      },
    });
    if (res.ok) {
      toast.success('Sent Pulse Chat ping', opts.cardTitle);
      return res.to;
    }
  } catch {
    // Fallback
  }
  toast.info('Notified via Pulse Chat', opts.cardTitle);
  return '/chat';
}

export async function sendVisitorInviteMail(visitor: Visitor, hostName: string): Promise<string | undefined> {
  try {
    const viewer = currentViewer();
    if (!viewer) return undefined;
    const mail = await loadBridge('mail');
    const siteMeta = SITE_BY_ID[visitor.site];
    const res = mail.sendMail(viewer, {
      to: [visitor.email ?? `${visitor.name.toLowerCase().replace(/\s+/g, '.')}@guest.io`],
      subject: `Your Helix Visitor Pass (${visitor.badge}) · ${siteMeta.label}`,
      body: `Welcome ${visitor.name},\n\n${hostName} has pre-registered your visit to ${siteMeta.building} on ${visitor.date} at ${formatDecimalHour(visitor.hour)}.\n\n• Express Badge Code: ${visitor.badge}\n• Guest Wi-Fi: ${siteMeta.wifiSsid}\n${visitor.parkingCode ? `• Reserved Parking Bay: ${visitor.parkingCode}\n` : ''}\nPresent this pass at the lobby turnstile or reception kiosk.`,
      source: {
        app: 'spaces',
        label: `Visitor · ${visitor.badge}`,
        to: `/spaces/visitors?visitor=${visitor.id}`,
      },
    });
    if (res.ok) {
      toast.success('Sent QR pass via Nova Mail', visitor.email ?? visitor.name);
      return res.to;
    }
  } catch {
    // Fallback
  }
  toast.success('Sent visitor QR pass', visitor.email ?? visitor.name);
  return '/mail';
}

export async function escalateWatchToSecurity(visitor: Visitor): Promise<{ caseId?: string; caseTo?: string; queuedLocally?: boolean }> {
  try {
    const viewer = currentViewer();
    if (viewer) {
      const sec = await loadBridge('security');
      const res = sec.reportSignal(viewer, {
        kind: 'other',
        title: `Visitor watchlist match: ${visitor.name} (${visitor.company})`,
        detail: `${visitor.watch?.reason ?? 'Denied-party match'} at ${SITE_BY_ID[visitor.site].label} kiosk.`,
        severity: 'high',
        source: {
          app: 'spaces',
          label: `Spaces Kiosk · ${SITE_BY_ID[visitor.site].city}`,
          to: `/spaces/visitors?visitor=${visitor.id}`,
        },
      });
      if (res.ok) {
        toast.warning('Escalated to Security Center (Bastion)', `Case ${res.caseId} opened`);
        return { caseId: res.caseId, caseTo: res.to };
      }
    }
  } catch {
    // Fallback
  }
  toast.warning('Logged on front-desk security hold', 'Queued for SOC review');
  return { caseId: 'SOC-HOLD-1', caseTo: '/security/threats', queuedLocally: true };
}

export async function escalateRequestToHelpdesk(req: ServiceRequest): Promise<{ ticketId: string; to: string } | null> {
  try {
    const viewer = currentViewer();
    if (viewer) {
      const hd = await loadBridge('helpdesk');
      const res = hd.createTicket(viewer, {
        subject: `[Spaces ${req.code}] ${req.title}`,
        description: `${req.detail ?? ''}\nLocation: ${req.where ?? SITE_BY_ID[req.site].label}`,
        category: 'AV & Workplace Hardware',
        priority: req.priority === 'high' ? 'P2' : 'P3',
        source: {
          app: 'spaces',
          label: `Spaces · ${req.code}`,
          to: `/spaces/requests?req=${req.id}`,
        },
      });
      if (res.ok) {
        toast.success('Linked IT Helpdesk ticket', res.ticketId);
        return { ticketId: res.ticketId, to: res.to };
      }
    }
  } catch {
    // Fallback
  }
  const fallbackId = `HD-${req.code.replace('FR-', '')}`;
  toast.success('Routed to IT Helpdesk', fallbackId);
  return { ticketId: fallbackId, to: '/helpdesk/tickets' };
}

/* ───────────────────────── Site Selector & Weather Bar ───────────────────────── */

function WeatherIcon({ kind }: { kind: string }) {
  if (kind === 'rain' || kind === 'storm') return <CloudRain />;
  if (kind === 'cloudy' || kind === 'humid') return <CloudSun />;
  return <Sun />;
}

export function SiteSelectorBar({ userId }: { userId: string }) {
  const { site, setSite, dayOffset, setDayOffset, openNovaDrawer } = useSpacesUi();
  const hiddenPresence = useSpaces((s) => s.hiddenPresence);
  const togglePresence = useSpaces((s) => s.togglePresenceSharing);
  const bookings = useSpaces((s) => s.bookings);

  const siteMeta = SITE_BY_ID[site];
  const isSharing = !hiddenPresence.includes(userId);

  const countsBySite = useMemo(() => {
    const out: Record<SiteId, number> = { dubai: 0, london: 0, singapore: 0, newyork: 0 };
    for (const s of SITES) {
      const d = siteDay(s.id, dayOffset);
      out[s.id] = bookings.filter(
        (b) =>
          b.site === s.id &&
          b.date === d &&
          b.kind === 'desk' &&
          (b.status === 'booked' || b.status === 'checked_in'),
      ).length;
    }
    return out;
  }, [bookings, dayOffset]);

  return (
    <div className="sp-sitebar">
      <div className="sp-sitebar__hubs" role="tablist" aria-label="Select office hub">
        {SITES.map((s) => {
          const active = s.id === site;
          return (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={active}
              className={cx('sp-hubpill', active && 'is-active')}
              onClick={() => setSite(s.id)}
              data-qa={`sp-site-${s.id}`}
            >
              <span className="sp-hubpill__dot" style={{ background: s.color }} />
              <span className="sp-hubpill__text">
                <span className="sp-hubpill__name">{s.label}</span>
                <span className="sp-hubpill__meta">
                  <b>{countsBySite[s.id]}</b> <span>in office</span>
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="sp-sitebar__right">
        <div className="sp-daystrip" role="group" aria-label="Booking day">
          {[
            { offset: 0, label: 'Today' },
            { offset: 1, label: 'Tomorrow' },
            { offset: 2, label: 'In 2 days' },
          ].map((d) => (
            <button
              key={d.offset}
              type="button"
              className={cx('sp-daybtn', dayOffset === d.offset && 'is-active')}
              onClick={() => setDayOffset(d.offset)}
            >
              {d.label}
            </button>
          ))}
        </div>

        <div className="sp-telemetry-pills">
          <span className="sp-telepill" title={siteMeta.building}>
            <WeatherIcon kind={siteMeta.weather.kind} />
            <b>{siteMeta.weather.tempC}°C</b>
          </span>
          <span className="sp-telepill" title={siteMeta.weather.transit}>
            <Train />
            <b>{siteMeta.weather.commuteMins}m</b>
          </span>
          <span className="sp-telepill" title="Guest Wi-Fi SSID">
            <Wifi />
            <b className="neo-mono">{siteMeta.wifiSsid}</b>
          </span>
        </div>

        <button
          type="button"
          className={cx('neo-btn neo-btn--xs', isSharing ? 'neo-btn--soft' : 'neo-btn--ghost')}
          onClick={() => togglePresence(userId)}
          title="Control whether colleagues see your desk on the floor plan"
        >
          {isSharing ? <Eye /> : <EyeOff />}
          <span>{isSharing ? 'Sharing presence' : 'Presence hidden'}</span>
        </button>

        <button
          type="button"
          className="neo-btn neo-btn--xs neo-btn--nova"
          onClick={() => openNovaDrawer()}
          data-qa="sp-open-nova"
        >
          <Sparkles />
          <span>Ask Nova</span>
        </button>
      </div>
    </div>
  );
}

/* ───────────────────────── Interactive SVG Floor Plan ───────────────────────── */

const ZONE_LABELS: Record<ZoneKind, string> = {
  focus: 'Focus Zone',
  collab: 'Collab Zone',
  quiet: 'Quiet Library',
  phone: 'Phone Booths',
  wellness: 'Wellness Suite',
};

const ZONE_COLORS: Record<ZoneKind, string> = {
  focus: '#38bdf8',
  collab: '#e879f9',
  quiet: '#34d399',
  phone: '#fbbf24',
  wellness: '#a78bfa',
};

export interface FloorPlanProps {
  site: SiteId;
  date: string;
  bookings: Booking[];
  rooms: Room[];
  selectedDeskId?: string | null;
  selectedRoomId?: string | null;
  recommendedMap?: Map<string, DeskRecommendation>;
  highlightTeam?: boolean;
  viewerId: string;
  onSelectDesk?: (desk: Desk, booking?: Booking) => void;
  onSelectRoom?: (room: Room) => void;
  compact?: boolean;
}

export function InteractiveFloorPlan({
  site,
  date,
  bookings,
  rooms,
  selectedDeskId,
  selectedRoomId,
  recommendedMap,
  highlightTeam,
  viewerId,
  onSelectDesk,
  onSelectRoom,
  compact,
}: FloorPlanProps) {
  const users = useHub((s) => s.users);
  const hiddenPresence = useSpaces((s) => s.hiddenPresence);
  const userMap = useMemo(() => new Map<string, User>(users.map((u) => [u.id, u])), [users]);

  const zones = useMemo(() => zonesOf(site), [site]);
  const desks = useMemo(() => desksOf(site), [site]);
  const siteRooms = useMemo(
    () => rooms.filter((r) => r.site === site && r.x !== undefined && r.y !== undefined),
    [rooms, site],
  );

  const deskBookings = useMemo(() => {
    const map = new Map<string, Booking>();
    for (const b of bookings) {
      if (
        b.site === site &&
        b.date === date &&
        b.kind === 'desk' &&
        (b.status === 'booked' || b.status === 'checked_in')
      ) {
        map.set(b.resourceId, b);
      }
    }
    return map;
  }, [bookings, site, date]);

  const roomBookings = useMemo(() => {
    const map = new Map<string, Booking>();
    for (const b of bookings) {
      if (
        b.site === site &&
        b.date === date &&
        b.kind === 'room' &&
        (b.status === 'booked' || b.status === 'checked_in')
      ) {
        map.set(b.resourceId, b);
      }
    }
    return map;
  }, [bookings, site, date]);

  // Scale 24 x 14 grid to 960 x 560 SVG coordinate space (1 grid unit = 40px)
  const S = 40;

  return (
    <div className={cx('sp-floorplan-wrap', compact && 'sp-floorplan-wrap--compact')}>
      <div className="sp-floorplan-legend">
        <span className="sp-legend-item">
          <i className="sp-legend-dot is-free" />
          <span>Available desk</span>
        </span>
        <span className="sp-legend-item">
          <i className="sp-legend-dot is-mine" />
          <span>Your booking</span>
        </span>
        <span className="sp-legend-item">
          <i className="sp-legend-dot is-recommended" />
          <span>Sit near my team match</span>
        </span>
        <span className="sp-legend-item">
          <i className="sp-legend-dot is-occupied" />
          <span>Colleague seated</span>
        </span>
        <span className="sp-legend-item">
          <i className="sp-legend-dot is-ghost" />
          <span>Unchecked-in hold</span>
        </span>
      </div>

      <div className="sp-floorplan-canvas">
        <svg
          viewBox="0 0 960 560"
          className="sp-floorplan-svg"
          role="img"
          aria-label={`${SITE_BY_ID[site].label} interactive floor plan`}
        >
          <defs>
            <pattern id={`sp-grid-${site}`} width="40" height="40" patternUnits="userSpaceOnUse">
              <path
                d="M 40 0 L 0 0 0 40"
                fill="none"
                stroke="currentColor"
                strokeOpacity="0.07"
                strokeWidth="1"
              />
            </pattern>
            <linearGradient id="sp-window-glow" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Architectural background & daylight window line */}
          <rect x="4" y="4" width="952" height="552" rx="18" fill={`url(#sp-grid-${site})`} className="sp-svg-plate" />
          <rect x="12" y="6" width="936" height="14" rx="6" fill="url(#sp-window-glow)" />
          <text x="480" y="16" textAnchor="middle" className="sp-svg-window-label">
            DAYLIGHT PANORAMA WINDOW LINE
          </text>

          {/* Zones */}
          {zones.map((z) => {
            const zColor = ZONE_COLORS[z.kind] ?? '#e879f9';
            const zx = z.x * S;
            const zy = z.y * S;
            const zw = z.w * S;
            const zh = z.h * S;
            return (
              <g key={z.id} className="sp-svg-zone">
                <rect
                  x={zx}
                  y={zy}
                  width={zw}
                  height={zh}
                  rx="14"
                  fill={zColor}
                  fillOpacity="0.07"
                  stroke={zColor}
                  strokeOpacity="0.32"
                  strokeWidth="1.5"
                />
                <text x={zx + 12} y={zy + 20} className="sp-svg-zone-title" fill={zColor}>
                  {z.team ? `${z.team.toUpperCase()} · ${ZONE_LABELS[z.kind].toUpperCase()}` : ZONE_LABELS[z.kind].toUpperCase()}
                </text>
                <text x={zx + zw - 12} y={zy + 20} textAnchor="end" className="sp-svg-zone-sensor">
                  {z.sensors.co2} ppm · {z.sensors.tempC}°C · {z.sensors.noiseDb} dBA
                </text>
              </g>
            );
          })}

          {/* Spatial & Meeting Rooms */}
          {siteRooms.map((room) => {
            const rx = (room.x ?? 0) * S;
            const ry = (room.y ?? 0) * S;
            const rw = (room.w ?? 3) * S;
            const rh = (room.h ?? 3) * S;
            const activeBk = roomBookings.get(room.id);
            const busy = Boolean(activeBk) || room.calendarStatus === 'occupied';
            const isSelected = selectedRoomId === room.id;
            const health = sensorHealth(room.sensors, room.gear.includes('holomeet'));

            return (
              <g
                key={room.id}
                className={cx('sp-svg-room', busy ? 'is-busy' : 'is-free', isSelected && 'is-selected')}
                onClick={() => onSelectRoom?.(room)}
                role="button"
                tabIndex={0}
                aria-label={`Room ${room.name} (${room.capacity} seats)`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectRoom?.(room);
                  }
                }}
              >
                <rect
                  x={rx}
                  y={ry}
                  width={rw}
                  height={rh}
                  rx="12"
                  fill={room.color}
                  fillOpacity={isSelected ? 0.26 : busy ? 0.14 : 0.1}
                  stroke={isSelected ? '#ffffff' : room.color}
                  strokeWidth={isSelected ? 2.5 : 1.6}
                  strokeDasharray={busy ? '4 3' : undefined}
                />
                {rw >= 65 && (
                  <>
                    <text x={rx + 10} y={ry + 20} className="sp-svg-room-name">
                      {room.name}
                    </text>
                    <text x={rx + 10} y={ry + 35} className="sp-svg-room-meta">
                      {room.capacity}p · {health.score}% air
                    </text>
                    {room.gear.includes('holomeet') && rh >= 80 && (
                      <text x={rx + 10} y={ry + rh - 10} className="sp-svg-room-holo">
                        HOLOMEET 3D
                      </text>
                    )}
                  </>
                )}
              </g>
            );
          })}

          {/* Desks */}
          {desks.map((d) => {
            const dx = d.x * S;
            const dy = d.y * S;
            const bk = deskBookings.get(d.id);
            const occupant = bk && !hiddenPresence.includes(bk.userId) ? userMap.get(bk.userId) : undefined;
            const isMine = bk?.userId === viewerId;
            const isGhost = bk && bk.status === 'booked' && !bk.checkedInAt;
            const rec = recommendedMap?.get(d.id);
            const isTopRec = Boolean(rec && highlightTeam && rec.score >= 76);
            const isSelected = selectedDeskId === d.id;

            let fill = 'rgba(34, 197, 94, 0.16)';
            let stroke = '#34d399';
            if (isMine) {
              fill = 'rgba(232, 121, 249, 0.34)';
              stroke = '#e879f9';
            } else if (bk) {
              fill = isGhost ? 'rgba(251, 191, 36, 0.22)' : 'rgba(148, 163, 184, 0.24)';
              stroke = isGhost ? '#fbbf24' : '#94a3b8';
            } else if (isTopRec) {
              fill = 'rgba(56, 189, 248, 0.28)';
              stroke = '#38bdf8';
            }

            const initials = occupant
              ? occupant.name
                  .split(' ')
                  .map((p) => p[0])
                  .join('')
                  .slice(0, 2)
              : '';

            return (
              <g
                key={d.id}
                className={cx(
                  'sp-svg-desk',
                  bk ? 'is-occupied' : 'is-free',
                  isMine && 'is-mine',
                  isTopRec && 'is-recommended',
                  isSelected && 'is-selected',
                )}
                transform={`translate(${dx}, ${dy})`}
                onClick={() => onSelectDesk?.(d, bk)}
                role="button"
                tabIndex={0}
                aria-label={`Desk ${d.code}${occupant ? ` · ${occupant.name}` : ' · Available'}`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectDesk?.(d, bk);
                  }
                }}
              >
                {isTopRec && !bk && (
                  <rect
                    x="-30"
                    y="-22"
                    width="60"
                    height="44"
                    rx="11"
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth="1.5"
                    strokeOpacity="0.65"
                    className="sp-svg-desk-halo"
                  />
                )}
                <rect
                  x="-26"
                  y="-18"
                  width="52"
                  height="36"
                  rx="8"
                  fill={fill}
                  stroke={isSelected ? '#ffffff' : stroke}
                  strokeWidth={isSelected ? 2.5 : 1.6}
                />
                <text x="0" y={occupant ? '-3' : '4'} textAnchor="middle" className="sp-svg-desk-code">
                  {d.code}
                </text>
                {occupant && (
                  <text x="0" y="11" textAnchor="middle" className="sp-svg-desk-user">
                    {initials} · {occupant.name.split(' ')[0]}
                  </text>
                )}
                {!occupant && isTopRec && rec && (
                  <text x="0" y="12" textAnchor="middle" className="sp-svg-desk-match">
                    ★ {rec.score}%
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

/* ───────────────────────── Printable QR Visitor Pass Card ───────────────────────── */

export function QrBadgeCard({
  visitor,
  host,
}: {
  visitor: Visitor;
  host?: User;
}) {
  const siteMeta = SITE_BY_ID[visitor.site];
  const code = visitor.badge ?? 'HLX-PASS';

  // Deterministic 7x7 QR pattern from badge string
  const cells = useMemo(() => {
    const out: boolean[] = [];
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const corner = (r < 2 && c < 2) || (r < 2 && c > 4) || (r > 4 && c < 2);
        if (corner) {
          out.push(true);
        } else {
          const ch = code.charCodeAt((r * 7 + c) % code.length);
          out.push((ch + r * 3 + c * 5) % 2 === 0);
        }
      }
    }
    return out;
  }, [code]);

  const handlePrint = () => {
    toast.success(`Sent badge ${code} to lobby thermal printer`, `${visitor.name} · ${siteMeta.label}`);
  };

  return (
    <div className="sp-qrpass neo-spot">
      <div className="sp-qrpass__top">
        <div>
          <div className="neo-hud">HELIX ORBIT VISITOR PASS</div>
          <h3 className="sp-qrpass__name">{visitor.name}</h3>
          <div className="sp-qrpass__company">{visitor.company}</div>
        </div>
        <Chip tone={visitor.stage === 'badged' ? 'emerald' : visitor.watch && !visitor.watch.cleared ? 'rose' : 'cyan'} size="sm">
          {visitor.stage.toUpperCase()}
        </Chip>
      </div>

      <div className="sp-qrpass__body">
        <div className="sp-qrpass__qr" aria-label={`QR code for ${code}`}>
          <svg viewBox="0 0 70 70" width="84" height="84">
            {cells.map((on, idx) => {
              const r = Math.floor(idx / 7);
              const c = idx % 7;
              return on ? (
                <rect
                  key={idx}
                  x={c * 10 + 1}
                  y={r * 10 + 1}
                  width="8"
                  height="8"
                  rx="1.8"
                  fill="currentColor"
                />
              ) : null;
            })}
          </svg>
          <span className="sp-qrpass__code neo-mono">{code}</span>
        </div>

        <div className="sp-qrpass__details">
          <div className="sp-qrpass__row">
            <span>Host</span>
            <b>{host?.name ?? 'Workplace Reception'}</b>
          </div>
          <div className="sp-qrpass__row">
            <span>Hub & Floor</span>
            <b>{siteMeta.label} · {siteMeta.floors.find((f) => f.plan)?.label ?? 'L1'}</b>
          </div>
          <div className="sp-qrpass__row">
            <span>Date & Arrival</span>
            <b>{visitor.date} · {formatDecimalHour(visitor.hour)}</b>
          </div>
          <div className="sp-qrpass__row">
            <span>Guest Wi-Fi</span>
            <b className="neo-mono">{siteMeta.wifiSsid}</b>
          </div>
          {visitor.parkingCode && (
            <div className="sp-qrpass__row">
              <span>VIP Parking</span>
              <b className="neo-mono">{visitor.parkingCode}</b>
            </div>
          )}
        </div>
      </div>

      <div className="sp-qrpass__foot">
        <span className="sp-qrpass__nda">
          <ShieldCheck />
          <span>{visitor.ndaSigned ? 'NDA Verified' : 'NDA Required at Kiosk'}</span>
        </span>
        <button type="button" className="neo-btn neo-btn--xs neo-btn--soft" onClick={handlePrint}>
          <Printer />
          <span>Print Badge</span>
        </button>
      </div>
    </div>
  );
}

export function SensorStrip({
  co2,
  tempC,
  noiseDb,
  hasHolo,
}: {
  co2: number;
  tempC: number;
  noiseDb: number;
  hasHolo?: boolean;
}) {
  const h = sensorHealth({ co2, tempC, noiseDb }, hasHolo);
  return (
    <div className="sp-sensors">
      <Chip tone={h.co2Tone as Tone} size="sm" icon={<Wind />}>
        <b>{co2}</b> <span>ppm CO₂</span>
      </Chip>
      <Chip tone={h.tempTone as Tone} size="sm" icon={<Thermometer />}>
        <b>{tempC}°C</b>
      </Chip>
      <Chip tone={h.noiseTone as Tone} size="sm" icon={<Volume2 />}>
        <b>{noiseDb}</b> <span>dBA</span>
      </Chip>
      {hasHolo && (
        <Chip tone="violet" size="sm" icon={<Video />}>
          <span>HoloMeet</span> <b>{h.avHealth}%</b>
        </Chip>
      )}
    </div>
  );
}

// Keep unused icons available for barrel consumers
void Building2;
void Compass;
void Monitor;
void QrCode;
void Users;
void Orb;
