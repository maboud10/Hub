/**
 * Candidate sheet · Activity & Notes tabs.
 *  - Activity merges the talent activity log with outreach messages (and
 *    their status), interviews (upcoming first) and scorecard
 *    recommendations into one day-grouped timeline with filters.
 *  - Notes are activity entries of kind "note"; anyone on the hiring team
 *    can add one (scoped to an application for hiring managers).
 */
import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  ArrowRightLeft,
  Ban,
  Briefcase,
  CalendarClock,
  ClipboardCheck,
  Gavel,
  Handshake,
  History,
  Import,
  MessageSquareReply,
  NotebookPen,
  PartyPopper,
  Send,
  Signature,
  StickyNote,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';
import type { ActivityKind, Application, Candidate } from '@/talent/types';
import { CHANNEL_META, INTERVIEW_KIND_META, RECOMMENDATION_META } from '@/talent/constants';
import { useTalentCaps, useTalentLookups, useTalentScope } from '@/talent/selectors';
import { useTalent } from '@/talent/store';
import { toast } from '@/store/toast';
import { useNow } from '@/hooks/useNow';
import { EmptyState } from '@/components/ui/primitives';
import { relativeTime } from '@/lib/format';
import { cx } from '@/lib/cx';
import { OutreachStatusBadge, PeopleStack, PersonChip, ToneBadge, type Tone } from '../components/shared';
import { fmtWhen } from '../components/format';

type Group = 'stages' | 'outreach' | 'interviews' | 'notes';
type FeedTone = Tone | 'accent';

interface FeedItem {
  id: string;
  at: number;
  group: Group;
  icon: LucideIcon;
  tone: FeedTone;
  title: ReactNode;
  badge?: ReactNode;
  meta?: ReactNode;
  body?: ReactNode;
  actorId?: string;
  reqId?: string | null;
  future?: boolean;
}

const ACT_META: Record<ActivityKind, { group: Group; icon: LucideIcon; tone: FeedTone }> = {
  created: { group: 'stages', icon: UserPlus, tone: 'accent' },
  import: { group: 'stages', icon: Import, tone: 'info' },
  stage: { group: 'stages', icon: ArrowRightLeft, tone: 'accent' },
  outreach: { group: 'outreach', icon: Send, tone: 'info' },
  reply: { group: 'outreach', icon: MessageSquareReply, tone: 'success' },
  interview: { group: 'interviews', icon: CalendarClock, tone: 'info' },
  scorecard: { group: 'interviews', icon: ClipboardCheck, tone: 'info' },
  decision: { group: 'stages', icon: Gavel, tone: 'success' },
  offer: { group: 'stages', icon: Signature, tone: 'warning' },
  hired: { group: 'stages', icon: PartyPopper, tone: 'success' },
  rejected: { group: 'stages', icon: Ban, tone: 'danger' },
  note: { group: 'notes', icon: StickyNote, tone: 'muted' },
  handoff: { group: 'stages', icon: Handshake, tone: 'success' },
  requisition: { group: 'stages', icon: Briefcase, tone: 'muted' },
};

const FILTERS: { id: 'all' | Group; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'stages', label: 'Pipeline' },
  { id: 'outreach', label: 'Outreach' },
  { id: 'interviews', label: 'Interviews' },
  { id: 'notes', label: 'Notes' },
];

const DAY = 86_400_000;
function dayLabel(ts: number, now: number) {
  if (ts > now) return 'Upcoming';
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const diff = Math.floor((start.getTime() - ts) / DAY);
  if (ts >= start.getTime()) return 'Today';
  if (diff < 1) return 'Yesterday';
  return new Date(ts).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: new Date(ts).getFullYear() === start.getFullYear() ? undefined : 'numeric' });
}

export function SheetActivity({ cand, apps }: { cand: Candidate; apps: Application[] }) {
  const activity = useTalent((s) => s.activity);
  const outreach = useTalent((s) => s.outreach);
  const interviews = useTalent((s) => s.interviews);
  const scorecards = useTalent((s) => s.scorecards);
  const scope = useTalentScope();
  const caps = useTalentCaps();
  const { reqById, userById } = useTalentLookups();
  const now = useNow(60_000);
  const [filter, setFilter] = useState<'all' | Group>('all');

  const items = useMemo(() => {
    const appIds = new Set(apps.map((a) => a.id));
    const visibleReq = (reqId?: string | null) => caps.manage || !reqId || scope.reqIds.has(reqId);
    const list: FeedItem[] = [];
    for (const a of activity) {
      if (a.candidateId !== cand.id || !visibleReq(a.requisitionId)) continue;
      if (a.kind === 'outreach' || a.kind === 'scorecard') continue; // shown as richer items below
      const m = ACT_META[a.kind];
      list.push({ id: a.id, at: a.at, group: m.group, icon: m.icon, tone: m.tone, title: a.text, actorId: a.actorId, reqId: a.requisitionId });
    }
    for (const o of outreach) {
      if (o.candidateId !== cand.id || !visibleReq(o.requisitionId)) continue;
      list.push({
        id: o.id,
        at: o.sentAt ?? o.createdAt,
        group: 'outreach',
        icon: o.status === 'interested' || o.status === 'replied' ? MessageSquareReply : Send,
        tone: o.status === 'interested' ? 'success' : o.status === 'not-interested' ? 'danger' : o.status === 'no-response' ? 'warning' : 'info',
        title: `${CHANNEL_META[o.channel].short}${o.step > 1 ? ` · follow-up #${o.step - 1}` : ''}`,
        badge: <OutreachStatusBadge status={o.status} />,
        body: (
          <details className="tl-sheet-msg">
            <summary>{o.subject ? <b>{o.subject} · </b> : null}{o.body.slice(0, 110)}{o.body.length > 110 ? '…' : ''}</summary>
            <p>{o.body}</p>
          </details>
        ),
        actorId: o.createdBy,
        reqId: o.requisitionId,
      });
    }
    for (const iv of interviews) {
      if (!appIds.has(iv.applicationId)) continue;
      const future = iv.status !== 'cancelled' && iv.scheduledAt > now;
      list.push({
        id: iv.id,
        at: iv.scheduledAt,
        group: 'interviews',
        icon: INTERVIEW_KIND_META[iv.kind].icon,
        tone: iv.status === 'cancelled' ? 'muted' : future ? 'info' : 'accent',
        title: iv.title,
        badge:
          iv.status === 'cancelled' ? (
            <ToneBadge tone="muted">Cancelled</ToneBadge>
          ) : future ? (
            <ToneBadge tone="info">Upcoming</ToneBadge>
          ) : iv.status === 'no-show' ? (
            <ToneBadge tone="danger">No-show</ToneBadge>
          ) : (
            <ToneBadge tone="success">Held</ToneBadge>
          ),
        meta: (
          <>
            {fmtWhen(iv.scheduledAt)} · {iv.durationMins} min · {iv.location}
            <PeopleStack userIds={iv.interviewerIds} size={18} max={4} />
          </>
        ),
        reqId: iv.requisitionId,
        future,
      });
    }
    for (const sc of scorecards) {
      if (!appIds.has(sc.applicationId)) continue;
      const iv = interviews.find((i) => i.id === sc.interviewId);
      const rec = RECOMMENDATION_META[sc.recommendation];
      list.push({
        id: sc.id,
        at: sc.submittedAt,
        group: 'interviews',
        icon: ClipboardCheck,
        tone: rec.tone,
        title: `${userById.get(sc.interviewerId)?.name.split(' ')[0] ?? 'Panelist'} scored ${iv?.title ?? 'the interview'}`,
        badge: <ToneBadge tone={rec.tone}>{rec.label}</ToneBadge>,
        body: sc.notes ? <p className="tl-sheet-feed__quote">“{sc.notes}”</p> : undefined,
        actorId: sc.interviewerId,
        reqId: iv?.requisitionId,
      });
    }
    return list.sort((a, b) => b.at - a.at);
  }, [activity, outreach, interviews, scorecards, apps, cand.id, caps.manage, scope.reqIds, userById, now]);

  const counts = useMemo(() => {
    const m = new Map<string, number>([['all', items.length]]);
    for (const it of items) m.set(it.group, (m.get(it.group) ?? 0) + 1);
    return m;
  }, [items]);

  const groups = useMemo(() => {
    const shown = filter === 'all' ? items : items.filter((i) => i.group === filter);
    const out: { label: string; items: FeedItem[] }[] = [];
    for (const it of shown) {
      const label = dayLabel(it.at, now);
      const last = out[out.length - 1];
      if (last?.label === label) last.items.push(it);
      else out.push({ label, items: [it] });
    }
    return out;
  }, [items, filter, now]);

  return (
    <div className="tl-sheet-stack">
      <div className="chips tl-sheet-filter" role="group" aria-label="Filter activity">
        {FILTERS.map((f) => (
          <button key={f.id} type="button" className={cx('chip', filter === f.id && 'is-active')} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
            {f.label}
            <span className="count">{counts.get(f.id) ?? 0}</span>
          </button>
        ))}
      </div>
      {!groups.length ? (
        <EmptyState icon={<History />} title="Nothing here yet">
          Outreach, interviews, feedback and stage moves for {cand.name.split(' ')[0]} will appear here.
        </EmptyState>
      ) : (
        <ol className="tl-sheet-feed">
          {groups.map((g) => (
            <li key={g.label} className="tl-sheet-feed__day">
              <div className={cx('tl-sheet-feed__daylabel', g.label === 'Upcoming' && 'is-upcoming')}>{g.label}</div>
              <ol>
                {g.items.map((it) => {
                  const Icon = it.icon;
                  const req = it.reqId ? reqById.get(it.reqId) : undefined;
                  return (
                    <li key={it.id} className={cx('tl-sheet-feed__item', `is-${it.tone}`, it.future && 'is-future')}>
                      <span className="tl-sheet-feed__icon" aria-hidden="true">
                        <Icon />
                      </span>
                      <div className="tl-sheet-feed__body">
                        <div className="tl-sheet-feed__title">
                          <span>{it.title}</span>
                          {it.badge}
                        </div>
                        {it.meta && <div className="tl-sheet-feed__meta">{it.meta}</div>}
                        {it.body}
                        <div className="tl-sheet-feed__foot">
                          {it.actorId && userById.has(it.actorId) && <PersonChip userId={it.actorId} size={18} />}
                          <time dateTime={new Date(it.at).toISOString()} title={fmtWhen(it.at)}>
                            {it.future ? fmtWhen(it.at) : relativeTime(it.at, now)}
                          </time>
                          {req && <span className="tl-sheet-feed__req">{req.title}</span>}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function SheetNotes({ cand, apps }: { cand: Candidate; apps: Application[] }) {
  const activity = useTalent((s) => s.activity);
  const addNote = useTalent((s) => s.addNote);
  const caps = useTalentCaps();
  const scope = useTalentScope();
  const { reqById } = useTalentLookups();
  const now = useNow(60_000);
  const live = apps.filter((a) => a.status === 'active' || a.status === 'hired');
  const [text, setText] = useState('');
  const [about, setAbout] = useState<string>(caps.manage ? '' : (live[0]?.id ?? apps[0]?.id ?? ''));
  const first = cand.name.split(' ')[0];

  const notes = useMemo(
    () => activity.filter((a) => a.kind === 'note' && a.candidateId === cand.id && (caps.manage || !a.requisitionId || scope.reqIds.has(a.requisitionId))),
    [activity, cand.id, caps.manage, scope.reqIds],
  );
  const canWrite = caps.manage || apps.length > 0;

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (text.trim().length < 3) return;
    if (toast.result(addNote(cand.id, text, about || undefined))) setText('');
  };

  return (
    <div className="tl-sheet-stack">
      {canWrite ? (
        <form className="tl-sheet-compose" onSubmit={submit}>
          <label className="sr-only" htmlFor={`tl-note-${cand.id}`}>
            Add a note about {cand.name}
          </label>
          <textarea
            id={`tl-note-${cand.id}`}
            className="textarea"
            rows={3}
            maxLength={1000}
            value={text}
            placeholder={`What should the hiring team know about ${first}? Context, impressions, logistics…`}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit();
            }}
          />
          <div className="tl-sheet-compose__bar">
            {apps.length > 0 && (
              <select className="select tl-sheet-compose__about" value={about} onChange={(e) => setAbout(e.target.value)} aria-label="This note is about">
                {caps.manage && <option value="">General note</option>}
                {apps.map((a) => (
                  <option key={a.id} value={a.id}>
                    {reqById.get(a.requisitionId)?.title ?? 'Application'}
                  </option>
                ))}
              </select>
            )}
            <span className="field-hint tl-sheet-compose__count">{text.length}/1000 · Ctrl/⌘ + Enter</span>
            <button type="submit" className="btn btn--primary btn--sm" disabled={text.trim().length < 3}>
              <NotebookPen aria-hidden="true" /> Add note
            </button>
          </div>
        </form>
      ) : (
        <p className="tl-sheet-hint">Only the hiring team can add notes.</p>
      )}
      {notes.length ? (
        <ul className="tl-sheet-notes">
          {notes.map((n) => (
            <li key={n.id} className="tl-sheet-notes__item">
              <div className="tl-sheet-notes__head">
                <PersonChip userId={n.actorId} size={20} label={undefined} />
                <time dateTime={new Date(n.at).toISOString()} title={fmtWhen(n.at)}>
                  {relativeTime(n.at, now)}
                </time>
                {n.requisitionId && reqById.get(n.requisitionId) && <span className="tl-sheet-feed__req">{reqById.get(n.requisitionId)?.title}</span>}
              </div>
              <p>{n.text}</p>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={<StickyNote />} title="No notes yet">
          Capture context once, so nobody asks {first} the same question twice.
        </EmptyState>
      )}
    </div>
  );
}
