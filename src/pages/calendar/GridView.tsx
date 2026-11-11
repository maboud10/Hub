/**
 * Helix Calendar — View 1: Chronos Time Grid & Focus Runway
 * Interactive Nova Natural-Language Scheduler, Day/Week Timeline,
 * Cross-App Context Badges (CRM, Projects, Performance, Talent),
 * 1-Click Schedule Defrag, and Direct HoloMeet Room Launch.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import {
  ArrowUpRight,
  Building2,
  CalendarCheck,
  Clock,
  ExternalLink,
  Hourglass,
  Layers,
  Play,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
  Video,
  Wand2,
  X,
} from 'lucide-react';
import { Avatars, Chip, NeoPanel, NeoTabs, NeoTracker, NovaChip } from '@/components/neo';
import { startFocusSession } from '@/components/FocusEngine';
import { useHub } from '@/store/hub';
import { ProjectSigil } from '@/projects/sigils';
import { formatHourRange } from '@/calendar/engine';
import { EVENT_CATEGORY_META } from '@/calendar/seed';
import { useCalendar } from '@/calendar/store';
import { trackBookedEvent, trackNovaDraft, type BookingStage } from '@/calendar/tracking';
import type { CalendarEvent, EventCategory } from '@/calendar/types';

const NOVA_PROMPTS = [
  'Schedule 45m NEOM Sovereign Security Commit with Omar, Aisha & Daniel',
  'Shield 90m Deep Work block for Onboarding v3 & RTL polish',
  'Book 30m 1:1 OKR & Career Sync with Omar tomorrow',
  'Set up 60m Staff AI Engineer System Design interview with Priya & Sara',
];

const DAY_LABELS: { offset: number; label: string }[] = [
  { offset: -1, label: 'Yesterday' },
  { offset: 0, label: 'Today · Live Orbit' },
  { offset: 1, label: 'Tomorrow' },
  { offset: 2, label: 'In 2 Days' },
];

const CATEGORY_FILTERS: [EventCategory | 'all', string][] = [
  ['all', 'All Blocks'],
  ['meet', 'HoloMeet Syncs'],
  ['focus', 'Deep Work Shields'],
  ['customer', 'CRM Deals'],
  ['1on1', '1:1 & OKRs'],
  ['interview', 'Talent Loops'],
];

const BOOKING_ICONS: Record<BookingStage['id'], ReactNode> = {
  understood: <Sparkles />,
  window: <Clock />,
  room: <Building2 />,
  invites: <Users />,
  booked: <CalendarCheck />,
};

const withBookingIcons = (steps: BookingStage[]) =>
  steps.map((s) => ({ ...s, icon: BOOKING_ICONS[s.id] }));

export function GridView() {
  const navigate = useNavigate();
  const users = useHub((s) => s.users);

  const events = useCalendar((s) => s.events);
  const selectedDayOffset = useCalendar((s) => s.selectedDayOffset);
  const activeCategoryFilter = useCalendar((s) => s.activeCategoryFilter);
  const activeNovaDraft = useCalendar((s) => s.activeNovaDraft);
  const focusShieldActive = useCalendar((s) => s.focusShieldActive);

  const setSelectedDayOffset = useCalendar((s) => s.setSelectedDayOffset);
  const setCategoryFilter = useCalendar((s) => s.setCategoryFilter);
  const runNovaSchedule = useCalendar((s) => s.runNovaSchedule);
  const commitNovaDraft = useCalendar((s) => s.commitNovaDraft);
  const clearNovaDraft = useCalendar((s) => s.clearNovaDraft);
  const defragSchedule = useCalendar((s) => s.defragSchedule);
  const deleteEvent = useCalendar((s) => s.deleteEvent);
  const moveEventTime = useCalendar((s) => s.moveEventTime);

  const [promptText, setPromptText] = useState('');
  const [selectedEventId, setSelectedEventId] = useState<string>('cal-ev-2');
  /** Last Nova booking committed from this grid (the event itself lives in the store). */
  const [novaBooking, setNovaBooking] = useState<{ eventId: string; harmonyScore: number } | null>(null);

  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const nameOf = (id: string) => userMap.get(id)?.name;

  const filteredEvents = useMemo(() => {
    return events
      .filter((e) => e.dayOffset === selectedDayOffset)
      .filter((e) => activeCategoryFilter === 'all' || e.category === activeCategoryFilter)
      .sort((a, b) => a.startHour - b.startHour);
  }, [events, selectedDayOffset, activeCategoryFilter]);

  const selectedEvent: CalendarEvent | undefined = useMemo(
    () =>
      filteredEvents.find((e) => e.id === selectedEventId) ??
      events.find((e) => e.id === selectedEventId) ??
      filteredEvents[0],
    [filteredEvents, events, selectedEventId],
  );

  const dayStats = useMemo(() => {
    const dayEvs = events.filter((e) => e.dayOffset === selectedDayOffset);
    const focusMins = dayEvs
      .filter((e) => e.category === 'focus')
      .reduce((acc, e) => acc + e.durationMins, 0);
    const meetMins = dayEvs
      .filter((e) => e.category !== 'focus')
      .reduce((acc, e) => acc + e.durationMins, 0);
    const avgSignal = dayEvs.length
      ? Math.round(dayEvs.reduce((a, b) => a + b.highSignalScore, 0) / dayEvs.length)
      : 95;
    return {
      totalCount: dayEvs.length,
      focusHours: (focusMins / 60).toFixed(1),
      meetHours: (meetMins / 60).toFixed(1),
      avgSignal,
    };
  }, [events, selectedDayOffset]);

  // Chronos booking tracker: the live draft wins; otherwise the event we just booked (if it still exists).
  const bookedEvent = novaBooking ? events.find((e) => e.id === novaBooking.eventId) : undefined;
  const draftTrack = activeNovaDraft ? trackNovaDraft(activeNovaDraft, nameOf) : null;
  const bookedTrack =
    !activeNovaDraft && bookedEvent && novaBooking
      ? trackBookedEvent(bookedEvent, novaBooking.harmonyScore, nameOf)
      : null;

  const handleRunNova = (q?: string) => {
    const target = q ?? promptText;
    const draft = runNovaSchedule(
      target || 'Schedule 45m Cross-Hub Architecture Sync with Omar & Mei',
    );
    if (q) setPromptText(q);
    setNovaBooking(null);
    return draft;
  };

  const handleCommitDraft = () => {
    const harmonyScore = activeNovaDraft?.harmonyScore ?? 0;
    const created = commitNovaDraft();
    if (created) {
      setSelectedEventId(created.id);
      setNovaBooking({ eventId: created.id, harmonyScore });
    }
  };

  return (
    <div className="cal-view">
      {/* Top KPI Ribbon */}
      <div className="cal-kpi-grid">
        <div className="cal-kpi-card">
          <div className="cal-kpi-card__top">
            <span className="neo-hud">DEEP WORK SHIELD</span>
            <Chip tone="violet" size="sm">
              {focusShieldActive ? 'Auto-Defended' : 'Manual'}
            </Chip>
          </div>
          <div className="cal-kpi-card__val">{dayStats.focusHours}h</div>
          <div className="cal-kpi-card__sub">
            Protected maker blocks synced with Focus Engine
          </div>
        </div>

        <div className="cal-kpi-card">
          <div className="cal-kpi-card__top">
            <span className="neo-hud">SYNCHRONOUS LOAD</span>
            <Chip tone="cyan" size="sm">
              {dayStats.totalCount} blocks
            </Chip>
          </div>
          <div className="cal-kpi-card__val">{dayStats.meetHours}h</div>
          <div className="cal-kpi-card__sub">
            Across HoloMeet rooms, CRM calls & 1:1s
          </div>
        </div>

        <div className="cal-kpi-card">
          <div className="cal-kpi-card__top">
            <span className="neo-hud">SIGNAL-TO-NOISE SCORE</span>
            <Chip tone="emerald" size="sm">
              Top 4%
            </Chip>
          </div>
          <div className="cal-kpi-card__val">{dayStats.avgSignal}%</div>
          <div className="cal-kpi-card__sub">
            Every meeting has an AI pre-read & agenda
          </div>
        </div>

        <div className="cal-kpi-card">
          <div className="cal-kpi-card__top">
            <span className="neo-hud">CIRCADIAN HARMONY</span>
            <Chip tone="amber" size="sm">
              4 Hubs Active
            </Chip>
          </div>
          <div className="cal-kpi-card__val">94%</div>
          <div className="cal-kpi-card__sub">
            Zero off-hours burnout across DXB · LDN · SGP
          </div>
        </div>
      </div>

      {/* Nova Natural-Language Chronos Composer */}
      <NeoPanel
        hud="NOVA CHRONOS COPILOT · NATURAL-LANGUAGE SCHEDULER & DEFRAG ENGINE"
        title="Orchestrate Time, Spatial Pods & Deep Work"
        className="cal-nova-panel"
        actions={
          <button
            type="button"
            className="neo-btn neo-btn--soft neo-btn--sm"
            onClick={() => defragSchedule(selectedDayOffset)}
            data-qa="cal-defrag-btn"
          >
            <Wand2 />
            <span className="neo-btn__label">1-Click Defrag Schedule</span>
          </button>
        }
      >
        <div className="cal-nova-composer">
          <div className="cal-nova-input-row">
            <NovaChip>Nova Chronos</NovaChip>
            <input
              type="text"
              className="neo-input cal-nova-input"
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRunNova();
              }}
              placeholder="Ask Nova: “Book 45m with Omar & Mei tomorrow for Q1 Design Review in Room Nebula…”"
              data-qa="cal-nova-input"
            />
            <button
              type="button"
              className="neo-btn neo-btn--plasma"
              onClick={() => handleRunNova()}
              data-qa="cal-nova-synthesize"
            >
              <Sparkles />
              <span className="neo-btn__label">Find Golden Slot</span>
            </button>
          </div>

          <div className="cal-nova-chips">
            {NOVA_PROMPTS.map((p) => (
              <button
                key={p}
                type="button"
                className="neo-suggest"
                onClick={() => handleRunNova(p)}
                title={p}
              >
                <Sparkles />
                <span>{p}</span>
              </button>
            ))}
          </div>

          {/* Chronos booking tracker — Nova draft waiting on your confirmation */}
          {activeNovaDraft && draftTrack && (
            <div className="cal-nova-draft" data-qa="cal-nova-draft">
              <NeoTracker
                bare
                hud="Chronos booking tracker"
                title={activeNovaDraft.title}
                steps={withBookingIcons(draftTrack.steps)}
                current={draftTrack.current}
                state={draftTrack.state}
                eta={draftTrack.when}
                progress={0.5}
                message={draftTrack.message}
              />
              <div className="cal-nova-draft__foot">
                <p className="cal-nova-draft__why">{activeNovaDraft.rationale}</p>
                <div className="cal-nova-draft__actions">
                  <button
                    type="button"
                    className="neo-btn neo-btn--ghost neo-btn--sm"
                    onClick={clearNovaDraft}
                  >
                    Dismiss
                  </button>
                  <button
                    type="button"
                    className="neo-btn neo-btn--plasma neo-btn--sm"
                    onClick={handleCommitDraft}
                    data-qa="cal-commit-draft"
                  >
                    <ShieldCheck />
                    <span>Confirm & Provision HoloMeet</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Chronos booking tracker — committed and on the grid */}
          {bookedEvent && bookedTrack && (
            <div className="cal-nova-draft is-booked" data-qa="cal-nova-booked">
              <NeoTracker
                bare
                hud="Chronos booking tracker"
                title={bookedEvent.title}
                steps={withBookingIcons(bookedTrack.steps)}
                current={bookedTrack.current}
                state={bookedTrack.state}
                eta={bookedTrack.when}
                message={bookedTrack.message}
                actions={
                  <>
                    {bookedEvent.meetRoomId && (
                      <button
                        type="button"
                        className="neo-btn neo-btn--plasma neo-btn--sm"
                        onClick={() =>
                          navigate(`/meet/room?room=${bookedEvent.meetRoomId}&event=${bookedEvent.id}`)
                        }
                      >
                        <Video />
                        <span>Join HoloMeet</span>
                      </button>
                    )}
                    <button
                      type="button"
                      className="neo-btn neo-btn--ghost neo-btn--sm neo-btn--icon"
                      onClick={() => setNovaBooking(null)}
                      aria-label="Dismiss"
                      title="Dismiss"
                    >
                      <X />
                    </button>
                  </>
                }
              />
            </div>
          )}
        </div>
      </NeoPanel>

      {/* Main Split: Timeline Canvas + Event Inspector & Cross-App Context */}
      <div className="cal-main-split">
        <NeoPanel
          hud="CHRONOS SPATIAL TIMELINE · DUBAI (GST) ↔ LONDON (GMT) ↔ SINGAPORE (SGT)"
          title="Interactive Day & Focus Runway"
        >
          <div className="cal-timeline-toolbar">
            <NeoTabs
              value={String(selectedDayOffset)}
              onChange={(v) => setSelectedDayOffset(Number(v))}
              label="Interactive Day & Focus Runway"
              items={DAY_LABELS.map((d) => ({ value: String(d.offset), label: d.label }))}
            />

            {/* Category Filter Chips */}
            <div className="cal-filter-bar">
              {CATEGORY_FILTERS.map(([cat, label]) => (
                <Chip
                  key={cat}
                  tone={activeCategoryFilter === cat ? 'app' : 'slate'}
                  pressed={activeCategoryFilter === cat}
                  onClick={() => setCategoryFilter(cat)}
                >
                  {label}
                </Chip>
              ))}
            </div>
          </div>

          {/* Event Timeline Cards */}
          <div className="cal-timeline-list">
            {filteredEvents.map((ev) => {
              const meta = EVENT_CATEGORY_META[ev.category];
              const attendees = ev.attendeeIds
                .map((id) => userMap.get(id))
                .filter((u): u is NonNullable<typeof u> => Boolean(u));
              const isSelected = selectedEvent?.id === ev.id;

              return (
                <div
                  key={ev.id}
                  className={`cal-event-card ${isSelected ? 'is-selected' : ''} is-cat-${ev.category}`}
                  onClick={() => setSelectedEventId(ev.id)}
                  data-qa={`cal-event-${ev.id}`}
                >
                  <div className="cal-event-card__time">
                    <span className="neo-mono cal-event-card__hour">
                      {formatHourRange(ev.startHour, ev.durationMins)}
                    </span>
                    <span className="cal-event-card__dur">{ev.durationMins}m</span>
                  </div>

                  <div className="cal-event-card__sigil">
                    <ProjectSigil icon={ev.sigil} color={ev.color} size={36} />
                  </div>

                  <div className="cal-event-card__body">
                    <div className="cal-event-card__top">
                      <Chip tone={meta.badgeTone} size="sm">
                        {meta.label}
                      </Chip>
                      {ev.linkedContext && (
                        <button
                          type="button"
                          className="neo-chip neo-chip--sm cal-linked-badge"
                          data-tone="blue"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(ev.linkedContext!.to);
                          }}
                        >
                          <Layers />
                          <span>{ev.linkedContext.label}</span>
                          <ArrowUpRight />
                        </button>
                      )}
                      <span className="cal-signal-pill neo-mono">
                        Signal {ev.highSignalScore}%
                      </span>
                    </div>

                    <h3 className="cal-event-card__title">{ev.title}</h3>
                    <p className="cal-event-card__desc">{ev.description}</p>

                    <div className="cal-event-card__foot">
                      <span className="cal-event-card__room">
                        <Clock /> {ev.roomName}
                      </span>
                      <Avatars users={attendees} max={4} size={22} />
                    </div>
                  </div>

                  <div className="cal-event-card__cta" onClick={(e) => e.stopPropagation()}>
                    {ev.meetRoomId ? (
                      <button
                        type="button"
                        className="neo-btn neo-btn--plasma neo-btn--xs"
                        onClick={() =>
                          navigate(`/meet/room?room=${ev.meetRoomId}&event=${ev.id}`)
                        }
                        data-qa={`cal-join-meet-${ev.id}`}
                      >
                        <Video />
                        <span>Join HoloMeet</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="neo-btn neo-btn--soft neo-btn--xs"
                        onClick={() => startFocusSession(25)}
                      >
                        <Play />
                        <span>Start 25m Focus</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </NeoPanel>

        {/* Right Column: Deep Event Inspector & Cross-App Context */}
        {selectedEvent && (
          <NeoPanel
            hud={`EVENT DOSSIER · ${EVENT_CATEGORY_META[selectedEvent.category].label.toUpperCase()}`}
            title={selectedEvent.title}
            className="cal-inspector-panel"
            actions={
              <button
                type="button"
                className="neo-btn neo-btn--ghost neo-btn--xs neo-btn--icon"
                onClick={() => deleteEvent(selectedEvent.id)}
                title="Remove block and release time"
                aria-label="Remove block and release time"
              >
                <Trash2 />
              </button>
            }
          >
            <div className="cal-inspector">
              <div className="cal-inspector__hero">
                <ProjectSigil icon={selectedEvent.sigil} color={selectedEvent.color} size={44} />
                <div>
                  <div className="neo-mono cal-inspector__time">
                    {formatHourRange(selectedEvent.startHour, selectedEvent.durationMins)} GST ·{' '}
                    {selectedEvent.durationMins} mins
                  </div>
                  <div className="cal-inspector__room">{selectedEvent.roomName}</div>
                </div>
              </div>

              {selectedEvent.aiPrepBrief && (
                <div className="cal-inspector__brief">
                  <div className="cal-inspector__brief-head">
                    <NovaChip>Nova Pre-Meeting Brief</NovaChip>
                    <span className="neo-mono">Signal {selectedEvent.highSignalScore}/100</span>
                  </div>
                  <p>{selectedEvent.aiPrepBrief}</p>
                </div>
              )}

              {selectedEvent.linkedContext && (
                <div className="cal-inspector__linked">
                  <span className="neo-hud">CONNECTED WORKSPACE OBJECT</span>
                  <button
                    type="button"
                    className="cal-inspector__linked-btn"
                    onClick={() => navigate(selectedEvent.linkedContext!.to)}
                  >
                    <span className="cal-inspector__linked-text">
                      <strong>{selectedEvent.linkedContext.label}</strong>
                      <span>Open live record in {selectedEvent.linkedContext.app.toUpperCase()}</span>
                    </span>
                    <ExternalLink />
                  </button>
                </div>
              )}

              <div className="cal-inspector__section">
                <span className="neo-hud">STRUCTURED AGENDA & OUTCOMES</span>
                <ul className="cal-inspector__agenda">
                  {selectedEvent.agendaBullets.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              </div>

              <div className="cal-inspector__section">
                <span className="neo-hud">
                  PARTICIPANTS ({selectedEvent.attendeeIds.length}) & TIMEZONES
                </span>
                <div className="cal-inspector__people">
                  {selectedEvent.attendeeIds.map((uid) => {
                    const u = userMap.get(uid);
                    if (!u) return null;
                    return (
                      <div key={uid} className="cal-person-chip">
                        <span className="cal-person-chip__name">{u.name}</span>
                        <span className="cal-person-chip__tz neo-mono">
                          {u.location} · {u.timezone.split('/')[1]}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="cal-inspector__section">
                <span className="neo-hud">QUICK RESCHEDULE (SHIFT SLOT)</span>
                <div className="cal-shift-row">
                  <button
                    type="button"
                    className="neo-btn neo-btn--soft neo-btn--xs"
                    onClick={() =>
                      moveEventTime(selectedEvent.id, selectedEvent.startHour - 0.5)
                    }
                  >
                    -30m Earlier
                  </button>
                  <button
                    type="button"
                    className="neo-btn neo-btn--soft neo-btn--xs"
                    onClick={() =>
                      moveEventTime(selectedEvent.id, selectedEvent.startHour + 0.5)
                    }
                  >
                    +30m Later
                  </button>
                  <button
                    type="button"
                    className="neo-btn neo-btn--soft neo-btn--xs"
                    onClick={() => moveEventTime(selectedEvent.id, selectedEvent.startHour, 1)}
                  >
                    Move to Tomorrow
                  </button>
                </div>
              </div>

              <div className="cal-inspector__actions">
                {selectedEvent.meetRoomId ? (
                  <button
                    type="button"
                    className="neo-btn neo-btn--plasma"
                    onClick={() =>
                      navigate(
                        `/meet/room?room=${selectedEvent.meetRoomId}&event=${selectedEvent.id}`,
                      )
                    }
                  >
                    <Video />
                    <span>Enter Spatial HoloMeet Stage</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    className="neo-btn neo-btn--plasma"
                    onClick={() => startFocusSession(25)}
                  >
                    <Hourglass />
                    <span>Launch 25m Focus Engine Session</span>
                  </button>
                )}
                <button
                  type="button"
                  className="neo-btn neo-btn--soft"
                  onClick={() => navigate('/meet/clips')}
                >
                  <Users />
                  <span>Deflect to Async HoloMeet Clip</span>
                </button>
              </div>
            </div>
          </NeoPanel>
        )}
      </div>
    </div>
  );
}
