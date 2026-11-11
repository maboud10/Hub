/**
 * Helix Wellbeing — Care: confidential support. EAP counsellor booking with a
 * live tracker (Request → Matched → Session booked → Follow-up), a 24/7
 * talk-now line, crisis resources by country, anonymous Care circles and
 * mental-health-day guidance. Nothing here is visible to anyone else.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import { CalendarCheck, CalendarPlus, Check, EyeOff, HandHeart, Languages, Lock, MessageCircle, Phone, PhoneCall, ShieldCheck, Siren, Star, UserRound, Users, Video, X } from 'lucide-react';
import { Chip, NeoHome, NeoPanel, NeoTabs, NeoTracker, Typing } from '@/components/neo';
import { toast } from '@/store/toast';
import { cx } from '@/lib/cx';
import { careTracker, formatDayLabel, formatHour, hourOf, rankCounsellors, slotAt } from '@/wellbeing/engine';
import { CARE_CIRCLES, CARE_FORMATS, CARE_LANGUAGES, CARE_TOPICS, CARE_TOPIC_LABEL, COUNSELLORS, COUNSELLOR_BY_ID, CRISIS_RESOURCES, circleAlias, isoDay, type CrisisResource } from '@/wellbeing/seed';
import { useWellbeing } from '@/wellbeing/store';
import type { CareBooking, CareFormat, CareLanguage, CareTopic, Mood } from '@/wellbeing/types';
import { PrivateChip, RadioPills, Switch, U, addPrivateHold, say, useLocale, useMe } from './parts';

const DAY = 86_400_000;
const STEPS = ['Requested', 'Matched', 'Session booked', 'Follow-up'];
const MESSAGE: Record<number, string> = {
  0: 'Tell us what’s on your mind. Only you and your counsellor will know.',
  1: 'We found counsellors who fit. Pick a time that works for you.',
  2: 'Your session is booked. Nobody at Helix can see this.',
  3: 'Check in with yourself, then decide on a follow-up.',
  4: 'Plan complete. You can start a new request any time.',
};
const FORMAT_ICON: Record<CareFormat, ReactNode> = { video: <Video />, phone: <Phone />, 'in-person': <UserRound /> };

const regionFor = (location?: string): CrisisResource['id'] => {
  const l = (location ?? '').toLowerCase();
  if (l.includes('dubai') || l.includes('abu dhabi')) return 'uae';
  if (l.includes('london')) return 'uk';
  if (l.includes('singapore')) return 'sg';
  if (l.includes('new york')) return 'us';
  return 'remote';
};

export function CareView() {
  const { me, uid, data } = useMe();
  const { hash } = useLocation();
  const now = Date.now();

  useEffect(() => {
    if (hash === '#circles') window.setTimeout(() => document.getElementById('circles')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  }, [hash]);

  const open = data.care.find((b) => b.stage < 4) ?? null;
  const recentDone = data.care.find((b) => b.stage === 4 && (b.closedAt ?? 0) > now - DAY) ?? null;
  const booking = open ?? recentDone;
  const track = careTracker(booking);
  const counsellor = booking?.counsellorId ? COUNSELLOR_BY_ID[booking.counsellorId] : undefined;

  return (
    <div className="wb-view">
      <section className="wb-privacy-hero" aria-label="Privacy">
        <span className="wb-privacy-hero__icon" aria-hidden="true">
          <Lock />
        </span>
        <div className="wb-privacy-hero__text">
          <h2>Confidential by design</h2>
          <p>Helix never sees who uses Care. Bookings, topics and circles are invisible to managers, People Ops and admins. Only you and your counsellor know.</p>
        </div>
        <ul className="wb-privacy-hero__chips">
          <li>
            <EyeOff aria-hidden="true" />
            <span>No manager visibility</span>
          </li>
          <li>
            <ShieldCheck aria-hidden="true" />
            <span>Never in reports</span>
          </li>
          <li>
            <CalendarCheck aria-hidden="true" />
            <span>Calendar shows “Personal appointment”</span>
          </li>
        </ul>
      </section>

      <NeoHome
        main={
          <>
            <NeoTracker
              className="wb-care-tracker"
              hud="Care tracker"
              title="Counselling journey"
              label="Counselling journey"
              steps={STEPS.map((label, i) => ({
                label,
                sub:
                  i === 0 && booking ? (
                    CARE_TOPIC_LABEL[booking.topic]
                  ) : i === 1 && counsellor ? (
                    counsellor.name
                  ) : i === 2 && booking?.sessionAt ? (
                    <>
                      <span>{formatDayLabel(isoDay(booking.sessionAt))}</span> <b>{formatHour(hourOf(booking.sessionAt))}</b>
                    </>
                  ) : undefined,
              }))}
              current={track.current}
              state={track.state}
              message={MESSAGE[track.current] ?? MESSAGE[0]}
              actions={<PrivateChip compact />}
            />
            <BookingPanel uid={uid} booking={booking} />
            <CirclesPanel uid={uid} joined={data.circles} />
          </>
        }
        side={
          <>
            <TalkNowPanel />
            <CrisisPanel initial={regionFor(me?.location)} />
            <NeoPanel className="wb-mhday" hud="Time off" title="Mental-health days">
              <p className="wb-muted">Taking a day for your mind is sick leave. Up to two days need no note and are approved instantly, and colleagues only ever see “Away”.</p>
              <Link to="/hr/time-off" className="neo-btn neo-btn--soft neo-btn--sm">
                <CalendarPlus />
                <span>Open Time off</span>
              </Link>
            </NeoPanel>
          </>
        }
        sideLabel="Support"
      />
    </div>
  );
}

/* ───────────────────────── booking flow ───────────────────────── */

function BookingPanel({ uid, booking }: { uid: string; booking: CareBooking | null }) {
  const requestCare = useWellbeing((s) => s.requestCare);
  const bookCare = useWellbeing((s) => s.bookCare);
  const completeCareSession = useWellbeing((s) => s.completeCareSession);
  const closeCare = useWellbeing((s) => s.closeCare);
  const cancelCare = useWellbeing((s) => s.cancelCare);

  const [topic, setTopic] = useState<CareTopic>('stress');
  const [language, setLanguage] = useState<CareLanguage>(document.documentElement.lang === 'ar' ? 'ar' : 'en');
  const [format, setFormat] = useState<CareFormat>('video');
  const [pick, setPick] = useState<{ counsellorId: string; at: number } | null>(null);
  const [hold, setHold] = useState(true);
  const [feeling, setFeeling] = useState<Mood | null>(null);
  const now = Date.now();

  const matches = useMemo(() => (booking && booking.stage === 1 ? rankCounsellors(COUNSELLORS, booking).slice(0, 3) : []), [booking]);

  const startNew = () => {
    setPick(null);
    requestCare(uid, { topic, language, format });
  };

  const confirm = async () => {
    if (!booking || !pick) return;
    bookCare(uid, booking.id, pick.counsellorId, pick.at, hold);
    if (hold) await addPrivateHold(uid, pick.at);
    toast.success('Session booked', 'Only you and your counsellor know');
    setPick(null);
  };

  const addHold = async () => {
    if (!booking?.sessionAt || !booking.counsellorId) return;
    if (await addPrivateHold(uid, booking.sessionAt)) bookCare(uid, booking.id, booking.counsellorId, booking.sessionAt, true);
  };

  const followUp = () => {
    if (!booking?.counsellorId || !booking.sessionAt) return;
    closeCare(uid, booking.id);
    const next = requestCare(uid, { topic: booking.topic, language: booking.language, format: booking.format });
    const at = Math.max(booking.sessionAt + 14 * DAY, now + 2 * DAY);
    bookCare(uid, next.id, booking.counsellorId, at, false);
    toast.success('Follow-up booked', say(`${formatDayLabel(isoDay(at))}, ${formatHour(hourOf(at))}`, `${formatDayLabel(isoDay(at))}، ${formatHour(hourOf(at))}`));
  };

  if (!booking || booking.stage === 4) {
    return (
      <NeoPanel className="wb-book" hud="Step 1 · Request" title="Talk to a counsellor" actions={<Chip tone="violet" size="sm" icon={<Languages />}>English & Arabic</Chip>}>
        {booking?.stage === 4 && (
          <p className="wb-book__done">
            <Check aria-hidden="true" />
            <span>Your last plan is complete. Proud of you for showing up for yourself.</span>
          </p>
        )}
        <div className="wb-book__q">
          <span className="wb-book__label">What would you like to talk about?</span>
          <RadioPills label="Topic" value={topic} onChange={setTopic} options={CARE_TOPICS.map((t) => ({ value: t.id, label: t.label }))} />
        </div>
        <div className="wb-book__row">
          <div className="wb-book__q">
            <span className="wb-book__label">Language</span>
            <RadioPills label="Language" value={language} onChange={setLanguage} options={CARE_LANGUAGES.map((l) => ({ value: l.id, label: l.label }))} />
          </div>
          <div className="wb-book__q">
            <span className="wb-book__label">Format</span>
            <RadioPills label="Format" value={format} onChange={setFormat} options={CARE_FORMATS.map((f) => ({ value: f.id, label: f.label, icon: FORMAT_ICON[f.id] }))} />
          </div>
        </div>
        <div className="wb-book__foot">
          <span className="wb-muted">Free, unlimited first sessions through the Helix EAP. No referral needed.</span>
          <button type="button" className="neo-btn neo-btn--plasma" onClick={startNew}>
            <HandHeart />
            <span>Find my match</span>
          </button>
        </div>
      </NeoPanel>
    );
  }

  if (booking.stage === 1) {
    return (
      <NeoPanel className="wb-book" hud="Step 2 · Matched" title="Counsellors who fit" actions={<button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={() => cancelCare(uid, booking.id)}>Change request</button>}>
        <p className="wb-book__ask">
          <span>Topic</span> <b>{CARE_TOPIC_LABEL[booking.topic]}</b> <span>·</span> <b>{CARE_LANGUAGES.find((l) => l.id === booking.language)?.label}</b> <span>·</span> <b>{CARE_FORMATS.find((f) => f.id === booking.format)?.label}</b>
        </p>
        <div className="wb-matches">
          {matches.map(({ counsellor: c, reasons }) => {
            const slots = c.slots.map((s) => ({ ...s, at: slotAt(s, now) })).filter((s) => s.at > now + 30 * 60_000);
            return (
              <article key={c.id} className={cx('wb-match', 'neo-spot', pick?.counsellorId === c.id && 'is-on')}>
                <header className="wb-match__head">
                  <span className="wb-match__avatar" style={{ background: `linear-gradient(135deg, hsl(${c.hue} 80% 62%), hsl(${(c.hue + 50) % 360} 70% 46%))` }} aria-hidden="true">
                    {c.name
                      .replace('Dr. ', '')
                      .split(' ')
                      .map((p) => p[0])
                      .slice(0, 2)
                      .join('')}
                  </span>
                  <div className="wb-match__titles">
                    <h3>{c.name}</h3>
                    <span className="wb-match__cred">{c.credentials}</span>
                  </div>
                  <span className="wb-match__rating" title="Average rating">
                    <Star aria-hidden="true" />
                    <b>{c.rating}</b>
                  </span>
                </header>
                <p className="wb-match__bio">{c.bio}</p>
                <div className="wb-match__chips">
                  {c.specialties.map((s) => (
                    <Chip key={s} size="sm" tone={s === booking.topic ? 'app' : 'slate'}>
                      {CARE_TOPIC_LABEL[s]}
                    </Chip>
                  ))}
                </div>
                <ul className="wb-match__why">
                  {reasons.map((r) => (
                    <li key={r}>
                      <Check aria-hidden="true" />
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
                <div className="wb-match__slots" role="group" aria-label="Next availability">
                  {slots.map((s) => {
                    const on = pick?.counsellorId === c.id && pick.at === s.at;
                    return (
                      <button key={s.id} type="button" className={cx('wb-slot', on && 'is-on')} aria-pressed={on} onClick={() => setPick({ counsellorId: c.id, at: s.at })}>
                        <span>{s.dayOffset === 0 ? 'Today' : s.dayOffset === 1 ? 'Tomorrow' : formatDayLabel(isoDay(s.at))}</span>
                        <b>{formatHour(s.hour)}</b>
                      </button>
                    );
                  })}
                </div>
              </article>
            );
          })}
        </div>
        {pick && (
          <div className="wb-book__confirm" aria-live="polite">
            <Switch checked={hold} onChange={setHold} label="Add a private hold to my calendar">
              <b>Add a private hold to my calendar</b>
              <span>Shows only as “Personal appointment”, with no details.</span>
            </Switch>
            <button type="button" className="neo-btn neo-btn--plasma" onClick={() => void confirm()}>
              <CalendarCheck />
              <span>Book session</span>
            </button>
          </div>
        )}
      </NeoPanel>
    );
  }

  const c = booking.counsellorId ? COUNSELLOR_BY_ID[booking.counsellorId] : undefined;
  const when = booking.sessionAt ? (
    <>
      <span>{formatDayLabel(isoDay(booking.sessionAt))}</span> <span>·</span> <span>{formatHour(hourOf(booking.sessionAt))}</span>
    </>
  ) : null;

  if (booking.stage === 2) {
    return (
      <NeoPanel className="wb-book" hud="Step 3 · Session booked" title="You’re booked in" actions={<PrivateChip compact />}>
        <div className="wb-booked">
          <span className="wb-booked__icon" aria-hidden="true">
            {FORMAT_ICON[booking.format]}
          </span>
          <div className="wb-booked__text">
            <b className="wb-booked__when">{when}</b>
            <span>
              {c?.name} <span>·</span> <span>{CARE_FORMATS.find((f) => f.id === booking.format)?.label}</span>
            </span>
            <span className="wb-muted">{booking.format === 'video' ? 'A private video link unlocks 10 minutes before.' : booking.format === 'phone' ? 'Your counsellor will call you at this time.' : 'Wellbeing room, Level 40. Reception won’t ask why.'}</span>
          </div>
        </div>
        <div className="wb-book__actions">
          {booking.calendarHold ? (
            <Chip tone="success" size="sm" icon={<Check />}>
              Private calendar hold added
            </Chip>
          ) : (
            <button type="button" className="neo-btn neo-btn--soft neo-btn--sm" onClick={() => void addHold()}>
              <CalendarPlus />
              <span>Add private calendar hold</span>
            </button>
          )}
          <button type="button" className="neo-btn neo-btn--soft neo-btn--sm" onClick={() => completeCareSession(uid, booking.id, (booking.sessionAt ?? now) + 14 * DAY)}>
            <Check />
            <span>Session done · plan follow-up</span>
          </button>
          <button type="button" className="neo-btn neo-btn--ghost neo-btn--sm" onClick={() => cancelCare(uid, booking.id)}>
            <X />
            <span>Cancel booking</span>
          </button>
        </div>
      </NeoPanel>
    );
  }

  return (
    <NeoPanel className="wb-book" hud="Step 4 · Follow-up" title="How are you feeling?" actions={<PrivateChip compact />}>
      <RadioPills
        label="How you feel after the session"
        variant="tile"
        value={feeling}
        onChange={setFeeling}
        options={[
          { value: 2 as Mood, label: 'Heavy', icon: <span className="wb-emoji">😔</span> },
          { value: 3 as Mood, label: 'Okay', icon: <span className="wb-emoji">😐</span> },
          { value: 4 as Mood, label: 'Lighter', icon: <span className="wb-emoji">🙂</span> },
          { value: 5 as Mood, label: 'Hopeful', icon: <span className="wb-emoji">🌱</span> },
        ]}
      />
      <p className="wb-muted wb-book__fu">{feeling && feeling <= 2 ? 'Thank you for being honest. A follow-up soon can really help, and the 24/7 line is always open.' : 'Many people find a second session two weeks later locks in the progress.'}</p>
      <div className="wb-book__actions">
        <button type="button" className="neo-btn neo-btn--plasma neo-btn--sm" onClick={followUp}>
          <CalendarPlus />
          <span>Book a follow-up</span>
        </button>
        <button type="button" className="neo-btn neo-btn--ghost neo-btn--sm" onClick={() => closeCare(uid, booking.id)}>
          <Check />
          <span>Close this plan</span>
        </button>
      </div>
    </NeoPanel>
  );
}

/* ───────────────────────── talk now & crisis ───────────────────────── */

function TalkNowPanel() {
  const [state, setState] = useState<'idle' | 'connecting' | 'ready'>('idle');
  useEffect(() => {
    if (state !== 'connecting') return;
    const t = window.setTimeout(() => setState('ready'), 1600);
    return () => window.clearTimeout(t);
  }, [state]);
  return (
    <NeoPanel className="wb-talk" hud="24/7 · free · confidential" title="Talk now">
      <a className="wb-talk__call" href="tel:80043549">
        <span className="wb-talk__pulse" aria-hidden="true">
          <PhoneCall />
        </span>
        <span className="wb-talk__text">
          <b>Helix Care line</b>
          <span className="neo-mono">800 HELIX · 800 43549</span>
        </span>
      </a>
      <p className="wb-muted">
        <span>Average answer time</span>{' '}
        <b>
          40
          <U u="s" />
        </b>{' '}
        <span>·</span> <span>English & Arabic</span>
      </p>
      {state === 'idle' ? (
        <button type="button" className="neo-btn neo-btn--soft neo-btn--block" onClick={() => setState('connecting')}>
          <MessageCircle />
          <span>Start a confidential chat</span>
        </button>
      ) : state === 'connecting' ? (
        <p className="wb-talk__status" aria-live="polite">
          <Typing label="Connecting" />
          <span>Connecting you to an on-call counsellor…</span>
        </p>
      ) : (
        <p className="wb-talk__status is-ready" aria-live="polite">
          <Check aria-hidden="true" />
          <span>A counsellor will join in under a minute. This chat is never stored in Helix.</span>
        </p>
      )}
    </NeoPanel>
  );
}

function CrisisPanel({ initial }: { initial: CrisisResource['id'] }) {
  const [region, setRegion] = useState<CrisisResource['id']>(initial);
  const res = CRISIS_RESOURCES.find((r) => r.id === region) ?? CRISIS_RESOURCES[0];
  return (
    <NeoPanel className="wb-crisis" hud="If you’re in crisis" title="Get help right now" icon={<Siren />}>
      <NeoTabs label="Country" value={region} onChange={setRegion} items={CRISIS_RESOURCES.map((r) => ({ value: r.id, label: r.label }))} />
      <ul className="wb-crisis__lines">
        {res.lines.map((l) => {
          const href = /^[\d\s+]+$/.test(l.number) ? `tel:${l.number.replace(/\s+/g, '')}` : `https://${l.number}`;
          return (
            <li key={l.label}>
              <a href={href} target={href.startsWith('https') ? '_blank' : undefined} rel="noreferrer">
                <span className="wb-crisis__label">{l.label}</span>
                <b className="wb-crisis__num neo-mono">{l.number}</b>
                <span className="wb-crisis__note">{l.note}</span>
              </a>
            </li>
          );
        })}
      </ul>
      <p className="wb-crisis__foot">If you or someone else is in immediate danger, call your local emergency number now.</p>
    </NeoPanel>
  );
}

/* ───────────────────────── circles ───────────────────────── */

function CirclesPanel({ uid, joined }: { uid: string; joined: string[] }) {
  const toggleCircle = useWellbeing((s) => s.toggleCircle);
  const locale = useLocale();
  return (
    <NeoPanel
      id="circles"
      className="wb-circles-panel"
      hud="Anonymous peer support"
      title="Care circles"
      actions={
        <Chip tone="slate" size="sm" icon={<Users />}>
          <span>You appear as</span> <b>{circleAlias(uid, locale === 'ar' ? 'ar' : 'en')}</b>
        </Chip>
      }
    >
      <div className="wb-circles">
        {CARE_CIRCLES.map((c) => {
          const on = joined.includes(c.id);
          return (
            <article key={c.id} className={cx('wb-circle', 'neo-spot', on && 'is-on')} style={{ ['--hue' as string]: c.hue }}>
              <header className="wb-circle__head">
                <span className="wb-circle__glyph" aria-hidden="true">
                  <Users />
                </span>
                <h3>{c.name}</h3>
              </header>
              <p className="wb-circle__blurb">{c.blurb}</p>
              <div className="wb-circle__meta">
                <span>
                  <b>{c.members + (on ? 1 : 0)}</b> <span>members</span>
                </span>
                <span>{c.meets}</span>
              </div>
              <button
                type="button"
                className={cx('neo-btn', 'neo-btn--xs', on ? 'neo-btn--ghost' : 'neo-btn--soft')}
                aria-pressed={on}
                onClick={() => {
                  const nowOn = toggleCircle(uid, c.id);
                  toast.info(nowOn ? 'Joined anonymously' : 'Left the circle', c.name);
                }}
              >
                {on ? <Check /> : <Users />}
                <span>{on ? 'Joined' : 'Join anonymously'}</span>
              </button>
            </article>
          );
        })}
      </div>
    </NeoPanel>
  );
}
