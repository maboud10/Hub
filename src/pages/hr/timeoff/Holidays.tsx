/**
 * Public holidays panel for Time off: upcoming holidays for your location
 * (grouped, with countdowns and "subject to moon sighting" for Islamic
 * holidays) and a "smart break" idea — book the one or two working days
 * between a holiday and the weekend for a long stretch off. Outside the UAE it
 * explains that local holidays apply and lists when the Dubai office is closed.
 */
import { useMemo, useState } from 'react';
import { Flag, MapPin, MoonStar, Sparkles } from 'lucide-react';
import { eachDay, formatDay, holidaySet, isWeekend, todayISO } from '@/hr/calendar';
import { useHolidays } from '@/hr/selectors';
import { useSessionUser } from '@/store/selectors';
import { useNow } from '@/hooks/useNow';
import { HrPanel } from '../components/shared';
import { bridgeIdeas, fmtRange as formatRange, fmtRangeWd, groupHolidays, relDay } from './utils';

const dayLabel = (iso: string) => formatDay(iso, { weekday: 'short', day: 'numeric', month: 'short' });

export function HolidaysPanel({ onPlan }: { onPlan: (start: string, end: string) => void }) {
  const me = useSessionUser();
  const mine = useHolidays();
  const dubai = useHolidays('Dubai');
  const today = todayISO(useNow(60_000));
  const [all, setAll] = useState(false);
  const location = me?.location ?? '';
  const applies = mine.applies;
  const source = applies ? mine.upcoming : dubai.upcoming;
  const blocks = useMemo(() => groupHolidays(source), [source]);
  const set = useMemo(() => holidaySet(location), [location]);
  const idea = useMemo(() => (applies ? bridgeIdeas(mine.upcoming, set, today)[0] : undefined), [applies, mine.upcoming, set, today]);
  const ideaDays = idea ? eachDay(idea.start, idea.end).filter((d) => !isWeekend(d) && !set.has(d)) : [];
  const shown = all ? blocks : blocks.slice(0, 5);

  return (
    <HrPanel
      className="hr-to-holidays"
      hud="Official calendar"
      title="Public holidays"
      icon={<Flag aria-hidden="true" />}
      sub={applies ? `${location} calendar · never deducted from your balance` : 'Dubai office calendar, for reference'}
    >
      {!applies && (
        <div className="hr-to-callout hr-to-callout--info">
          <MapPin aria-hidden="true" />
          <p>
            <b>You’re based in {location || 'another country'}, so your local public holidays apply.</b> If one falls inside a request, mention it in your note and People Ops will make sure it isn’t deducted. Below is when the Dubai office is closed, handy when you plan with colleagues there.
          </p>
        </div>
      )}
      {idea && (
        <div className="hr-to-idea">
          <span className="hr-to-idea__icon" aria-hidden="true">
            <Sparkles />
          </span>
          <div className="hr-to-idea__text">
            <b>
              Smart break: {idea.length} days off for {idea.cost} day{idea.cost === 1 ? '' : 's'} of leave
            </b>
            <span>
              Take {ideaDays.map(dayLabel).join(' and ')} off around {idea.names.join(' & ')}: {formatRange(idea.from, idea.to)} in a row.
            </span>
          </div>
          <button type="button" className="btn btn--sm btn--primary" onClick={() => onPlan(idea.start, idea.end)}>
            Plan it
          </button>
        </div>
      )}
      {blocks.length === 0 ? (
        <p className="text-sm muted">No public holidays in the next 12 months.</p>
      ) : (
        <ul className="hr-to-hols">
          {shown.map((b) => (
            <li key={b.start} className={`hr-to-hol${b.dates.every(isWeekend) ? ' is-weekend' : ''}`}>
              <span className="hr-to-hol__date" aria-hidden="true">
                <span>{formatDay(b.start, { month: 'short' })}</span>
                <b>{Number(b.start.slice(8))}</b>
              </span>
              <span className="hr-to-hol__body">
                <b>{b.name}</b>
                <span>
                  {fmtRangeWd(b.start, b.end)}
                  {b.dates.length > 1 ? ` · ${b.dates.length} days` : ''}
                  {b.dates.every(isWeekend) ? ' · on a weekend' : ''}
                </span>
                {b.expected && (
                  <span className="hr-to-hol__moon">
                    <MoonStar aria-hidden="true" /> Expected · subject to moon sighting
                  </span>
                )}
              </span>
              <span className="hr-to-hol__when">{relDay(b.start, today)}</span>
            </li>
          ))}
        </ul>
      )}
      {blocks.length > 5 && (
        <button type="button" className="btn btn--ghost btn--sm hr-to-hols__more" onClick={() => setAll((v) => !v)}>
          {all ? 'Show fewer' : `Show all ${blocks.length}`}
        </button>
      )}
    </HrPanel>
  );
}
