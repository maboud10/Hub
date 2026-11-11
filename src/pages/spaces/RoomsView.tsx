/**
 * Spaces — "Meeting Rooms" (/spaces/rooms)
 * Room discovery with live CO₂/temp/dBA/AV telemetry, HoloMeet gear filters,
 * catering hospitality add-on, and 1-click Helix Calendar + HoloMeet sync.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import {
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Coffee,
  Monitor,
  Presentation,
  Sparkles,
  Users,
  Video,
  Wrench,
} from 'lucide-react';
import {
  Avatars,
  Chip,
  NeoEmpty,
  NeoHome,
  NeoPanel,
  NeoTabs,
  PeoplePicker,
  Ring,
} from '@/components/neo';
import { useHub } from '@/store/hub';
import { useSessionUser } from '@/store/selectors';
import {
  activeBookingsForDay,
  formatDecimalHour,
  scoreRooms,
} from '@/spaces/engine';
import { SITE_BY_ID } from '@/spaces/seed';
import { useSpaces } from '@/spaces/store';
import type { CateringKind, RoomGear, RoomKind } from '@/spaces/types';
import {
  SensorStrip,
  launchHoloMeetRoom,
  syncRoomBookingToCalendar,
  useSpacesUi,
} from './parts';

type RoomKindFilter = 'all' | RoomKind;

export function RoomsView() {
  const me = useSessionUser();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const users = useHub((s) => s.users);
  const { site, dayOffset, date, rooms, calEvents } = useSpacesUi();

  const bookings = useSpaces((s) => s.bookings);
  const bookRoom = useSpaces((s) => s.bookRoom);
  const cancelBooking = useSpaces((s) => s.cancelBooking);
  const createServiceRequest = useSpaces((s) => s.createServiceRequest);

  const siteMeta = SITE_BY_ID[site];

  const [kindFilter, setKindFilter] = useState<RoomKindFilter>('all');
  const [gearFilter, setGearFilter] = useState<RoomGear[]>([]);
  const [minCap, setMinCap] = useState<number>(1);
  const [startHour, setStartHour] = useState<number>(14);
  const [durationMins, setDurationMins] = useState<number>(60);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);

  // Booking form state
  const [title, setTitle] = useState('Architecture & Product Design Sync');
  const [attendeeIds, setAttendeeIds] = useState<string[]>(() =>
    me ? [me.id, 'u-omar', 'u-priya'].filter((id, i, arr) => arr.indexOf(id) === i) : ['u-omar'],
  );
  const [cateringKind, setCateringKind] = useState<'none' | CateringKind>('none');
  const [cateringNote, setCateringNote] = useState('Oat milk espresso carafe & sparkling water');
  const [syncCal, setSyncCal] = useState(true);

  const endHour = +(startHour + durationMins / 60).toFixed(2);

  const scoredRooms = useMemo(
    () =>
      scoreRooms(rooms, {
        site,
        date,
        dayOffset,
        start: startHour,
        end: endHour,
        minCapacity: minCap,
        requiredGear: gearFilter,
        kind: kindFilter === 'all' ? undefined : kindFilter,
        bookings,
        calEvents,
      }),
    [rooms, site, date, dayOffset, startHour, endHour, minCap, gearFilter, kindFilter, bookings, calEvents],
  );

  useEffect(() => {
    const paramRoom = params.get('room');
    if (paramRoom && rooms.some((r) => r.id === paramRoom && r.site === site)) {
      setSelectedRoomId(paramRoom);
      return;
    }
    if (scoredRooms[0]) {
      setSelectedRoomId(scoredRooms[0].room.id);
    }
  }, [site, params, rooms, scoredRooms]);

  const selectedScored = useMemo(
    () => scoredRooms.find((s) => s.room.id === selectedRoomId) ?? scoredRooms[0],
    [scoredRooms, selectedRoomId],
  );

  const dayRoomBookings = useMemo(
    () =>
      activeBookingsForDay(bookings, site, date, 'room').filter(
        (b) => b.resourceId === selectedScored?.room.id,
      ),
    [bookings, site, date, selectedScored?.room.id],
  );

  const attendeeUsers = useMemo(
    () => users.filter((u) => attendeeIds.includes(u.id)),
    [users, attendeeIds],
  );

  const toggleGear = (g: RoomGear) => {
    setGearFilter((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]));
  };

  const handleBookRoom = async () => {
    if (!me || !selectedScored) return;
    const room = selectedScored.room;
    let calEventId: string | undefined;
    if (syncCal) {
      calEventId = await syncRoomBookingToCalendar({
        title: title.trim() || `${room.name} Sync`,
        dayOffset,
        startHour,
        durationMins,
        attendeeIds,
        roomId: room.id,
        roomName: room.name,
      });
    }

    bookRoom({
      userId: me.id,
      site,
      roomId: room.id,
      roomName: room.name,
      date,
      dayOffset,
      start: startHour,
      end: endHour,
      title: title.trim() || `${room.name} Sync`,
      attendeeIds,
      catering:
        cateringKind === 'none'
          ? undefined
          : {
              kind: cateringKind,
              headcount: Math.max(2, attendeeIds.length),
              note: cateringNote,
            },
      calendarEventId: calEventId,
    });
  };

  const handleLogRoomIssue = () => {
    if (!me || !selectedScored) return;
    const r = selectedScored.room;
    createServiceRequest({
      requesterId: me.id,
      site,
      kind: 'it_setup',
      title: `AV & sensor calibration check in Room ${r.name}`,
      detail: `Telemetry snapshot: ${r.sensors.co2} ppm CO₂, ${r.sensors.tempC}°C, ${r.sensors.noiseDb} dBA.`,
      where: `Room ${r.name} · ${r.floor}`,
      priority: 'normal',
    });
    navigate('/spaces/requests');
  };

  return (
    <div className="sp-view">
      {/* Room Filter Bar */}
      <div className="sp-filterbar">
        <NeoTabs<RoomKindFilter>
          value={kindFilter}
          onChange={setKindFilter}
          label="Filter room types"
          items={[
            { value: 'all', label: 'All Rooms', count: scoredRooms.length },
            { value: 'boardroom', label: 'Boardrooms' },
            { value: 'meeting', label: 'Meeting' },
            { value: 'huddle', label: 'Huddle' },
            { value: 'phone', label: 'Phone Booths' },
            { value: 'wellness', label: 'Wellness' },
          ]}
        />

        <div className="sp-filterbar__chips">
          <Chip
            tone={gearFilter.includes('holomeet') ? 'violet' : 'slate'}
            pressed={gearFilter.includes('holomeet')}
            onClick={() => toggleGear('holomeet')}
            icon={<Video />}
          >
            HoloMeet 3D
          </Chip>
          <Chip
            tone={gearFilter.includes('whiteboard') ? 'violet' : 'slate'}
            pressed={gearFilter.includes('whiteboard')}
            onClick={() => toggleGear('whiteboard')}
            icon={<Presentation />}
          >
            Smart Canvas
          </Chip>
          <Chip
            tone={gearFilter.includes('display') ? 'violet' : 'slate'}
            pressed={gearFilter.includes('display')}
            onClick={() => toggleGear('display')}
            icon={<Monitor />}
          >
            Dual 8K Wall
          </Chip>
        </div>

        <div className="sp-filterbar__near">
          <Users />
          <select
            className="neo-input neo-input--sm sp-select"
            value={minCap}
            onChange={(e) => setMinCap(Number(e.target.value))}
            aria-label="Minimum room capacity"
          >
            <option value={1}>Any size (1+)</option>
            <option value={4}>4+ seats</option>
            <option value={6}>6+ seats</option>
            <option value={10}>10+ boardroom</option>
          </select>

          <CalendarClock />
          <select
            className="neo-input neo-input--sm sp-select"
            value={startHour}
            onChange={(e) => setStartHour(Number(e.target.value))}
            aria-label="Meeting start hour"
          >
            {[9, 10, 11, 12, 13, 14, 15, 16, 17].map((h) => (
              <option key={h} value={h}>
                {formatDecimalHour(h)}
              </option>
            ))}
          </select>
          <select
            className="neo-input neo-input--sm sp-select"
            value={durationMins}
            onChange={(e) => setDurationMins(Number(e.target.value))}
            aria-label="Meeting duration"
          >
            <option value={30}>30 min</option>
            <option value={60}>60 min</option>
            <option value={90}>90 min</option>
          </select>
        </div>
      </div>

      <NeoHome
        main={
          <NeoPanel
            hud="SPATIAL ROOM DIRECTORY"
            title={`${siteMeta.label} Rooms · ${formatDecimalHour(startHour)}–${formatDecimalHour(endHour)}`}
            icon={<CalendarClock />}
          >
            {scoredRooms.length === 0 ? (
              <NeoEmpty
                icon={<CalendarClock />}
                title="No rooms match your capacity and gear filters"
                action={
                  <button
                    type="button"
                    className="neo-btn neo-btn--xs neo-btn--soft"
                    onClick={() => {
                      setKindFilter('all');
                      setGearFilter([]);
                      setMinCap(1);
                    }}
                  >
                    <span>Clear filters</span>
                  </button>
                }
              />
            ) : (
              <div className="sp-rooms-grid">
                {scoredRooms.map((item) => {
                  const { room, available, health, fitScore, currentBooking } = item;
                  const isSelected = selectedScored?.room.id === room.id;
                  return (
                    <div
                      key={room.id}
                      className={`sp-room-card neo-spot ${isSelected ? 'is-selected' : ''}`}
                      onClick={() => setSelectedRoomId(room.id)}
                      data-qa={`sp-room-card-${room.id}`}
                    >
                      <div className="sp-room-card__head">
                        <div>
                          <div className="sp-room-card__eyebrow neo-hud">
                            {room.code} · {room.floor} · {room.kind}
                          </div>
                          <h3 className="sp-room-card__title">
                            <span>Room</span> <b>{room.name}</b>
                          </h3>
                        </div>
                        <Ring value={fitScore / 100} size={46} stroke={5} color={room.color}>
                          {fitScore}%
                        </Ring>
                      </div>

                      <div className="sp-room-card__badges">
                        <Chip tone={available ? 'emerald' : 'amber'} size="sm">
                          {available ? 'Available for slot' : 'Reserved in slot'}
                        </Chip>
                        <Chip tone="slate" size="sm" icon={<Users />}>
                          <b>{room.capacity}</b> <span>seats</span>
                        </Chip>
                        {room.source === 'calendar' && (
                          <Chip tone="cyan" size="sm" icon={<CalendarDays />}>
                            <span>Helix Calendar Sync</span>
                          </Chip>
                        )}
                      </div>

                      <SensorStrip
                        co2={room.sensors.co2}
                        tempC={room.sensors.tempC}
                        noiseDb={room.sensors.noiseDb}
                        hasHolo={room.gear.includes('holomeet')}
                      />

                      <div className="sp-room-card__status">
                        {currentBooking ? (
                          <span>
                            In flight: <b>{currentBooking.title}</b> (
                            {formatDecimalHour(currentBooking.start)}–
                            {formatDecimalHour(currentBooking.end)})
                          </span>
                        ) : room.calendarTitle ? (
                          <span>{room.calendarTitle}</span>
                        ) : (
                          <span>{health.summary}</span>
                        )}
                      </div>

                      <div className="sp-room-card__foot">
                        <div className="sp-chip-row">
                          {room.gear.map((g) => (
                            <Chip key={g} tone="slate" size="sm">
                              {g.toUpperCase()}
                            </Chip>
                          ))}
                        </div>
                        <button
                          type="button"
                          className="neo-btn neo-btn--xs neo-btn--plasma"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedRoomId(room.id);
                          }}
                        >
                          <span>Select</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </NeoPanel>
        }
        side={
          selectedScored && (
            <NeoPanel
              hud="ROOM COMPOSER & TELEMETRY"
              title={`Room ${selectedScored.room.name}`}
              icon={<CalendarDays />}
              actions={
                <button
                  type="button"
                  className="neo-btn neo-btn--xs neo-btn--ghost"
                  onClick={handleLogRoomIssue}
                >
                  <Wrench />
                  <span>AV / HVAC Ticket</span>
                </button>
              }
            >
              <div className="sp-inspector">
                <div className="sp-inspector__meta">
                  <Chip tone="violet" size="sm">
                    {selectedScored.room.code} · {selectedScored.room.floor}
                  </Chip>
                  <Chip tone={selectedScored.available ? 'emerald' : 'amber'} size="sm">
                    {selectedScored.available ? 'Open' : 'Busy'}
                  </Chip>
                </div>

                <SensorStrip
                  co2={selectedScored.room.sensors.co2}
                  tempC={selectedScored.room.sensors.tempC}
                  noiseDb={selectedScored.room.sensors.noiseDb}
                  hasHolo={selectedScored.room.gear.includes('holomeet')}
                />

                <label className="sp-addon-field">
                  <span className="neo-hud">MEETING TITLE</span>
                  <input
                    className="neo-input neo-input--sm"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Session title…"
                  />
                </label>

                <div className="sp-addon-field">
                  <span className="neo-hud">ATTENDEES ({attendeeIds.length})</span>
                  <div className="sp-attendee-bar">
                    <Avatars users={attendeeUsers} max={5} size={28} />
                    <PeoplePicker
                      multiple
                      value={attendeeIds}
                      onChange={setAttendeeIds}
                      label="Choose meeting attendees"
                      trigger={(p) => (
                        <button {...p} type="button" className="neo-btn neo-btn--xs neo-btn--soft">
                          <Users />
                          <span>Add / Edit</span>
                        </button>
                      )}
                    />
                  </div>
                </div>

                <label className="sp-addon-field">
                  <span className="neo-hud">
                    <Coffee /> HOSPITALITY & CATERING ADD-ON
                  </span>
                  <select
                    className="neo-input neo-input--sm"
                    value={cateringKind}
                    onChange={(e) => setCateringKind(e.target.value as 'none' | CateringKind)}
                  >
                    <option value="none">No catering required</option>
                    <option value="coffee">Barista Coffee & Tea Carafe</option>
                    <option value="breakfast">Artisan Breakfast Pastries</option>
                    <option value="lunch">Working Mezze & Wrap Platter</option>
                    <option value="snacks">Afternoon Brain-Food & Dates</option>
                  </select>
                </label>

                {cateringKind !== 'none' && (
                  <label className="sp-addon-field">
                    <span className="neo-hud">DIETARY / DELIVERY NOTE</span>
                    <input
                      className="neo-input neo-input--sm"
                      value={cateringNote}
                      onChange={(e) => setCateringNote(e.target.value)}
                      placeholder="Dietary notes…"
                    />
                  </label>
                )}

                <label className="sp-checkbox-row">
                  <input
                    type="checkbox"
                    checked={syncCal}
                    onChange={(e) => setSyncCal(e.target.checked)}
                  />
                  <span>Sync reservation with Helix Calendar</span>
                </label>

                <div className="sp-inspector__btns">
                  <button
                    type="button"
                    className="neo-btn neo-btn--plasma neo-btn--block"
                    disabled={!selectedScored.available}
                    onClick={handleBookRoom}
                    data-qa="sp-book-room-submit"
                  >
                    <CheckCircle2 />
                    <span>
                      {selectedScored.available
                        ? `Reserve ${selectedScored.room.name} (${formatDecimalHour(startHour)}–${formatDecimalHour(endHour)})`
                        : 'Slot Reserved — Pick Another Hour'}
                    </span>
                  </button>

                  <button
                    type="button"
                    className="neo-btn neo-btn--sm neo-btn--soft neo-btn--block"
                    onClick={() =>
                      launchHoloMeetRoom(
                        `${selectedScored.room.name} · ${title}`,
                        navigate,
                      )
                    }
                  >
                    <Video />
                    <span>Launch HoloMeet Bridge</span>
                  </button>
                </div>

                {/* Today's Schedule for this room */}
                {dayRoomBookings.length > 0 && (
                  <div className="sp-room-schedule">
                    <div className="neo-hud">SCHEDULED TODAY IN {selectedScored.room.name.toUpperCase()}</div>
                    {dayRoomBookings.map((rb) => (
                      <div key={rb.id} className="sp-schedule-item">
                        <div>
                          <div className="sp-schedule-item__title">{rb.title}</div>
                          <div className="sp-schedule-item__time neo-mono">
                            {formatDecimalHour(rb.start)}–{formatDecimalHour(rb.end)}
                            {rb.catering ? ` · Catering (${rb.catering.kind})` : ''}
                          </div>
                        </div>
                        {rb.userId === me?.id && (
                          <button
                            type="button"
                            className="neo-btn neo-btn--xs neo-btn--ghost"
                            onClick={() => cancelBooking(rb.id)}
                          >
                            <span>Release</span>
                          </button>
                        )}
                      </div>
                    ))}
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

// Keep unused icon reference clean
void Sparkles;
