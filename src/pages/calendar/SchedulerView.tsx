/**
 * Helix Calendar — View 2: Global Time-Zone Weaver & Circadian Overlap Matrix
 * Evaluates cognitive harmony across Dubai (UTC+4), London (UTC+0),
 * Singapore (UTC+8), and New York (UTC-5) and books golden overlap windows.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Check, Globe2, Sparkles, Sun, Video } from 'lucide-react';
import { Chip, NeoPanel, NeoTabs, NovaChip } from '@/components/neo';
import { computeTimezoneOverlapMatrix, formatDecimalHour } from '@/calendar/engine';
import { useCalendar } from '@/calendar/store';

type HubKey = 'Dubai' | 'London' | 'Singapore' | 'NewYork';

const HUB_META: {
  id: HubKey;
  label: string;
  tzLabel: string;
  lead: string;
  color: string;
}[] = [
  { id: 'Dubai', label: 'Dubai HQ', tzLabel: 'GST · UTC+4', lead: 'Layla, Omar, Sara', color: '#22d3ee' },
  { id: 'London', label: 'London Hub', tzLabel: 'GMT · UTC+0', lead: 'Daniel, Aisha', color: '#a855f7' },
  { id: 'Singapore', label: 'Singapore Lab', tzLabel: 'SGT · UTC+8', lead: 'Mei, Hana, Grace', color: '#f472b6' },
  { id: 'NewYork', label: 'New York Pod', tzLabel: 'EST · UTC-5', lead: 'Noah, Ethan', color: '#fb923c' },
];

const DURATION_OPTIONS = [30, 45, 60] as const;

export function SchedulerView() {
  const navigate = useNavigate();
  const createEvent = useCalendar((s) => s.createEvent);

  const [selectedHubs, setSelectedHubs] = useState<HubKey[]>(['Dubai', 'London', 'Singapore']);
  const [meetingTitle, setMeetingTitle] = useState('Cross-Hub Architecture & Growth Sync');
  const [durationMins, setDurationMins] = useState<30 | 45 | 60>(45);

  const toggleHub = (hub: HubKey) => {
    setSelectedHubs((prev) =>
      prev.includes(hub)
        ? prev.length > 1
          ? prev.filter((h) => h !== hub)
          : prev
        : [...prev, hub],
    );
  };

  const slots = useMemo(
    () => computeTimezoneOverlapMatrix(selectedHubs),
    [selectedHubs],
  );

  const goldenSlots = useMemo(
    () => slots.filter((s) => s.label === 'golden'),
    [slots],
  );

  const handleBookSlot = (dubaiHour: number, harmonyScore: number) => {
    const created = createEvent({
      title: `${meetingTitle} (${harmonyScore}% Harmony)`,
      description: `Booked via Chronos Global Time-Zone Weaver across ${selectedHubs.join(' × ')}.`,
      category: 'meet',
      dayOffset: 0,
      startHour: dubaiHour,
      durationMins,
      attendeeIds: ['u-layla', 'u-omar', 'u-daniel', 'u-mei'],
      roomName: 'Atrium · Room Nebula + HoloMeet',
    });
    if (created) {
      navigate('/calendar');
    }
  };

  return (
    <div className="cal-view">
      <NeoPanel
        hud="CIRCADIAN OVERLAP ENGINE · ZERO-BURNOUT GLOBAL SCHEDULING"
        title="Global Time-Zone Weaver"
        actions={
          <NovaChip>
            {goldenSlots.length} Golden Overlap Windows ({durationMins}m)
          </NovaChip>
        }
      >
        <div className="cal-weaver-controls">
          <label className="cal-weaver-field">
            <span className="neo-hud">MEETING TITLE</span>
            <input
              type="text"
              className="neo-input"
              value={meetingTitle}
              onChange={(e) => setMeetingTitle(e.target.value)}
            />
          </label>

          <div className="cal-weaver-field">
            <span className="neo-hud">DURATION</span>
            <NeoTabs
              value={String(durationMins)}
              onChange={(v) => setDurationMins(Number(v) as 30 | 45 | 60)}
              label="DURATION"
              items={DURATION_OPTIONS.map((mins) => ({ value: String(mins), label: `${mins} mins` }))}
            />
          </div>
        </div>

        {/* Global Hub Toggles */}
        <div className="cal-hub-toggles">
          {HUB_META.map((h) => {
            const active = selectedHubs.includes(h.id);
            return (
              <button
                key={h.id}
                type="button"
                className={`cal-hub-card ${active ? 'is-active' : ''}`}
                onClick={() => toggleHub(h.id)}
                aria-pressed={active}
                data-qa={`cal-hub-${h.id}`}
              >
                <span className="cal-hub-card__top">
                  <Globe2 style={{ color: h.color }} />
                  <span className="neo-mono">{h.tzLabel}</span>
                  {active && <Check className="cal-hub-card__check" />}
                </span>
                <span className="cal-hub-card__title">{h.label}</span>
                <span className="cal-hub-card__lead">{h.lead}</span>
              </button>
            );
          })}
        </div>

        {/* 14-Slot Circadian Matrix */}
        <div className="cal-matrix-table">
          <div className="cal-matrix-head">
            <span>Dubai (GST)</span>
            <span>London (GMT)</span>
            <span>Singapore (SGT)</span>
            <span>New York (EST)</span>
            <span>Circadian Harmony</span>
            <span>Action</span>
          </div>

          {slots.map((slot) => (
            <div
              key={slot.utcHour}
              className={`cal-matrix-row is-${slot.label}`}
              data-qa={`cal-slot-${slot.utcHour}`}
            >
              <span className="neo-mono cal-matrix-cell">
                <Sun className="cal-sun-icon" /> {formatDecimalHour(slot.dubaiHour)}
              </span>
              <span className="neo-mono cal-matrix-cell">
                {formatDecimalHour(slot.londonHour)}
              </span>
              <span className="neo-mono cal-matrix-cell">
                {formatDecimalHour(slot.singaporeHour)}
              </span>
              <span className="neo-mono cal-matrix-cell">
                {formatDecimalHour(slot.newYorkHour)}
              </span>

              <div className="cal-matrix-harmony">
                <Chip
                  tone={
                    slot.label === 'golden'
                      ? 'emerald'
                      : slot.label === 'viable'
                        ? 'amber'
                        : 'danger'
                  }
                  size="sm"
                >
                  {slot.harmonyScore}% ·{' '}
                  {slot.label === 'golden'
                    ? 'Golden Window'
                    : slot.label === 'viable'
                      ? 'Shoulder'
                      : 'Off-Hours'}
                </Chip>
                <span className="cal-matrix-note">{slot.note}</span>
              </div>

              <div className="cal-matrix-cta">
                {slot.label !== 'off_hours' ? (
                  <button
                    type="button"
                    className={`neo-btn ${slot.label === 'golden' ? 'neo-btn--plasma' : 'neo-btn--soft'} neo-btn--xs`}
                    onClick={() => handleBookSlot(slot.dubaiHour, slot.harmonyScore)}
                  >
                    <Sparkles />
                    <span>Book {formatDecimalHour(slot.dubaiHour)} GST</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    className="neo-btn neo-btn--ghost neo-btn--xs"
                    onClick={() => navigate('/meet/clips')}
                  >
                    <Video />
                    <span>Send Async Clip</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </NeoPanel>
    </div>
  );
}
