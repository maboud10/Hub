/**
 * 1:1s — side panel (series grouped by relationship, next-up countdown,
 * meeting rhythm) and the "New 1:1" dialog.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { CalendarClock, CalendarPlus, ChevronDown, GraduationCap, MessageSquareText, Plus, SquareCheckBig, UserPlus } from 'lucide-react';
import { Chip, NeoSide, NeoSideGroup, NeoSideItem, PeoplePicker } from '@/components/neo';
import { Avatar } from '@/components/ui/primitives';
import { burstConfetti } from '@/lib/confetti';
import { isManagerOf } from '@/performance/access';
import { usePerf } from '@/performance/store';
import type { Cadence, OneOnOneSeries } from '@/performance/types';
import { dayLabel, report, type PerfCtx } from './hooks';
import { useShell } from './PerformancePage';
import { PfModal, Seg } from './ui';
import { CADENCE_LABEL, CADENCE_OPTIONS, countdown, fromLocalInput, meetingPhase, meetingRhythm, MIN, nextMonday, nextSlot, partnerOf, pickDefault, relationOf, RELATION, toLocalInput, whenShort } from './oneonones-shared';

const DAY = 86_400_000;

/* ═════════════════════ Side panel ═════════════════════ */

export function SeriesSide({ ctx, list, activeId, now, onNew }: { ctx: PerfCtx; list: OneOnOneSeries[]; activeId?: string; now: number; onNew: (partnerId?: string) => void }) {
  const { setPeek } = useShell();
  const me = ctx.me.id;
  const close = () => setPeek(false);

  const groups = useMemo(() => {
    const g = { manager: [] as OneOnOneSeries[], reports: [] as OneOnOneSeries[], mentoring: [] as OneOnOneSeries[] };
    for (const s of [...list].sort((a, b) => a.nextAt - b.nextAt)) g[RELATION[relationOf(s, me)].group].push(s);
    return g;
  }, [list, me]);

  // Direct reports without a 1:1 yet → quick set-up rows.
  const missing = useMemo(() => ctx.reportIds.filter((id) => !list.some((s) => partnerOf(s, me) === id)), [ctx.reportIds, list, me]);
  const next = useMemo(() => pickDefault(list, now), [list, now]);
  const rhythm = useMemo(() => meetingRhythm(list, now), [list, now]);
  const total = rhythm.reduce((a, b) => a + b, 0);
  const peak = Math.max(1, ...rhythm);

  return (
    <NeoSide
      title="1:1s"
      label="Your 1:1s"
      className="pf-11-side"
      actions={
        <button type="button" className="neo-iconbtn neo-iconbtn--sm" aria-label="New 1:1" data-tip="New 1:1 · N" data-tip-pos="left" onClick={() => onNew()} data-qa="oo-new">
          <Plus />
        </button>
      }
      top={next ? <NextUp ctx={ctx} s={next} now={now} onPick={close} /> : undefined}
    >
      {groups.manager.length > 0 && (
        <NeoSideGroup label="With my manager">
          {groups.manager.map((s) => (
            <SeriesItem key={s.id} ctx={ctx} s={s} now={now} active={s.id === activeId} onPick={close} />
          ))}
        </NeoSideGroup>
      )}
      {(groups.reports.length > 0 || missing.length > 0) && (
        <NeoSideGroup label={`My reports · ${groups.reports.length}`}>
          {groups.reports.map((s) => (
            <SeriesItem key={s.id} ctx={ctx} s={s} now={now} active={s.id === activeId} onPick={close} />
          ))}
          {missing.map((id) => {
            const u = ctx.user(id);
            if (!u) return null;
            return (
              <div key={id} className="pf-11-side__setup">
                <NeoSideItem
                  onClick={() => {
                    close();
                    onNew(id);
                  }}
                  title={`Set up a 1:1 with ${u.name}`}
                  icon={
                    <span className="pf-11-side__ghost" aria-hidden="true">
                      <UserPlus />
                    </span>
                  }
                  label={
                    <>
                      <span className="pf-11-sitem__name">{u.name}</span>
                      <span className="pf-11-sitem__when">Set up a 1:1</span>
                    </>
                  }
                />
              </div>
            );
          })}
        </NeoSideGroup>
      )}
      {groups.mentoring.length > 0 && (
        <NeoSideGroup label="Mentoring">
          {groups.mentoring.map((s) => (
            <SeriesItem key={s.id} ctx={ctx} s={s} now={now} active={s.id === activeId} onPick={close} />
          ))}
        </NeoSideGroup>
      )}
      {!list.length && !missing.length && <p className="pf-11-side__empty">No 1:1s yet. Start one with your manager, a report or someone you’d like to mentor.</p>}

      {total > 0 && (
        <div className="pf-11-rhythm" role="img" aria-label={`${total} meetings in the last 8 weeks: ${rhythm.join(', ')}`}>
          <div className="neo-hud">Rhythm · 8 weeks</div>
          <div className="pf-11-rhythm__bars" aria-hidden="true">
            {rhythm.map((n, i) => (
              <i key={i} className={n ? undefined : 'is-zero'} style={{ height: `${n ? Math.max(18, (n / peak) * 100) : 8}%` }} title={`${n} meeting${n === 1 ? '' : 's'}`} />
            ))}
          </div>
          <div className="pf-11-rhythm__sub">
            <b>{total}</b> meeting{total === 1 ? '' : 's'} across <b>{list.length}</b> series
          </div>
        </div>
      )}
    </NeoSide>
  );
}

function SeriesItem({ ctx, s, now, active, onPick }: { ctx: PerfCtx; s: OneOnOneSeries; now: number; active: boolean; onPick: () => void }) {
  const pid = partnerOf(s, ctx.me.id);
  const u = ctx.user(pid);
  const rel = relationOf(s, ctx.me.id);
  const open = s.agenda.filter((a) => !a.done).length;
  const acts = s.actionItems.filter((a) => !a.done);
  const overdue = acts.filter((a) => a.dueAt && a.dueAt < now).length;
  const phase = meetingPhase(s, now);
  const when = phase === 'live' ? 'Live now' : phase === 'overdue' ? `Was ${whenShort(s.nextAt, now)}` : whenShort(s.nextAt, now);
  return (
    <NeoSideItem
      to={`/performance/one-on-ones/${s.id}`}
      active={active}
      onClick={onPick}
      title={`1:1 with ${u?.name ?? 'Unknown'} · ${RELATION[rel].label} · ${dayLabel(s.nextAt, now)}`}
      icon={
        <span className="pf-11-sitem__av">
          {u && <Avatar user={u} size={30} presence />}
          {phase === 'live' && <span className="pf-11-live-dot" aria-hidden="true" />}
        </span>
      }
      label={
        <>
          <span className="pf-11-sitem__name">{u?.name ?? 'Unknown'}</span>
          <span className="pf-11-sitem__when" data-phase={phase}>
            {rel === 'mentor' || rel === 'mentee' ? `${rel === 'mentor' ? 'Mentor' : 'Mentee'} · ` : ''}
            {when}
          </span>
        </>
      }
      meta={
        open || acts.length ? (
          <span className="pf-11-sitem__meta">
            {open > 0 && (
              <span className="pf-11-count" title={`${open} open talking point${open === 1 ? '' : 's'}`}>
                <MessageSquareText aria-hidden="true" />
                {open}
              </span>
            )}
            {acts.length > 0 && (
              <span className="pf-11-count" data-tone={overdue ? 'danger' : undefined} title={`${acts.length} open action item${acts.length === 1 ? '' : 's'}${overdue ? ` · ${overdue} overdue` : ''}`}>
                <SquareCheckBig aria-hidden="true" />
                {acts.length}
              </span>
            )}
          </span>
        ) : undefined
      }
    />
  );
}

function NextUp({ ctx, s, now, onPick }: { ctx: PerfCtx; s: OneOnOneSeries; now: number; onPick: () => void }) {
  const u = ctx.user(partnerOf(s, ctx.me.id));
  const phase = meetingPhase(s, now);
  const left = Math.max(0, s.nextAt + s.durationMin * MIN - now);
  return (
    <Link to={`/performance/one-on-ones/${s.id}`} className="pf-11-nextup" data-phase={phase} onClick={onPick} aria-label={`Next 1:1 with ${u?.name ?? 'Unknown'}, ${dayLabel(s.nextAt, now)}`}>
      <span className="neo-hud">{phase === 'live' ? '● Live now' : phase === 'overdue' ? 'Waiting to be wrapped up' : 'Next up'}</span>
      <span className="pf-11-nextup__count neo-num">{phase === 'live' ? `${countdown(left)} left` : phase === 'overdue' ? 'Wrap up' : `in ${countdown(s.nextAt - now)}`}</span>
      <span className="pf-11-nextup__row">
        {u && <Avatar user={u} size={22} />}
        <span className="truncate">
          <b>{u?.name.split(' ')[0] ?? 'Unknown'}</b> · {dayLabel(s.nextAt, now)}
        </span>
      </span>
    </Link>
  );
}

/* ═════════════════════ New 1:1 ═════════════════════ */

export function NewSeriesModal({ open, onClose, ctx, partnerId, now }: { open: boolean; onClose: () => void; ctx: PerfCtx; partnerId?: string; now: number }) {
  const navigate = useNavigate();
  const series = usePerf((s) => s.series);
  const me = ctx.me.id;
  const [partner, setPartner] = useState<string | undefined>(partnerId);
  const [kind, setKind] = useState<'manager' | 'mentor'>('manager');
  const [cadence, setCadence] = useState<Cadence>('biweekly');
  const [when, setWhen] = useState(() => toLocalInput(nextSlot(now)));

  const taken = useMemo(() => new Set(series.filter((s) => s.leadId === me || s.memberId === me).map((s) => partnerOf(s, me))), [series, me]);
  const candidates = useMemo(() => ctx.people.filter((u) => u.id !== me && !taken.has(u.id)), [ctx.people, me, taken]);
  const isReport = !!partner && isManagerOf(ctx.users, me, partner);
  const pu = ctx.user(partner);

  // Reset on open (a fresh form every time).
  useEffect(() => {
    if (!open) return;
    setPartner(partnerId && !taken.has(partnerId) ? partnerId : undefined);
    setWhen(toLocalInput(nextSlot(Date.now())));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, partnerId]);

  // Kind follows the relationship: manager 1:1s are only for direct reports.
  useEffect(() => {
    setKind(isReport ? 'manager' : 'mentor');
    setCadence(isReport ? 'weekly' : 'biweekly');
  }, [isReport, partner]);

  const firstAt = fromLocalInput(when);
  const disabledReason = !partner ? 'Choose someone to meet with' : !Number.isFinite(firstAt) ? 'Pick a date and time' : firstAt < Date.now() - 5 * MIN ? 'Pick a time in the future' : '';
  const weekday = Number.isFinite(firstAt) ? new Date(firstAt).toLocaleDateString(undefined, { weekday: 'long' }) : '';
  const time = Number.isFinite(firstAt) ? new Date(firstAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '';

  const create = (e?: { currentTarget: HTMLElement }) => {
    if (disabledReason || !partner) return;
    const res = usePerf.getState().createSeries({ partnerId: partner, kind, cadence, firstAt });
    if (!report(res, `1:1 with ${pu?.name.split(' ')[0] ?? 'them'} set up · first on ${dayLabel(firstAt, Date.now())}`)) return;
    if (e) {
      const r = e.currentTarget.getBoundingClientRect();
      burstConfetti({ x: r.left + r.width / 2, y: r.top });
    }
    onClose();
    if (res.ok) navigate(`/performance/one-on-ones/${res.id}`);
  };

  const quick = [
    { label: 'Tomorrow 10:00', at: nextSlot(Date.now(), 10) },
    { label: 'Next Monday', at: nextMonday(Date.now(), 10) },
    { label: 'In 2 weeks', at: nextSlot(Date.now() + 13 * DAY, 10) },
  ];

  return (
    <PfModal
      open={open}
      onClose={onClose}
      width={560}
      className="pf-11-modal"
      icon={<CalendarPlus />}
      title="New 1:1"
      subtitle="A recurring space with a shared agenda, notes and action items."
      footer={
        <>
          <span className="pf-11-foot-meta">{pu ? `${pu.name.split(' ')[0]} gets a notification with the details.` : 'Only the two of you see the agenda and notes.'}</span>
          <button type="button" className="neo-btn neo-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="neo-btn neo-btn--plasma" onClick={(e) => create(e)} disabled={!!disabledReason} title={disabledReason || 'Create the 1:1'} data-qa="oo-create">
            <CalendarPlus /> Create 1:1
          </button>
        </>
      }
    >
      <div className="pf-11-form">
        <div className="neo-field">
          <span className="neo-label">Meet with</span>
          <PeoplePicker
            value={partner ? [partner] : []}
            onChange={(ids) => setPartner(ids[0])}
            users={candidates}
            label="Who is this 1:1 with?"
            trigger={(p) => (
              <button {...p} type="button" className="pf-11-pick" data-qa="oo-partner" aria-label={pu ? `Partner: ${pu.name}` : 'Choose a person'}>
                {pu ? (
                  <Avatar user={pu} size={34} presence />
                ) : (
                  <span className="pf-11-pick__ghost" aria-hidden="true">
                    <UserPlus />
                  </span>
                )}
                <span className="pf-11-pick__text">
                  <b>{pu ? pu.name : 'Choose a person'}</b>
                  <small>{pu ? `${pu.title}${isReport ? ' · your report' : ''}` : `${candidates.length} people without a 1:1 with you`}</small>
                </span>
                <ChevronDown aria-hidden="true" />
              </button>
            )}
          />
        </div>

        <div className="pf-11-row">
          <div className="neo-field">
            <span className="neo-label">Kind</span>
            {isReport ? (
              <Seg
                value={kind}
                onChange={setKind}
                label="Kind of 1:1"
                options={[
                  { value: 'manager', label: 'Manager 1:1' },
                  { value: 'mentor', label: 'Mentoring' },
                ]}
              />
            ) : (
              <span className="pf-row">
                <Chip tone="violet" icon={<GraduationCap />}>
                  Mentoring
                </Chip>
                <span className="pf-faint text-xs">Manager 1:1s are for your direct reports.</span>
              </span>
            )}
          </div>
          <div className="neo-field">
            <span className="neo-label">Cadence</span>
            <Seg value={cadence} onChange={setCadence} label="Cadence" size="sm" options={CADENCE_OPTIONS} />
          </div>
        </div>

        <div className="neo-field">
          <label className="neo-label" htmlFor="oo-first">
            First meeting
          </label>
          <input id="oo-first" type="datetime-local" className="neo-input" value={when} min={toLocalInput(Date.now())} onChange={(e) => setWhen(e.target.value)} />
          <div className="pf-11-quick">
            {quick.map((q) => (
              <Chip key={q.label} size="sm" tone={toLocalInput(q.at) === when ? 'app' : 'slate'} pressed={toLocalInput(q.at) === when} onClick={() => setWhen(toLocalInput(q.at))}>
                {q.label}
              </Chip>
            ))}
          </div>
        </div>

        {pu && Number.isFinite(firstAt) && (
          <div className="pf-11-preview">
            <CalendarClock aria-hidden="true" />
            <span>
              {kind === 'mentor' ? 'Mentoring with' : '1:1 with'} <b>{pu.name.split(' ')[0]}</b> · {CADENCE_LABEL[cadence].toLowerCase()} on {weekday}s at {time} · 30 min. First on {dayLabel(firstAt, now)}.
            </span>
          </div>
        )}
      </div>
    </PfModal>
  );
}
