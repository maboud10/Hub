/**
 * Spaces — "Today in the Office" (/spaces)
 * Live hub overview: Travel & Expenses trip hand-offs, My Workplace Pass
 * (desk + EV parking + smart locker), Nova Workplace Copilot, interactive
 * floor preview, colleagues in office today with 1-tap "Sit near" & Pulse Chat
 * ping, and office announcements.
 */
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  CalendarDays,
  Car,
  CheckCircle2,
  Leaf,
  Lock,
  MapPin,
  MessageSquare,
  Plane,
  Sparkles,
  UserCheck,
  UserPlus,
  Users,
  Video,
  Wind,
  Zap,
} from 'lucide-react';
import {
  Chip,
  NeoBanner,
  NeoBanners,
  NeoEmpty,
  NeoHome,
  NeoKpi,
  NeoKpis,
  NeoNovaPrompt,
  NeoPanel,
  Ring,
  Spark,
} from '@/components/neo';
import { Avatar } from '@/components/ui/primitives';
import { useHub } from '@/store/hub';
import { useSessionUser } from '@/store/selectors';
import {
  type NovaSpacesAction,
  type NovaSpacesResponse,
  activeBookingsForDay,
  askSpacesNova,
  computePresenceToday,
  computeWorkplacePulse,
  formatDecimalHour,
  recommendDesks,
} from '@/spaces/engine';
import {
  ANNOUNCEMENTS,
  SITE_BY_ID,
  dateMapForOffset,
   lockersOf,
  parkingOf,
} from '@/spaces/seed';
import { useSpaces } from '@/spaces/store';
import {
  InteractiveFloorPlan,
  SensorStrip,
  launchHoloMeetRoom,
  pingColleagueOnChat,
  useSpacesUi,
} from './parts';

export function TodayView() {
  const me = useSessionUser();
  const navigate = useNavigate();
  const users = useHub((s) => s.users);
  const { site, setSite, dayOffset, date, rooms, trips, openVisitorModal } = useSpacesUi();

  const bookings = useSpaces((s) => s.bookings);
  const visitors = useSpaces((s) => s.visitors);
  const requests = useSpaces((s) => s.requests);
  const hiddenPresence = useSpaces((s) => s.hiddenPresence);
  const bookDesk = useSpaces((s) => s.bookDesk);
  const checkInBooking = useSpaces((s) => s.checkInBooking);
  const checkOutBooking = useSpaces((s) => s.checkOutBooking);
  const cancelBooking = useSpaces((s) => s.cancelBooking);
  const releaseGhostDesks = useSpaces((s) => s.releaseGhostDesks);
  const advanceVisitor = useSpaces((s) => s.advanceVisitor);

  const siteMeta = SITE_BY_ID[site];
  const pulse = useMemo(
    () => computeWorkplacePulse(site, date, bookings, visitors, requests),
    [site, date, bookings, visitors, requests],
  );

  const datesMap = useMemo(() => dateMapForOffset(dayOffset), [dayOffset]);
  const colleaguesHere = useMemo(
    () => computePresenceToday(bookings, users, hiddenPresence, datesMap, site),
    [bookings, users, hiddenPresence, datesMap, site],
  );

  const myBookingsToday = useMemo(
    () =>
      bookings.filter(
        (b) =>
          b.userId === me?.id &&
          b.site === site &&
          b.date === date &&
          (b.status === 'booked' || b.status === 'checked_in'),
      ),
    [bookings, me?.id, site, date],
  );

  const myDeskBooking = myBookingsToday.find((b) => b.kind === 'desk');
  const myParkingBooking = myBookingsToday.find((b) => b.kind === 'parking');
  const myLockerBooking = myBookingsToday.find((b) => b.kind === 'locker');

  const topRecommendations = useMemo(() => {
    if (!me) return [];
    return recommendDesks({
      viewer: me,
      site,
      date,
      bookings,
      users,
    });
  }, [me, site, date, bookings, users]);

  const recMap = useMemo(
    () => new Map(topRecommendations.map((r) => [r.desk.id, r])),
    [topRecommendations],
  );

  // Relevant business trip (viewer's own trip first, or a colleague visiting this hub)
  const activeTrip = useMemo(
    () => trips.find((t) => t.userId === me?.id) ?? trips.find((t) => t.site === site) ?? trips[0],
    [trips, me?.id, site],
  );

  const waitingVisitors = useMemo(
    () => visitors.filter((v) => v.site === site && v.date === date && v.stage === 'arrived'),
    [visitors, site, date],
  );

  const roomBookingsToday = useMemo(
    () => activeBookingsForDay(bookings, site, date, 'room').sort((a, b) => a.start - b.start),
    [bookings, site, date],
  );

  const siteAnnouncements = useMemo(
    () => ANNOUNCEMENTS.filter((a) => a.site === site || a.site === 'all'),
    [site],
  );

  const [novaResp, setNovaResp] = useState<NovaSpacesResponse | null>(null);

  const handleAskNova = (prompt: string) => {
    if (!me) return;
    const res = askSpacesNova(prompt, {
      viewer: me,
      site,
      date,
      bookings,
      visitors,
      requests,
      rooms,
      users,
    });
    setNovaResp(res);
  };

  const handleNovaAction = (act: NovaSpacesAction) => {
    if (!me) return;
    if (act.kind === 'book_desk') {
      bookDesk({
        userId: me.id,
        site: act.site,
        deskId: act.deskId,
        date,
        checkInNow: dayOffset === 0,
      });
    } else if (act.kind === 'book_room') {
      navigate(`/spaces/rooms?room=${act.roomId}`);
    } else if (act.kind === 'release_ghosts') {
      releaseGhostDesks(act.site, date);
    } else if (act.kind === 'open_visitor_modal') {
      openVisitorModal();
    } else if (act.kind === 'navigate') {
      navigate(act.to);
    }
  };

  const handleQuickSitNearTeam = (nearUserId?: string) => {
    if (!me) return;
    const freeParking = parkingOf(site)[0];
    const freeLocker = lockersOf(site)[0];
    bookDesk({
      userId: me.id,
      site,
      date,
      nearUserId,
      checkInNow: dayOffset === 0,
      parkingSpotId: myParkingBooking ? undefined : freeParking?.id,
      lockerId: myLockerBooking ? undefined : freeLocker?.id,
    });
  };

  const handleBookTripDesk = () => {
    if (!activeTrip || !me) return;
    setSite(activeTrip.site);
    bookDesk({
      userId: activeTrip.userId,
      site: activeTrip.site,
      date: activeTrip.from,
      source: { app: 'spaces', label: `Trip ${activeTrip.reference}`, to: '/expenses/travel' },
    });
  };

  return (
    <div className="sp-view">
      {/* Attention Banners */}
      <NeoBanners>
        {activeTrip && (
          <NeoBanner
            tone="cyan"
            icon={<Plane />}
            title={`Travel itinerary detected · ${activeTrip.reference} (${activeTrip.city})`}
            meta={`${activeTrip.from} → ${activeTrip.to}`}
            to="/expenses/travel"
            action={
              <button
                type="button"
                className="neo-btn neo-btn--xs neo-btn--plasma"
                onClick={handleBookTripDesk}
              >
                <MapPin />
                <span>Reserve travel desk</span>
              </button>
            }
          >
            <span>{activeTrip.title}</span>
          </NeoBanner>
        )}

        {waitingVisitors.length > 0 && (
          <NeoBanner
            tone={waitingVisitors.some((v) => v.watch && !v.watch.cleared) ? 'danger' : 'violet'}
            icon={<BadgeCheck />}
            title={`${waitingVisitors[0].name} (${waitingVisitors[0].company}) is at the ${siteMeta.label} reception kiosk`}
            to={`/spaces/visitors?visitor=${waitingVisitors[0].id}`}
            action={
              !waitingVisitors[0].watch || waitingVisitors[0].watch.cleared ? (
                <button
                  type="button"
                  className="neo-btn neo-btn--xs neo-btn--plasma"
                  onClick={() => advanceVisitor(waitingVisitors[0].id, 'badge')}
                >
                  <BadgeCheck />
                  <span>Print badge & notify host</span>
                </button>
              ) : undefined
            }
          >
            <span>
              {waitingVisitors[0].watch && !waitingVisitors[0].watch.cleared
                ? waitingVisitors[0].watch.reason
                : waitingVisitors[0].note ?? 'Ready for host notification and badge issuance'}
            </span>
          </NeoBanner>
        )}

        {pulse.ghostDesks.length > 0 && (
          <NeoBanner
            tone="amber"
            icon={<Zap />}
            title="Unchecked-in ghost desks detected past 10:30 window"
            meta={`${pulse.ghostDesks.length} desk(s)`}
            action={
              <button
                type="button"
                className="neo-btn neo-btn--xs neo-btn--soft"
                onClick={() => releaseGhostDesks(site, date)}
                data-qa="sp-release-ghosts-banner"
              >
                <span>Sweep ghost desks</span>
              </button>
            }
          >
            <span>
              Reclaim {pulse.ghostDesks.map((g) => g.label).join(', ')} so teammates can sit together.
            </span>
          </NeoBanner>
        )}
      </NeoBanners>

      {/* Top KPI Ribbon */}
      <NeoKpis>
        <NeoKpi
          label="In Office Today"
          icon={<Users />}
          value={
            <>
              <b>{pulse.bookedDesks}</b>
              <span className="sp-kpi-unit">/ {pulse.totalDesks}</span>
            </>
          }
          sub={
            <>
              <b>{pulse.occupancyPct}%</b> <span>occupancy</span> · <b>{pulse.checkInRatePct}%</b> <span>checked in</span>
            </>
          }
          spark={<Spark data={pulse.weeklyRhythmPct} width={96} height={30} />}
          to="/spaces/desks"
        />
        <NeoKpi
          label="Air & Climate Pulse"
          icon={<Wind />}
          tone={pulse.avgCo2 > 750 ? 'amber' : 'emerald'}
          value={
            <>
              <b>{pulse.avgCo2}</b> <span className="sp-kpi-unit">ppm CO₂</span>
            </>
          }
          sub={
            <>
              <b>{pulse.avgTempC}°C</b> <span>climate</span> · <b>{pulse.avgNoiseDb}</b> <span>dBA acoustics</span>
            </>
          }
          to="/spaces/rooms"
        />
        <NeoKpi
          label="Visitors & Badges"
          icon={<BadgeCheck />}
          value={<b>{pulse.activeVisitors}</b>}
          sub={
            <>
              <b>{pulse.arrivedVisitors}</b> <span>on site now</span> · <span>QR kiosk active</span>
            </>
          }
          to="/spaces/visitors"
        />
        <NeoKpi
          label="Carbon Saved Today"
          icon={<Leaf />}
          tone="emerald"
          value={
            <>
              <b>{pulse.carbonSavedKg}</b> <span className="sp-kpi-unit">kg CO₂e</span>
            </>
          }
          sub={
            <>
              <b>{pulse.energySavedKwh}</b> <span>kWh saved</span> · <b>{siteMeta.renewablePct}%</b> <span>renewable</span>
            </>
          }
          to="/spaces/insights"
        />
      </NeoKpis>

      <NeoHome
        main={
          <>
            {/* Nova Workplace Copilot */}
            <NeoNovaPrompt
              hud="NOVA WORKPLACE COPILOT"
              title="Find a desk near your team, book a HoloMeet room, or audit air quality"
              badge={`${siteMeta.label} · Live`}
              placeholder="Ask Nova e.g. 'Sit near Omar with dual monitors' or 'Book a HoloMeet room for 6'…"
              suggestions={[
                'Sit near my team',
                'Book a HoloMeet room for 6',
                'Release ghost desks',
                'Air quality & carbon pulse',
              ]}
              onSubmit={handleAskNova}
            >
              {novaResp && (
                <div className="sp-nova-result" aria-live="polite">
                  <div className="sp-nova-result__head">
                    <strong>{novaResp.headline}</strong>
                    <Chip tone="violet" size="sm">
                      {novaResp.confidence}
                    </Chip>
                  </div>
                  <p className="sp-nova-result__body">{novaResp.body}</p>
                  <ul className="sp-nova-result__bullets">
                    {novaResp.bullets.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                  <div className="sp-nova-result__actions">
                    {novaResp.actions.map((act, i) => (
                      <button
                        key={i}
                        type="button"
                        className={i === 0 ? 'neo-btn neo-btn--sm neo-btn--plasma' : 'neo-btn neo-btn--sm neo-btn--soft'}
                        onClick={() => handleNovaAction(act)}
                      >
                        <Sparkles />
                        <span>{act.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </NeoNovaPrompt>

            {/* My Workplace Pass Today */}
            <NeoPanel
              hud="MY WORKPLACE PASS"
              title={`Your setup in ${siteMeta.label}`}
              icon={<Building2 />}
              actions={
                <Link to="/spaces/desks" className="neo-btn neo-btn--xs neo-btn--soft">
                  <MapPin />
                  <span>Open Desk Map</span>
                </Link>
              }
            >
              {myDeskBooking ? (
                <div className="sp-mypass">
                  <div className="sp-mypass__main">
                    <div className="sp-mypass__badge">
                      <span className="neo-hud">DESK</span>
                      <strong>{myDeskBooking.label}</strong>
                    </div>
                    <div className="sp-mypass__info">
                      <div className="sp-mypass__title">
                        <span>Desk</span> <b>{myDeskBooking.label}</b> · <span>{siteMeta.building}</span>
                      </div>
                      <div className="sp-mypass__sub">
                        <span>{myDeskBooking.date}</span> ·{' '}
                        <b>
                          {formatDecimalHour(myDeskBooking.start)}–{formatDecimalHour(myDeskBooking.end)}
                        </b>{' '}
                        ·{' '}
                        <Chip
                          tone={myDeskBooking.status === 'checked_in' ? 'emerald' : 'amber'}
                          size="sm"
                        >
                          {myDeskBooking.status === 'checked_in' ? 'Checked in' : 'Reserved'}
                        </Chip>
                      </div>
                      <div className="sp-mypass__addons">
                        {myParkingBooking && (
                          <Chip tone="cyan" size="sm" icon={<Car />}>
                            <span>Bay</span> <b>{myParkingBooking.label}</b> ·{' '}
                            <b className="neo-mono">{myParkingBooking.accessCode}</b>
                          </Chip>
                        )}
                        {myLockerBooking && (
                          <Chip tone="violet" size="sm" icon={<Lock />}>
                            <span>Locker</span> <b>{myLockerBooking.label}</b> ·{' '}
                            <b className="neo-mono">{myLockerBooking.accessCode}</b>
                          </Chip>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="sp-mypass__actions">
                    {myDeskBooking.status === 'booked' && (
                      <button
                        type="button"
                        className="neo-btn neo-btn--sm neo-btn--plasma"
                        onClick={() => checkInBooking(myDeskBooking.id)}
                      >
                        <CheckCircle2 />
                        <span>Check in</span>
                      </button>
                    )}
                    {myDeskBooking.status === 'checked_in' && (
                      <button
                        type="button"
                        className="neo-btn neo-btn--sm neo-btn--soft"
                        onClick={() => checkOutBooking(myDeskBooking.id)}
                      >
                        <span>Check out</span>
                      </button>
                    )}
                    <button
                      type="button"
                      className="neo-btn neo-btn--sm neo-btn--ghost"
                      onClick={() => cancelBooking(myDeskBooking.id)}
                    >
                      <span>Release desk</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="sp-mypass sp-mypass--empty">
                  <div className="sp-mypass__info">
                    <div className="sp-mypass__title">
                      <span>No desk reserved in</span> <b>{siteMeta.label}</b> <span>for</span> <b>{date}</b>
                    </div>
                    <div className="sp-mypass__sub">
                      {topRecommendations[0] ? (
                        <>
                          <span>Best match: Desk</span> <b>{topRecommendations[0].desk.code}</b> (
                          <b>{topRecommendations[0].score}%</b> <span>fit</span> —{' '}
                          <span>{topRecommendations[0].reasons[0]}</span>)
                        </>
                      ) : (
                        <span>Pick a desk on the interactive floor plan or sit near your team in one tap.</span>
                      )}
                    </div>
                  </div>
                  <div className="sp-mypass__actions">
                    <button
                      type="button"
                      className="neo-btn neo-btn--sm neo-btn--plasma"
                      onClick={() => handleQuickSitNearTeam()}
                      data-qa="sp-quick-sit-team"
                    >
                      <Sparkles />
                      <span>Sit near my team</span>
                    </button>
                    <Link to="/spaces/desks" className="neo-btn neo-btn--sm neo-btn--soft">
                      <span>Choose on map</span>
                    </Link>
                  </div>
                </div>
              )}
            </NeoPanel>

            {/* Interactive Floor Snapshot */}
            <NeoPanel
              hud="ISOMETRIC FLOOR TELEMETRY"
              title={`${siteMeta.label} · ${siteMeta.floors.find((f) => f.plan)?.label ?? 'Main Floor'} Live Plan`}
              icon={<MapPin />}
              actions={
                <Link to="/spaces/desks" className="neo-btn neo-btn--xs neo-btn--soft">
                  <span>Full Floor Plan</span>
                  <ArrowRight />
                </Link>
              }
            >
              <InteractiveFloorPlan
                site={site}
                date={date}
                bookings={bookings}
                rooms={rooms}
                recommendedMap={recMap}
                highlightTeam
                viewerId={me?.id ?? ''}
                compact
                onSelectDesk={(desk, bk) => {
                  if (!bk && me) {
                    bookDesk({ userId: me.id, site, deskId: desk.id, date, checkInNow: dayOffset === 0 });
                  } else {
                    navigate(`/spaces/desks?desk=${desk.id}`);
                  }
                }}
                onSelectRoom={(room) => navigate(`/spaces/rooms?room=${room.id}`)}
              />
            </NeoPanel>

            {/* Colleagues in the Office Today */}
            <NeoPanel
              hud="WHO'S IN TODAY"
              title={`Colleagues in ${siteMeta.label}`}
              icon={<Users />}
              actions={
                <button
                  type="button"
                  className="neo-btn neo-btn--xs neo-btn--soft"
                  onClick={openVisitorModal}
                >
                  <UserPlus />
                  <span>Invite Visitor</span>
                </button>
              }
            >
              {colleaguesHere.length === 0 ? (
                <NeoEmpty
                  icon={<Users />}
                  title="No colleagues have shared desk presence for this day yet"
                  compact
                />
              ) : (
                <div className="sp-colleagues-grid">
                  {colleaguesHere.map((entry) => {
                    const u = entry.user;
                    if (!u) return null;
                    const isMe = u.id === me?.id;
                    return (
                      <div key={entry.bookingId} className="sp-colleague-card neo-spot">
                        <div className="sp-colleague-card__top">
                          <Avatar user={u} size={36} presence />
                          <div className="sp-colleague-card__identity">
                            <div className="sp-colleague-card__name">{u.name}</div>
                            <div className="sp-colleague-card__role">{u.title}</div>
                          </div>
                          <Chip tone={entry.status === 'checked_in' ? 'emerald' : 'amber'} size="sm">
                            {entry.desk}
                          </Chip>
                        </div>
                        <div className="sp-colleague-card__meta">
                          <span>{entry.zone ?? u.department}</span>
                          <span>·</span>
                          <span className="neo-mono">
                            {formatDecimalHour(entry.start)}–{formatDecimalHour(entry.end)}
                          </span>
                        </div>
                        {!isMe && (
                          <div className="sp-colleague-card__actions">
                            <button
                              type="button"
                              className="neo-btn neo-btn--xs neo-btn--soft"
                              onClick={() => handleQuickSitNearTeam(u.id)}
                            >
                              <UserCheck />
                              <span>Sit near</span>
                            </button>
                            <button
                              type="button"
                              className="neo-btn neo-btn--xs neo-btn--ghost"
                              onClick={() =>
                                pingColleagueOnChat({
                                  toUserId: u.id,
                                  text: `Hey ${u.name.split(' ')[0]}! Saw you're at desk ${entry.desk} in ${siteMeta.label} today — want to grab coffee?`,
                                  cardTitle: `Desk ${entry.desk} · ${siteMeta.label}`,
                                  cardSubtitle: `${entry.zone ?? u.department} · ${date}`,
                                  toRoute: `/spaces/desks?desk=${entry.deskId}`,
                                })
                              }
                            >
                              <MessageSquare />
                              <span>Ping</span>
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </NeoPanel>
          </>
        }
        side={
          <>
            {/* Zone Occupancy & Air Quality */}
            <NeoPanel hud="ZONE UTILIZATION" title="Neighbourhood Pulse" icon={<Wind />}>
              <div className="sp-zone-list">
                {pulse.zoneUtilization.map((zu) => (
                  <div key={zu.zone.id} className="sp-zone-row">
                    <div className="sp-zone-row__info">
                      <div className="sp-zone-row__title">
                        {zu.zone.team ?? zu.zone.kind}
                      </div>
                      <SensorStrip
                        co2={zu.zone.sensors.co2}
                        tempC={zu.zone.sensors.tempC}
                        noiseDb={zu.zone.sensors.noiseDb}
                      />
                    </div>
                    <Ring value={zu.pct / 100} size={46} stroke={5}>
                      {zu.pct}%
                    </Ring>
                  </div>
                ))}
              </div>
            </NeoPanel>

            {/* Today's Room Schedule */}
            <NeoPanel
              hud="SPATIAL ROOMS"
              title="Rooms in Flight"
              icon={<CalendarDays />}
              actions={
                <Link to="/spaces/rooms" className="neo-btn neo-btn--xs neo-btn--ghost">
                  <span>Book Room</span>
                </Link>
              }
            >
              {roomBookingsToday.length === 0 ? (
                <NeoEmpty icon={<CalendarDays />} title="All meeting rooms open" compact />
              ) : (
                <div className="sp-side-list">
                  {roomBookingsToday.map((rb) => (
                    <div key={rb.id} className="sp-side-card">
                      <div className="sp-side-card__head">
                        <Chip tone="violet" size="sm">
                          {rb.label}
                        </Chip>
                        <span className="neo-mono sp-side-card__time">
                          {formatDecimalHour(rb.start)}–{formatDecimalHour(rb.end)}
                        </span>
                      </div>
                      <div className="sp-side-card__title">{rb.title ?? `${rb.label} Session`}</div>
                      <div className="sp-side-card__actions">
                        <button
                          type="button"
                          className="neo-btn neo-btn--xs neo-btn--soft"
                          onClick={() => launchHoloMeetRoom(rb.title ?? rb.label, navigate)}
                        >
                          <Video />
                          <span>Join HoloMeet</span>
                        </button>
                        <Link to="/calendar" className="neo-btn neo-btn--xs neo-btn--ghost">
                          <CalendarDays />
                          <span>Calendar</span>
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </NeoPanel>

            {/* Hub Announcements */}
            <NeoPanel hud="WORKPLACE BULLETIN" title={`${siteMeta.city} Updates`} icon={<Building2 />}>
              <div className="sp-side-list">
                {siteAnnouncements.map((ann) => (
                  <div key={ann.id} className="sp-side-card">
                    <div className="sp-side-card__head">
                      <Chip tone={ann.pinned ? 'pink' : 'slate'} size="sm">
                        {ann.kind}
                      </Chip>
                    </div>
                    <div className="sp-side-card__title">{ann.title}</div>
                    <p className="sp-side-card__body">{ann.body}</p>
                  </div>
                ))}
              </div>
            </NeoPanel>
          </>
        }
      />
    </div>
  );
}
