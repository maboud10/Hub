/**
 * Talent Hub · Interviews — the interviewer's cockpit: feedback that's due
 * first, a "next up" briefing, the agenda grouped by day (or a week
 * calendar) and past interviews with independent, colour-coded
 * recommendations. Scope: interviews on requisitions the viewer can see,
 * plus any interview they sit on.
 */
import { useMemo, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router';
import {
  CalendarClock,
  CalendarDays,
  CalendarX2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleCheckBig,
  ClipboardPen,
  Columns3,
  History,
  Hourglass,
  LayoutList,
  MousePointerClick,
  Radio,
  SquareKanban,
  UserX,
  Video,
  X,
} from 'lucide-react';
import type { Interview, InterviewKind, Scorecard } from '@/talent/types';
import { INTERVIEW_KIND_META } from '@/talent/constants';
import { useTalent } from '@/talent/store';
import { useTalentUI } from '@/talent/ui';
import { useTalentLookups, useTalentScope, useTalentViewer } from '@/talent/selectors';
import { useNow } from '@/hooks/useNow';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { toast } from '@/store/toast';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, Segmented } from '@/components/ui/primitives';
import { cx } from '@/lib/cx';
import { HeadActions } from './components/head';
import { CandidateAvatar, PeopleStack, SampleTag } from './components/shared';
import { KindTile, LocationLine } from './interviews/bits';
import { InterviewItem, type InterviewConfirm } from './interviews/InterviewItem';
import { WeekView } from './interviews/WeekView';
import {
  addDays,
  competenciesFor,
  DAY,
  dayLabel,
  fmtDate,
  fmtTime,
  hasEnded,
  isLive,
  isOpenStatus,
  ivEnd,
  KIND_HUE,
  parseLocation,
  relTime,
  startOfDay,
  startOfWeek,
} from './interviews/utils';

type View = 'agenda' | 'week';
type Who = 'all' | 'mine';
const EMPTY: Scorecard[] = [];

export function InterviewsTab() {
  const viewer = useTalentViewer();
  const me = viewer?.userId ?? '';
  const scope = useTalentScope();
  const interviews = useTalent((s) => s.interviews);
  const scorecards = useTalent((s) => s.scorecards);
  const updateInterview = useTalent((s) => s.updateInterview);
  const { reqById, candById, appById } = useTalentLookups();
  const now = useNow(30_000);
  const isMobile = useIsMobile();
  const navigate = useNavigate();

  const [view, setView] = useState<View>('agenda');
  const [who, setWho] = useState<Who>('all');
  const [reqFilter, setReqFilter] = useState('');
  const [kindFilter, setKindFilter] = useState<InterviewKind | ''>('');
  const [pastOpen, setPastOpen] = useState(false);
  const [pastLimit, setPastLimit] = useState(12);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(Date.now()));
  const [selected, setSelected] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ iv: Interview; action: InterviewConfirm } | null>(null);
  const [lastConfirm, setLastConfirm] = useState<{ iv: Interview; action: InterviewConfirm } | null>(null);

  const cardsByIv = useMemo(() => {
    const m = new Map<string, Scorecard[]>();
    for (const s of scorecards) m.set(s.interviewId, [...(m.get(s.interviewId) ?? []), s]);
    return m;
  }, [scorecards]);
  const cardsOf = (id: string) => cardsByIv.get(id) ?? EMPTY;

  const visible = useMemo(() => interviews.filter((iv) => scope.reqIds.has(iv.requisitionId) || iv.interviewerIds.includes(me)), [interviews, scope.reqIds, me]);

  const feedbackDue = useMemo(
    () =>
      visible
        .filter(
          (iv) =>
            iv.interviewerIds.includes(me) &&
            isOpenStatus(iv) &&
            hasEnded(iv, now) &&
            appById.get(iv.applicationId)?.status === 'active' &&
            !(cardsByIv.get(iv.id) ?? EMPTY).some((s) => s.interviewerId === me),
        )
        .sort((a, b) => ivEnd(a) - ivEnd(b)),
    [visible, me, now, appById, cardsByIv],
  );

  const byFilters = useMemo(() => visible.filter((iv) => (!reqFilter || iv.requisitionId === reqFilter) && (!kindFilter || iv.kind === kindFilter)), [visible, reqFilter, kindFilter]);
  const filtered = useMemo(() => (who === 'mine' ? byFilters.filter((iv) => iv.interviewerIds.includes(me)) : byFilters), [byFilters, who, me]);
  const upcoming = useMemo(() => filtered.filter((iv) => !hasEnded(iv, now)).sort((a, b) => a.scheduledAt - b.scheduledAt), [filtered, now]);
  const past = useMemo(() => filtered.filter((iv) => hasEnded(iv, now)).sort((a, b) => b.scheduledAt - a.scheduledAt), [filtered, now]);
  const counts = useMemo(() => {
    const up = byFilters.filter((iv) => !hasEnded(iv, now) && iv.status !== 'cancelled');
    return { all: up.length, mine: up.filter((iv) => iv.interviewerIds.includes(me)).length };
  }, [byFilters, now, me]);

  const groups = useMemo(() => {
    const m = new Map<number, Interview[]>();
    for (const iv of upcoming) {
      const k = startOfDay(iv.scheduledAt);
      m.set(k, [...(m.get(k) ?? []), iv]);
    }
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [upcoming]);

  const stats = useMemo(() => {
    const open = visible.filter(isOpenStatus);
    const today = startOfDay(now);
    return {
      today: open.filter((iv) => startOfDay(iv.scheduledAt) === today && !hasEnded(iv, now)).length,
      week: open.filter((iv) => iv.scheduledAt >= now - 60 * 60_000 && iv.scheduledAt < now + 7 * DAY).length,
      awaiting: open.filter((iv) => hasEnded(iv, now) && appById.get(iv.applicationId)?.status === 'active' && (cardsByIv.get(iv.id) ?? EMPTY).length < iv.interviewerIds.length).length,
      live: open.filter((iv) => isLive(iv, now)).length,
    };
  }, [visible, now, appById, cardsByIv]);

  const nextUp = useMemo(() => {
    const open = visible.filter((iv) => isOpenStatus(iv) && !hasEnded(iv, now)).sort((a, b) => a.scheduledAt - b.scheduledAt);
    const mine = open.find((iv) => iv.interviewerIds.includes(me));
    return mine ? { iv: mine, mine: true } : open[0] ? { iv: open[0], mine: false } : null;
  }, [visible, now, me]);

  const reqOptions = useMemo(
    () =>
      [...new Set(visible.map((iv) => iv.requisitionId))]
        .map((id) => reqById.get(id))
        .filter((r): r is NonNullable<typeof r> => !!r)
        .sort((a, b) => a.title.localeCompare(b.title)),
    [visible, reqById],
  );
  const kindOptions = useMemo(() => (Object.keys(INTERVIEW_KIND_META) as InterviewKind[]).filter((k) => visible.some((iv) => iv.kind === k)), [visible]);
  const filtersOn = !!reqFilter || !!kindFilter || who === 'mine';
  const effectiveView: View = isMobile ? 'agenda' : view;

  const openConfirm = (iv: Interview, action: InterviewConfirm) => {
    setConfirm({ iv, action });
    setLastConfirm({ iv, action });
  };
  const runConfirm = () => {
    if (!confirm) return;
    const res = updateInterview(confirm.iv.id, { status: confirm.action === 'cancel' ? 'cancelled' : 'no-show' });
    if (res.ok && confirm.action === 'no-show') toast.success('Marked as no-show', 'Rebook from the interview when the candidate is ready.');
    else toast.result(res);
    if (res.ok) setConfirm(null);
  };
  const clearFilters = () => {
    setWho('all');
    setReqFilter('');
    setKindFilter('');
  };

  const itemProps = (iv: Interview) => ({
    iv,
    now,
    viewer,
    req: reqById.get(iv.requisitionId),
    cand: candById.get(iv.candidateId),
    app: appById.get(iv.applicationId),
    cards: cardsOf(iv.id),
    onConfirm: openConfirm,
  });

  const selectedIv = selected ? filtered.find((iv) => iv.id === selected) : undefined;
  const shownConfirm = confirm ?? lastConfirm;
  const weekLabel = `${fmtDate(weekStart, { day: 'numeric', month: 'short' })} – ${fmtDate(addDays(weekStart, 6), { day: 'numeric', month: 'short', year: 'numeric' })}`;

  return (
    <div className="tl-iv">
      <HeadActions>
        <button type="button" className="neo-btn neo-btn--soft" onClick={() => navigate('/talent/pipeline')}>
          <SquareKanban /> <span className="neo-btn__label">Pipeline</span>
        </button>
        {feedbackDue.length > 0 && (
          <button type="button" className="neo-btn neo-btn--plasma" onClick={() => useTalentUI.getState().openModal({ kind: 'scorecard', interviewId: feedbackDue[0].id })}>
            <ClipboardPen /> <span className="neo-btn__label">Write scorecard</span>
          </button>
        )}
      </HeadActions>
      {/* 1 · Feedback that's waiting on me */}
      {feedbackDue.length > 0 ? (
        <section className="tl-iv-due" aria-labelledby="tl-iv-due-title">
          <div className="tl-iv-due__head">
            <span className="tl-iv-due__icon" aria-hidden="true">
              <ClipboardPen />
            </span>
            <div className="grow">
              <h2 id="tl-iv-due-title" className="tl-iv-due__title">
                Needs your feedback <span className="tl-iv-due__count">{feedbackDue.length}</span>
              </h2>
              <p className="tl-iv-due__sub">Write it while it’s fresh: scorecards submitted within 24 hours are the most accurate.</p>
            </div>
          </div>
          <ul className="tl-iv-due__list">
            {feedbackDue.map((iv, i) => {
              const cand = candById.get(iv.candidateId);
              const overdue = now - ivEnd(iv) > DAY;
              return (
                <li key={iv.id} className={cx('tl-iv-due__card', overdue && 'is-overdue')} style={{ '--i': i, '--kind-h': KIND_HUE[iv.kind] } as CSSProperties}>
                  {cand && <CandidateAvatar person={cand} size={40} />}
                  <div className="tl-iv-due__info">
                    <div className="tl-iv-due__name">
                      <span className="truncate">{cand?.name ?? 'Candidate'}</span>
                      {cand?.sample && <SampleTag />}
                    </div>
                    <div className="tl-iv-due__meta truncate">
                      {iv.title} · {reqById.get(iv.requisitionId)?.title}
                    </div>
                    <div className={cx('tl-iv-due__when', overdue && 'is-overdue')}>
                      <Hourglass aria-hidden="true" />
                      {overdue ? 'Overdue · ' : ''}ended {relTime(ivEnd(iv), now)}
                    </div>
                  </div>
                  <button type="button" className="btn btn--sm btn--primary" onClick={() => useTalentUI.getState().openModal({ kind: 'scorecard', interviewId: iv.id })}>
                    <ClipboardPen /> Write scorecard
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : (
        <div className="tl-iv-clear" role="status">
          <CircleCheckBig aria-hidden="true" />
          <span>
            <strong>All caught up.</strong> No interview feedback is waiting on you.
          </span>
        </div>
      )}

      {/* 2 · Next up + pulse */}
      <div className="tl-iv-top">
        {nextUp ? (
          <NextUp iv={nextUp.iv} mine={nextUp.mine} now={now} />
        ) : (
          <div className="tl-iv-next tl-iv-next--empty">
            <CalendarDays aria-hidden="true" />
            <div>
              <div className="tl-iv-next__eyebrow">Next up</div>
              <p className="muted text-sm">Nothing on the calendar yet. Interviews you schedule or join will show up here with a briefing.</p>
            </div>
          </div>
        )}
        <div className="tl-iv-kpis">
          <Kpi label="Today" value={stats.today} hint={stats.live ? `${stats.live} live now` : 'interviews left'} icon={stats.live ? Radio : CalendarClock} tone={stats.live ? 'live' : undefined} />
          <Kpi label="Next 7 days" value={stats.week} hint="on the calendar" icon={CalendarDays} />
          <Kpi label="Awaiting feedback" value={stats.awaiting} hint="interviews, whole team" icon={Hourglass} tone={stats.awaiting ? 'warning' : undefined} />
          <Kpi label="Your scorecards" value={feedbackDue.length} hint={feedbackDue.length ? 'due from you' : 'nothing due'} icon={ClipboardPen} tone={feedbackDue.length ? 'danger' : 'success'} />
        </div>
      </div>

      {/* 3 · Toolbar */}
      <div className="tl-iv-toolbar">
        {!isMobile && (
          <Segmented<View>
            label="View"
            value={view}
            onChange={setView}
            options={[
              { value: 'agenda', label: 'Agenda', icon: <LayoutList aria-hidden="true" /> },
              { value: 'week', label: 'Week', icon: <Columns3 aria-hidden="true" /> },
            ]}
          />
        )}
        <div className="tl-iv-toolbar__who" role="group" aria-label="Whose interviews">
          <button type="button" className={cx('chip', who === 'mine' && 'is-active')} aria-pressed={who === 'mine'} onClick={() => setWho('mine')}>
            On my panel <span className="count">{counts.mine}</span>
          </button>
          <button type="button" className={cx('chip', who === 'all' && 'is-active')} aria-pressed={who === 'all'} onClick={() => setWho('all')}>
            All <span className="count">{counts.all}</span>
          </button>
        </div>
        <div className="tl-iv-toolbar__selects">
          <select className="select" value={reqFilter} onChange={(e) => setReqFilter(e.target.value)} aria-label="Filter by requisition">
            <option value="">All requisitions</option>
            {reqOptions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title}
              </option>
            ))}
          </select>
          <select className="select" value={kindFilter} onChange={(e) => setKindFilter(e.target.value as InterviewKind | '')} aria-label="Filter by interview type">
            <option value="">All formats</option>
            {kindOptions.map((k) => (
              <option key={k} value={k}>
                {INTERVIEW_KIND_META[k].label}
              </option>
            ))}
          </select>
        </div>
        {filtersOn && (
          <button type="button" className="btn btn--sm btn--ghost" onClick={clearFilters}>
            <X /> Clear
          </button>
        )}
      </div>

      {/* 4 · Agenda / week */}
      {effectiveView === 'week' ? (
        <section className="tl-iv-weekwrap" aria-label="Week calendar">
          <div className="tl-iv-weeknav">
            <button type="button" className="icon-btn icon-btn--sm" onClick={() => setWeekStart((w) => addDays(w, -7))} aria-label="Previous week">
              <ChevronLeft />
            </button>
            <button type="button" className="icon-btn icon-btn--sm" onClick={() => setWeekStart((w) => addDays(w, 7))} aria-label="Next week">
              <ChevronRight />
            </button>
            <h2 className="tl-iv-weeknav__label">{weekLabel}</h2>
            {weekStart !== startOfWeek(now) && (
              <button type="button" className="btn btn--sm" onClick={() => setWeekStart(startOfWeek(Date.now()))}>
                This week
              </button>
            )}
            <span className="spacer" />
            <span className="tl-iv-legend" aria-hidden="true">
              <i className="tl-iv-legend__mine" /> On your panel
              <i className="tl-iv-legend__cancelled" /> Cancelled
            </span>
          </div>
          <WeekView interviews={filtered} weekStart={weekStart} now={now} me={me} selectedId={selected} onSelect={setSelected} candById={candById} />
          {selectedIv ? (
            <ol className="tl-iv-list tl-iv-list--peek" aria-label="Selected interview">
              <InterviewItem {...itemProps(selectedIv)} variant="peek" />
            </ol>
          ) : (
            <p className="tl-iv-weekhint">
              <MousePointerClick aria-hidden="true" /> Select an interview block to see the details and actions.
            </p>
          )}
        </section>
      ) : groups.length ? (
        <div className="tl-iv-agenda">
          {groups.map(([day, list]) => (
            <section key={day} className={cx('tl-iv-day', day === startOfDay(now) && 'is-today')} aria-label={`${dayLabel(day, now)} ${fmtDate(day)}`}>
              <header className="tl-iv-day__head">
                <span className="tl-iv-day__label">{dayLabel(day, now)}</span>
                <span className="tl-iv-day__date">{fmtDate(day, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                <span className="tl-iv-day__line" aria-hidden="true" />
                <span className="tl-iv-day__count">
                  {list.filter((iv) => iv.status !== 'cancelled').length} interview{list.filter((iv) => iv.status !== 'cancelled').length === 1 ? '' : 's'}
                </span>
              </header>
              <ol className="tl-iv-list">
                {list.map((iv, i) => (
                  <InterviewItem key={iv.id} {...itemProps(iv)} style={{ '--i': i } as CSSProperties} />
                ))}
              </ol>
            </section>
          ))}
        </div>
      ) : (
        <div className="card card--flat">
          <EmptyState
            icon={<CalendarClock />}
            title={filtersOn ? 'No upcoming interviews match' : 'Nothing on the calendar'}
            action={
              filtersOn ? (
                <button type="button" className="btn btn--sm" onClick={clearFilters}>
                  <X /> Clear filters
                </button>
              ) : (
                <button type="button" className="btn btn--sm" onClick={() => navigate('/talent/pipeline')}>
                  <SquareKanban /> Open the pipeline
                </button>
              )
            }
          >
            {filtersOn ? 'Try another requisition or format, or switch to all interviews.' : 'Book interviews from the pipeline: each candidate’s next-step button schedules the right one.'}
          </EmptyState>
        </div>
      )}

      {/* 5 · Past interviews */}
      <section className="tl-iv-past">
        <button type="button" className="tl-iv-past__toggle" aria-expanded={pastOpen} onClick={() => setPastOpen((o) => !o)}>
          <History aria-hidden="true" />
          <span>Past interviews</span>
          <span className="tl-iv-past__count">{past.length}</span>
          <span className="spacer" />
          <span className="tl-iv-past__hint">{pastOpen ? 'Hide' : 'Show'} recommendations</span>
          <ChevronDown className={cx('tl-iv-past__chev', pastOpen && 'is-open')} aria-hidden="true" />
        </button>
        {pastOpen &&
          (past.length ? (
            <>
              <ol className="tl-iv-list tl-iv-list--past">
                {past.slice(0, pastLimit).map((iv) => (
                  <InterviewItem key={iv.id} {...itemProps(iv)} variant="past" />
                ))}
              </ol>
              {past.length > pastLimit && (
                <button type="button" className="btn btn--sm btn--ghost tl-iv-past__more" onClick={() => setPastLimit((n) => n + 20)}>
                  Show {Math.min(20, past.length - pastLimit)} more
                </button>
              )}
            </>
          ) : (
            <p className="muted text-sm tl-iv-past__empty">No past interviews match these filters.</p>
          ))}
      </section>

      {shownConfirm && (
        <Modal
          open={!!confirm}
          onClose={() => setConfirm(null)}
          width={480}
          title={shownConfirm.action === 'cancel' ? 'Cancel this interview?' : 'Mark as a no-show?'}
          subtitle={shownConfirm.action === 'cancel' ? 'The panel is notified and the slot is freed up.' : 'Recorded on the candidate’s timeline. You can rebook in one click.'}
          icon={<span className="modal-icon">{shownConfirm.action === 'cancel' ? <CalendarX2 /> : <UserX />}</span>}
          footer={
            <>
              <button type="button" className="btn btn--ghost" onClick={() => setConfirm(null)}>
                Keep it
              </button>
              <button type="button" className="btn btn--danger" onClick={runConfirm}>
                {shownConfirm.action === 'cancel' ? (
                  <>
                    <CalendarX2 /> Cancel interview
                  </>
                ) : (
                  <>
                    <UserX /> Mark no-show
                  </>
                )}
              </button>
            </>
          }
        >
          <ConfirmSummary iv={shownConfirm.iv} />
        </Modal>
      )}
    </div>
  );
}

// ───────────────────────── pieces ─────────────────────────
function Kpi({ label, value, hint, icon: Icon, tone }: { label: string; value: number; hint: string; icon: typeof CalendarDays; tone?: 'warning' | 'danger' | 'success' | 'live' }) {
  return (
    <div className={cx('tl-iv-kpi', tone && `tl-iv-kpi--${tone}`)}>
      <span className="tl-iv-kpi__icon" aria-hidden="true">
        <Icon />
      </span>
      <span className="stat-label">{label}</span>
      <span className="tl-iv-kpi__value">{value}</span>
      <span className="tl-iv-kpi__hint">{hint}</span>
    </div>
  );
}

function NextUp({ iv, mine, now }: { iv: Interview; mine: boolean; now: number }) {
  const cand = useTalent((s) => s.candidates.find((c) => c.id === iv.candidateId));
  const req = useTalent((s) => s.requisitions.find((r) => r.id === iv.requisitionId));
  const live = isLive(iv, now);
  const focus = competenciesFor(iv, req);
  const loc = parseLocation(iv.location);
  const startsIn = relTime(iv.scheduledAt, now).replace(/^in /, '');
  return (
    <article className={cx('tl-iv-next', live && 'is-live')} style={{ '--kind-h': KIND_HUE[iv.kind] } as CSSProperties} aria-label="Next interview">
      <div className="tl-iv-next__glow" aria-hidden="true" />
      <div className="tl-iv-next__top">
        <span className="tl-iv-next__eyebrow">{live ? 'Happening now' : mine ? 'Next up for you' : 'Next on the calendar'}</span>
        <KindTile kind={iv.kind} size="sm" label />
      </div>
      <div className="tl-iv-next__count" role="status">
        {live ? (
          <>
            <span className="tl-iv-next__live">
              <i /> Live
            </span>
            <span className="tl-iv-next__big">ends {relTime(ivEnd(iv), now)}</span>
          </>
        ) : (
          <>
            <span className="tl-iv-next__label">Starts in</span>
            <span className="tl-iv-next__big">{startsIn}</span>
          </>
        )}
      </div>
      <div className="tl-iv-next__when">
        {dayLabel(iv.scheduledAt, now)} · {fmtTime(iv.scheduledAt)}–{fmtTime(ivEnd(iv))}
      </div>
      <button type="button" className="tl-iv-next__cand" onClick={() => cand && useTalentUI.getState().openCandidate(cand.id)} disabled={!cand}>
        {cand && <CandidateAvatar person={cand} size={46} />}
        <span className="grow">
          <span className="tl-iv-next__name">
            {cand?.name ?? 'Candidate'} {cand?.sample && <SampleTag />}
          </span>
          <span className="tl-iv-next__sub truncate">
            {iv.title}
            {req ? ` · ${req.title}` : ''}
          </span>
        </span>
      </button>
      <div className="tl-iv-next__focus">
        <span className="stat-label">Probe for</span>
        {focus.map((f) => (
          <span key={f} className="tl-iv-next__chip">
            {f}
          </span>
        ))}
      </div>
      <div className="tl-iv-next__foot">
        <LocationLine location={iv.location} compact />
        <span className="spacer" />
        <PeopleStack userIds={iv.interviewerIds} size={26} />
        {loc.url && (
          <a className="btn btn--sm btn--primary" href={loc.url} target="_blank" rel="noreferrer">
            <Video /> Join
          </a>
        )}
      </div>
    </article>
  );
}

function ConfirmSummary({ iv }: { iv: Interview }) {
  const cand = useTalent((s) => s.candidates.find((c) => c.id === iv.candidateId));
  return (
    <div className="tl-iv-confirm" style={{ '--kind-h': KIND_HUE[iv.kind] } as CSSProperties}>
      <KindTile kind={iv.kind} size="lg" />
      <div className="grow">
        <div className="tl-iv-confirm__title">{iv.title}</div>
        <div className="muted text-sm">
          {cand?.name ?? 'Candidate'} · {fmtDate(iv.scheduledAt)} · {fmtTime(iv.scheduledAt)}–{fmtTime(ivEnd(iv))}
        </div>
      </div>
      <PeopleStack userIds={iv.interviewerIds} size={26} />
    </div>
  );
}
