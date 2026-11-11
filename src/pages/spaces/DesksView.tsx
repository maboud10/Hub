/**
 * Spaces — "Desk Map" (/spaces/desks)
 * Interactive SVG floor plan with "Sit near my team" spatial recommender,
 * amenity filters (dual-monitor, standing, window), EV/parking bay & smart
 * locker add-ons, and colleague desk inspector.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import {
  ArrowUpDown,
  Car,
  CheckCircle2,
  Lock,
  MapPin,
  MessageSquare,
  Monitor,
  Sparkles,
  Sun,
  UserCheck,
  Users,
  Wrench,
  Zap,
} from 'lucide-react';
import { Chip, NeoEmpty, NeoHome, NeoPanel, NeoTabs } from '@/components/neo';
import { Avatar } from '@/components/ui/primitives';
import { useHub } from '@/store/hub';
import { useSessionUser } from '@/store/selectors';
import {
  activeBookingsForDay,
  formatDecimalHour,
  isResourceFree,
  recommendDesks,
} from '@/spaces/engine';
import {
  DESK_BY_ID,
  SITE_BY_ID,
  ZONE_BY_ID,
  desksOf,
  lockersOf,
  parkingOf,
} from '@/spaces/seed';
import { useSpaces } from '@/spaces/store';
import type { Amenity, ZoneKind } from '@/spaces/types';
import {
  InteractiveFloorPlan,
  SensorStrip,
  pingColleagueOnChat,
  useSpacesUi,
} from './parts';

type ZoneFilter = 'all' | 'focus' | 'collab' | 'quiet';

export function DesksView() {
  const me = useSessionUser();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const users = useHub((s) => s.users);
  const { site, dayOffset, date, rooms } = useSpacesUi();

  const bookings = useSpaces((s) => s.bookings);
  const bookDesk = useSpaces((s) => s.bookDesk);
  const checkInBooking = useSpaces((s) => s.checkInBooking);
  const cancelBooking = useSpaces((s) => s.cancelBooking);
  const createServiceRequest = useSpaces((s) => s.createServiceRequest);

  const siteMeta = SITE_BY_ID[site];
  const siteDesks = useMemo(() => desksOf(site), [site]);
  const siteParking = useMemo(() => parkingOf(site), [site]);
  const siteLockers = useMemo(() => lockersOf(site), [site]);

  const [zoneFilter, setZoneFilter] = useState<ZoneFilter>('all');
  const [amenities, setAmenities] = useState<Amenity[]>([]);
  const [nearUserId, setNearUserId] = useState<string>('');
  const [highlightTeam, setHighlightTeam] = useState(true);
  const [shift, setShift] = useState<'full' | 'am' | 'pm'>('full');
  const [wantParkingId, setWantParkingId] = useState<string>('');
  const [wantLockerId, setWantLockerId] = useState<string>('');
  const [selectedDeskId, setSelectedDeskId] = useState<string | null>(null);

  const startHour = shift === 'pm' ? 13 : 9;
  const endHour = shift === 'am' ? 13 : 18;

  const recommendations = useMemo(() => {
    if (!me) return [];
    return recommendDesks({
      viewer: me,
      site,
      date,
      start: startHour,
      end: endHour,
      bookings,
      users,
      requiredAmenities: amenities,
      nearUserId: nearUserId || undefined,
      zoneKind: zoneFilter === 'all' ? undefined : (zoneFilter as ZoneKind),
    });
  }, [me, site, date, startHour, endHour, bookings, users, amenities, nearUserId, zoneFilter]);

  const recMap = useMemo(
    () => new Map(recommendations.map((r) => [r.desk.id, r])),
    [recommendations],
  );

  // Sync deep-linked desk or default to top recommended desk
  useEffect(() => {
    const paramDesk = params.get('desk');
    if (paramDesk && DESK_BY_ID[paramDesk]?.site === site) {
      setSelectedDeskId(paramDesk);
      return;
    }
    if (recommendations[0]) {
      setSelectedDeskId(recommendations[0].desk.id);
    } else if (siteDesks[0]) {
      setSelectedDeskId(siteDesks[0].id);
    }
  }, [site, params, recommendations, siteDesks]);

  const selectedDesk = useMemo(
    () => (selectedDeskId ? DESK_BY_ID[selectedDeskId] : siteDesks[0]),
    [selectedDeskId, siteDesks],
  );
  const selectedZone = selectedDesk ? ZONE_BY_ID[selectedDesk.zoneId] : undefined;

  const dayDeskBookings = useMemo(
    () => activeBookingsForDay(bookings, site, date, 'desk'),
    [bookings, site, date],
  );

  const selectedDeskBooking = useMemo(
    () =>
      selectedDesk
        ? dayDeskBookings.find((b) => b.resourceId === selectedDesk.id)
        : undefined,
    [dayDeskBookings, selectedDesk],
  );

  const selectedOccupant = useMemo(
    () =>
      selectedDeskBooking
        ? users.find((u) => u.id === selectedDeskBooking.userId)
        : undefined,
    [selectedDeskBooking, users],
  );

  const seatedColleagues = useMemo(() => {
    const map = new Map<string, { user: (typeof users)[0]; code: string }>();
    for (const b of dayDeskBookings) {
      if (b.userId === me?.id) continue;
      const u = users.find((x) => x.id === b.userId);
      if (u) map.set(u.id, { user: u, code: b.label });
    }
    return [...map.values()];
  }, [dayDeskBookings, users, me?.id]);

  const freeParkingSpots = useMemo(
    () =>
      siteParking.filter((p) =>
        isResourceFree(bookings, p.id, date, startHour, endHour),
      ),
    [siteParking, bookings, date, startHour, endHour],
  );

  const freeLockers = useMemo(
    () =>
      siteLockers.filter((l) =>
        isResourceFree(bookings, l.id, date, startHour, endHour),
      ),
    [siteLockers, bookings, date, startHour, endHour],
  );

  const toggleAmenity = (a: Amenity) => {
    setAmenities((prev) => (prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]));
  };

  const handleBookSelected = (deskIdToBook?: string) => {
    if (!me) return;
    const targetId = deskIdToBook ?? selectedDesk?.id;
    if (!targetId) return;
    const res = bookDesk({
      userId: me.id,
      site,
      deskId: targetId,
      date,
      start: startHour,
      end: endHour,
      nearUserId: nearUserId || undefined,
      checkInNow: dayOffset === 0,
      parkingSpotId: wantParkingId || undefined,
      lockerId: wantLockerId || undefined,
    });
    if (res.ok) {
      setSelectedDeskId(res.booking.resourceId);
    }
  };

  const handleReportDeskIssue = () => {
    if (!me || !selectedDesk) return;
    createServiceRequest({
      requesterId: me.id,
      site,
      kind: 'maintenance',
      title: `Desk ${selectedDesk.code} hardware / ergonomic check`,
      detail: `Reported from interactive floor plan for Desk ${selectedDesk.code} (${selectedZone?.team ?? 'Floor'}).`,
      where: `Desk ${selectedDesk.code}`,
      priority: 'normal',
    });
    navigate('/spaces/requests');
  };

  return (
    <div className="sp-view">
      {/* Filter & Sit Near Team Toolbar */}
      <div className="sp-filterbar">
        <NeoTabs<ZoneFilter>
          value={zoneFilter}
          onChange={setZoneFilter}
          label="Filter desk zones"
          items={[
            { value: 'all', label: 'All Zones', count: siteDesks.length },
            { value: 'focus', label: 'Focus' },
            { value: 'collab', label: 'Collab' },
            { value: 'quiet', label: 'Quiet' },
          ]}
        />

        <div className="sp-filterbar__chips">
          <Chip
            tone={highlightTeam ? 'cyan' : 'slate'}
            pressed={highlightTeam}
            onClick={() => setHighlightTeam((v) => !v)}
            icon={<Sparkles />}
          >
            Sit near my team
          </Chip>
          <Chip
            tone={amenities.includes('dual-monitor') ? 'violet' : 'slate'}
            pressed={amenities.includes('dual-monitor')}
            onClick={() => toggleAmenity('dual-monitor')}
            icon={<Monitor />}
          >
            Dual 4K
          </Chip>
          <Chip
            tone={amenities.includes('standing') ? 'violet' : 'slate'}
            pressed={amenities.includes('standing')}
            onClick={() => toggleAmenity('standing')}
            icon={<ArrowUpDown />}
          >
            Standing
          </Chip>
          <Chip
            tone={amenities.includes('window') ? 'violet' : 'slate'}
            pressed={amenities.includes('window')}
            onClick={() => toggleAmenity('window')}
            icon={<Sun />}
          >
            Window
          </Chip>
        </div>

        <div className="sp-filterbar__near">
          <Users />
          <select
            className="neo-input neo-input--sm sp-select"
            value={nearUserId}
            onChange={(e) => setNearUserId(e.target.value)}
            aria-label="Sit near colleague"
          >
            <option value="">Near any teammate</option>
            {seatedColleagues.map((sc) => (
              <option key={sc.user.id} value={sc.user.id}>
                {sc.user.name} ({sc.code})
              </option>
            ))}
          </select>
        </div>
      </div>

      <NeoHome
        main={
          <>
            <NeoPanel
              hud="INTERACTIVE FLOOR PLAN"
              title={`${siteMeta.label} · ${siteMeta.floors.find((f) => f.plan)?.label ?? 'Floor Plan'}`}
              icon={<MapPin />}
              actions={
                <div className="sp-shift-group" role="group" aria-label="Desk shift">
                  {[
                    { id: 'full', label: 'Full Day (09–18)' },
                    { id: 'am', label: 'Morning (09–13)' },
                    { id: 'pm', label: 'Afternoon (13–18)' },
                  ].map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className={`sp-daybtn ${shift === s.id ? 'is-active' : ''}`}
                      onClick={() => setShift(s.id as 'full' | 'am' | 'pm')}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              }
            >
              <InteractiveFloorPlan
                site={site}
                date={date}
                bookings={bookings}
                rooms={rooms}
                selectedDeskId={selectedDesk?.id}
                recommendedMap={recMap}
                highlightTeam={highlightTeam}
                viewerId={me?.id ?? ''}
                onSelectDesk={(desk) => setSelectedDeskId(desk.id)}
                onSelectRoom={(room) => navigate(`/spaces/rooms?room=${room.id}`)}
              />
            </NeoPanel>

            {/* Top Sit Near My Team Recommendations */}
            <NeoPanel
              hud="NOVA SPATIAL RECOMMENDER"
              title="Top Desks Near Your Team"
              icon={<Sparkles />}
            >
              {recommendations.length === 0 ? (
                <NeoEmpty
                  icon={<MapPin />}
                  title="No desks match all active filters"
                  action={
                    <button
                      type="button"
                      className="neo-btn neo-btn--xs neo-btn--soft"
                      onClick={() => {
                        setAmenities([]);
                        setZoneFilter('all');
                        setNearUserId('');
                      }}
                    >
                      <span>Reset filters</span>
                    </button>
                  }
                  compact
                />
              ) : (
                <div className="sp-rec-grid">
                  {recommendations.slice(0, 4).map((rec) => (
                    <div
                      key={rec.desk.id}
                      className={`sp-rec-card neo-spot ${selectedDesk?.id === rec.desk.id ? 'is-selected' : ''}`}
                      onClick={() => setSelectedDeskId(rec.desk.id)}
                    >
                      <div className="sp-rec-card__head">
                        <div className="sp-rec-card__code">
                          <span>Desk</span> <b>{rec.desk.code}</b>
                        </div>
                        <Chip tone="cyan" size="sm">
                          <b>{rec.score}%</b> <span>match</span>
                        </Chip>
                      </div>
                      <div className="sp-rec-card__zone">
                        {rec.zone.team ?? rec.zone.kind} · {rec.zone.sensors.co2} ppm CO₂
                      </div>
                      <ul className="sp-rec-card__reasons">
                        {rec.reasons.slice(0, 2).map((r, idx) => (
                          <li key={idx}>{r}</li>
                        ))}
                      </ul>
                      <div className="sp-rec-card__foot">
                        <div className="sp-rec-card__amenities">
                          {rec.desk.amenities.map((a) => (
                            <Chip key={a} tone="slate" size="sm">
                              {a}
                            </Chip>
                          ))}
                        </div>
                        <button
                          type="button"
                          className="neo-btn neo-btn--xs neo-btn--plasma"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleBookSelected(rec.desk.id);
                          }}
                          data-qa={`sp-book-rec-${rec.desk.code}`}
                        >
                          <span>Book</span> <b>{rec.desk.code}</b>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </NeoPanel>
          </>
        }
        side={
          selectedDesk && (
            <NeoPanel
              hud="DESK INSPECTOR"
              title={`Desk ${selectedDesk.code}`}
              icon={<MapPin />}
              actions={
                <button
                  type="button"
                  className="neo-btn neo-btn--xs neo-btn--ghost"
                  onClick={handleReportDeskIssue}
                  title="Log a maintenance ticket for this desk"
                >
                  <Wrench />
                  <span>Report issue</span>
                </button>
              }
            >
              <div className="sp-inspector">
                <div className="sp-inspector__meta">
                  <Chip tone="violet" size="sm">
                    {selectedZone?.team ?? selectedZone?.kind ?? 'Workspace'}
                  </Chip>
                  <span className="neo-mono">{date}</span>
                </div>

                {selectedZone && (
                  <SensorStrip
                    co2={selectedZone.sensors.co2}
                    tempC={selectedZone.sensors.tempC}
                    noiseDb={selectedZone.sensors.noiseDb}
                  />
                )}

                <div className="sp-inspector__amenities">
                  <div className="neo-hud">ERGONOMICS & HARDWARE</div>
                  <div className="sp-chip-row">
                    {selectedDesk.amenities.length > 0 ? (
                      selectedDesk.amenities.map((a) => (
                        <Chip key={a} tone="cyan" size="sm">
                          {a}
                        </Chip>
                      ))
                    ) : (
                      <Chip tone="slate" size="sm">
                        USB-C Dock & Ergonomic Chair
                      </Chip>
                    )}
                  </div>
                </div>

                {/* Occupied vs Available State */}
                {selectedDeskBooking ? (
                  <div className="sp-inspector__occupied">
                    <div className="neo-hud">CURRENTLY RESERVED</div>
                    {selectedOccupant && (
                      <div className="sp-occupant-box">
                        <Avatar user={selectedOccupant} size={40} presence />
                        <div>
                          <div className="sp-occupant-box__name">{selectedOccupant.name}</div>
                          <div className="sp-occupant-box__role">{selectedOccupant.title}</div>
                          <div className="sp-occupant-box__hours neo-mono">
                            {formatDecimalHour(selectedDeskBooking.start)}–
                            {formatDecimalHour(selectedDeskBooking.end)} ·{' '}
                            {selectedDeskBooking.status === 'checked_in' ? 'Checked in' : 'Booked'}
                          </div>
                        </div>
                      </div>
                    )}

                    {selectedDeskBooking.userId === me?.id ? (
                      <div className="sp-inspector__btns">
                        {selectedDeskBooking.status === 'booked' && (
                          <button
                            type="button"
                            className="neo-btn neo-btn--sm neo-btn--plasma neo-btn--block"
                            onClick={() => checkInBooking(selectedDeskBooking.id)}
                          >
                            <CheckCircle2 />
                            <span>Check in to Desk</span>
                          </button>
                        )}
                        <button
                          type="button"
                          className="neo-btn neo-btn--sm neo-btn--danger neo-btn--block"
                          onClick={() => cancelBooking(selectedDeskBooking.id)}
                        >
                          <span>Release Desk Booking</span>
                        </button>
                      </div>
                    ) : (
                      <div className="sp-inspector__btns">
                        <button
                          type="button"
                          className="neo-btn neo-btn--sm neo-btn--plasma neo-btn--block"
                          onClick={() => {
                            if (selectedOccupant) {
                              setNearUserId(selectedOccupant.id);
                              const adj = recommendDesks({
                                viewer: me!,
                                site,
                                date,
                                bookings,
                                users,
                                nearUserId: selectedOccupant.id,
                              })[0];
                              if (adj) handleBookSelected(adj.desk.id);
                            }
                          }}
                        >
                          <UserCheck />
                          <span>Book Adjacent Desk</span>
                        </button>
                        {selectedOccupant && (
                          <button
                            type="button"
                            className="neo-btn neo-btn--sm neo-btn--soft neo-btn--block"
                            onClick={() =>
                              pingColleagueOnChat({
                                toUserId: selectedOccupant.id,
                                text: `Hey ${selectedOccupant.name.split(' ')[0]}! I'm booking a desk near ${selectedDesk.code} in ${siteMeta.label}.`,
                                cardTitle: `Desk ${selectedDesk.code} · ${siteMeta.label}`,
                                cardSubtitle: `${selectedZone?.team ?? 'Floor'} · ${date}`,
                                toRoute: `/spaces/desks?desk=${selectedDesk.id}`,
                              })
                            }
                          >
                            <MessageSquare />
                            <span>Ping on Pulse Chat</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="sp-inspector__book">
                    {recMap.get(selectedDesk.id) && (
                      <div className="sp-inspector__why">
                        <div className="neo-hud">WHY NOVA RECOMMENDS THIS DESK</div>
                        <ul>
                          {recMap.get(selectedDesk.id)!.reasons.map((r, i) => (
                            <li key={i}>{r}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* EV / Parking Bay Add-on */}
                    <label className="sp-addon-field">
                      <span className="neo-hud">
                        <Car /> EV & PARKING BAY ADD-ON
                      </span>
                      <select
                        className="neo-input neo-input--sm"
                        value={wantParkingId}
                        onChange={(e) => setWantParkingId(e.target.value)}
                      >
                        <option value="">No parking needed</option>
                        {freeParkingSpots.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.code} ({p.level}){p.ev ? ` · EV ${p.kw}kW` : ''}{p.accessible ? ' · Accessible' : ''}
                          </option>
                        ))}
                      </select>
                    </label>

                    {/* Smart Day Locker Add-on */}
                    <label className="sp-addon-field">
                      <span className="neo-hud">
                        <Lock /> SMART LOCKER ADD-ON
                      </span>
                      <select
                        className="neo-input neo-input--sm"
                        value={wantLockerId}
                        onChange={(e) => setWantLockerId(e.target.value)}
                      >
                        <option value="">No locker needed</option>
                        {freeLockers.slice(0, 10).map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.code} · Bank {l.bank} (Size {l.size})
                          </option>
                        ))}
                      </select>
                    </label>

                    <button
                      type="button"
                      className="neo-btn neo-btn--plasma neo-btn--block"
                      onClick={() => handleBookSelected(selectedDesk.id)}
                      data-qa="sp-book-selected-desk"
                    >
                      <Zap />
                      <span>Reserve Desk</span> <b>{selectedDesk.code}</b>
                    </button>
                  </div>
                )}
              </div>
            </NeoPanel>
          )
        }
      />
    </div>
  );
}
