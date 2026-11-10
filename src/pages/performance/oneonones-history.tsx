/**
 * 1:1s — meeting history timeline (past notes, agenda coverage, moods and the
 * action items from each period) and the wrap-up dialog that completes a meeting.
 */
import { useMemo, useState, type MouseEvent } from 'react';
import { ArrowRight, CircleCheck, CircleDashed, History, ListChecks, NotebookPen, PartyPopper, Repeat, SquareCheckBig } from 'lucide-react';
import { NeoEmpty, NeoPanel } from '@/components/neo';
import { burstConfetti } from '@/lib/confetti';
import { cx } from '@/lib/cx';
import { relativeTime } from '@/lib/format';
import { usePerf } from '@/performance/store';
import type { OneOnOneSeries } from '@/performance/types';
import { toast } from '@/store/toast';
import { dayLabel, shortDate, type PerfCtx } from './hooks';
import { PfModal } from './ui';
import { CADENCE_DAYS, DAY, moodMeta, partnerOf } from './oneonones-shared';

const HOUR = 3_600_000;

/* ═════════════════════ Timeline ═════════════════════ */

export function HistoryPanel({ ctx, s, now }: { ctx: PerfCtx; s: OneOnOneSeries; now: number }) {
  const [open, setOpen] = useState<string | null>(s.meetings[0]?.id ?? null);
  const [all, setAll] = useState(false);
  const list = all ? s.meetings : s.meetings.slice(0, 4);
  const people = [s.leadId, s.memberId];

  // Action items "from" each meeting: created after the previous one, up to ~12h after this one.
  const actionsByMeeting = useMemo(() => {
    const map = new Map<string, OneOnOneSeries['actionItems']>();
    s.meetings.forEach((m, i) => {
      const from = s.meetings[i + 1]?.at ?? -Infinity;
      map.set(
        m.id,
        s.actionItems.filter((a) => a.createdAt > from && a.createdAt <= m.at + 12 * HOUR),
      );
    });
    return map;
  }, [s.meetings, s.actionItems]);

  return (
    <NeoPanel
      hud="Timeline"
      title="Past meetings"
      icon={<History />}
      className="pf-11-history"
      actions={s.meetings.length ? <span className="neo-count">{s.meetings.length}</span> : undefined}
    >
      {s.meetings.length ? (
        <ol className="pf-11-tl">
          {list.map((m) => {
            const isOpen = open === m.id;
            const covered = m.agenda.filter((a) => a.done).length;
            const acts = actionsByMeeting.get(m.id) ?? [];
            return (
              <li key={m.id} className={cx('pf-11-tl__item', isOpen && 'is-open')}>
                <span className="pf-11-tl__node" aria-hidden="true" />
                <button type="button" className="pf-11-tl__head" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : m.id)}>
                  <span className="pf-11-tl__date">
                    <b>{new Date(m.at).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</b>
                    <small>{relativeTime(m.at, now)}</small>
                  </span>
                  <span className="pf-11-tl__moods">
                    {people.map((id) => {
                      const mm = moodMeta(m.moods[id]);
                      return (
                        <span
                          key={id}
                          className={cx('pf-11-mooddot', !mm && 'is-empty')}
                          data-tone={mm?.tone}
                          title={`${id === ctx.me.id ? 'You' : ctx.first(id)}: ${mm ? `${mm.label} (${mm.value}/5)` : 'no check-in'}`}
                        >
                          {mm ? mm.icon : <CircleDashed aria-hidden="true" />}
                        </span>
                      );
                    })}
                  </span>
                  {m.agenda.length > 0 && (
                    <span className="pf-11-tl__cov neo-mono" title={`${covered} of ${m.agenda.length} talking points covered`}>
                      {covered}/{m.agenda.length}
                    </span>
                  )}
                  <ArrowRight className="pf-11-tl__chev" aria-hidden="true" style={{ rotate: isOpen ? '90deg' : undefined }} />
                </button>
                {!isOpen && m.notes && <p className="pf-11-tl__excerpt pf-clamp-2">{m.notes}</p>}
                {isOpen && (
                  <div className="pf-11-tl__body">
                    <div className="pf-11-tl__sub">Shared notes</div>
                    {m.notes ? <p className="pf-11-tl__notes">{m.notes}</p> : <p className="pf-faint text-sm">No shared notes were taken.</p>}
                    {m.agenda.length > 0 && (
                      <>
                        <div className="pf-11-tl__sub">Agenda</div>
                        <ul className="pf-11-tl__list">
                          {m.agenda.map((a, j) => (
                            <li key={j} className={a.done ? 'is-done' : undefined}>
                              {a.done ? <CircleCheck aria-label="Covered" /> : <Repeat aria-label="Carried over" />}
                              <span>{a.text}</span>
                              <small>{a.byId === ctx.me.id ? 'You' : ctx.first(a.byId)}</small>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                    {acts.length > 0 && (
                      <>
                        <div className="pf-11-tl__sub">Action items</div>
                        <ul className="pf-11-tl__list">
                          {acts.map((a) => (
                            <li key={a.id} className={a.done ? 'is-done' : undefined}>
                              {a.done ? <CircleCheck aria-label="Done" /> : <SquareCheckBig aria-label="Open" />}
                              <span>{a.text}</span>
                              <small>
                                {a.ownerId === ctx.me.id ? 'You' : ctx.first(a.ownerId)}
                                {a.done && a.doneAt ? ` · done ${shortDate(a.doneAt)}` : a.dueAt ? ` · due ${shortDate(a.dueAt)}` : ''}
                              </small>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      ) : (
        <NeoEmpty compact icon={<History />} title="No meetings yet">
          Complete your first meeting — its notes, agenda and moods land here.
        </NeoEmpty>
      )}
      {s.meetings.length > 4 && (
        <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs neo-btn--block" onClick={() => setAll((v) => !v)}>
          {all ? 'Show recent only' : `Show all ${s.meetings.length} meetings`}
        </button>
      )}
    </NeoPanel>
  );
}

/* ═════════════════════ Wrap-up ═════════════════════ */

export function WrapUpModal({ ctx, s, open, onClose, onCompleted }: { ctx: PerfCtx; s: OneOnOneSeries; open: boolean; onClose: () => void; onCompleted: (r: { carried: number; next: number }) => void }) {
  const partner = ctx.first(partnerOf(s, ctx.me.id));
  const covered = s.agenda.filter((a) => a.done);
  const carried = s.agenda.filter((a) => !a.done);
  const openActs = s.actionItems.filter((a) => !a.done);
  const blocked = !s.agenda.length && !s.sharedNotes.trim();

  const now = Date.now();
  const cadenceMs = CADENCE_DAYS[s.cadence] * DAY;
  let next = s.nextAt + cadenceMs;
  while (next < now + HOUR) next += cadenceMs;

  const complete = (e: MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const res = usePerf.getState().completeMeeting(s.id);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    burstConfetti({ x: rect.left + rect.width / 2, y: rect.top });
    toast.success('Meeting completed', res.carried ? `${res.carried} talking point${res.carried === 1 ? '' : 's'} carried over to next time` : 'Clean sweep — every talking point covered');
    onCompleted({ carried: res.carried, next: usePerf.getState().series.find((x) => x.id === s.id)?.nextAt ?? next });
    onClose();
  };

  return (
    <PfModal
      open={open}
      onClose={onClose}
      width={560}
      className="pf-11-modal"
      icon={<PartyPopper />}
      title={`Wrap up your 1:1 with ${partner}`}
      subtitle="Notes and agenda move to the timeline; open talking points carry over."
      footer={
        <>
          <span className="pf-11-foot-meta">Next: {dayLabel(next, now)}</span>
          <button type="button" className="neo-btn neo-btn--ghost" onClick={onClose}>
            Keep going
          </button>
          <button type="button" className="neo-btn neo-btn--plasma" onClick={complete} disabled={blocked} title={blocked ? 'Add a talking point or notes before completing the meeting' : 'Complete the meeting'} data-qa="oo-complete-confirm">
            <PartyPopper /> Complete meeting
          </button>
        </>
      }
    >
      <div className="pf-11-wrap">
        <div className="pf-11-wrap__stats">
          <div className="pf-11-wrap__stat">
            <b>
              {covered.length}/{s.agenda.length}
            </b>
            <span>Talking points covered</span>
          </div>
          <div className="pf-11-wrap__stat">
            <b>{carried.length}</b>
            <span>Carry over</span>
          </div>
          <div className="pf-11-wrap__stat">
            <b>{openActs.length}</b>
            <span>Open action items</span>
          </div>
        </div>
        {blocked && (
          <NeoEmpty compact icon={<ListChecks />} title="Nothing to wrap up yet">
            Add a talking point or a few shared notes first.
          </NeoEmpty>
        )}
        {carried.length > 0 && (
          <div className="neo-field">
            <span className="neo-label">Carries over to {dayLabel(next, now)}</span>
            <ul className="pf-11-wrap__list">
              {carried.map((a) => (
                <li key={a.id}>
                  <Repeat aria-hidden="true" />
                  <span>{a.text}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {s.sharedNotes.trim() ? (
          <div className="neo-field">
            <span className="neo-label">Shared notes saved to the timeline</span>
            <p className="pf-11-wrap__notes">{s.sharedNotes.trim()}</p>
          </div>
        ) : (
          !blocked && (
            <p className="pf-11-preview">
              <NotebookPen aria-hidden="true" />
              <span>No shared notes this time — {partner} still gets the agenda summary.</span>
            </p>
          )
        )}
      </div>
    </PfModal>
  );
}
