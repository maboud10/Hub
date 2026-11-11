/**
 * Helix Mail — Later: snoozed wake-up timeline, scheduled sends with live
 * countdowns (edit / cancel / send now), the follow-up radar with Nova nudge
 * drafts, reminders and saved drafts.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { AlarmClock, BellRing, CalendarClock, Check, FileText, Moon, PenSquare, Plus, Radar, Send, Sunrise, Trash2, Undo2, Wand2, X, Globe2, Clock3 } from 'lucide-react';
import { Avatars, Chip, NeoEmpty, NeoKpi, NeoKpis, NeoPanel, Ring, type Tone } from '@/components/neo';
import { useNow } from '@/hooks/useNow';
import { toast } from '@/store/toast';
import { HOUR, arDays, atLocal, followUpRadar, isSnoozed, nextMondayAt, nudgeDraft } from '@/mail/engine';
import { AR_PERSON_NAMES } from '@/lib/i18n';
import { useMail } from '@/mail/store';
import type { ScheduleReason } from '@/mail/types';
import { FirstNames, firstOf, useFmt, useMailCtx, ContactAvatar } from './parts';
import { openComposer, useMailUi } from './ui';

export const REASON_META: Record<ScheduleReason, { label: string; tone: Tone; icon: ReactNode }> = {
  'quiet-hours': { label: 'Respects quiet hours', tone: 'violet', icon: <Moon /> },
  'recipient-online': { label: 'When they’re online', tone: 'cyan', icon: <Globe2 /> },
  tomorrow: { label: 'Tomorrow morning', tone: 'amber', icon: <Sunrise /> },
  monday: { label: 'Monday morning', tone: 'amber', icon: <CalendarClock /> },
  manual: { label: 'Custom time', tone: 'slate', icon: <Clock3 /> },
};

export function LaterView() {
  const ctx = useMailCtx();
  const fmt = useFmt();
  const navigate = useNavigate();
  const now = useNow(1_000);
  const ownerId = useMail((s) => s.ownerId);
  const threads = useMail((s) => s.threads);
  const scheduled = useMail((s) => s.scheduled);
  const reminders = useMail((s) => s.reminders);
  const drafts = useMail((s) => s.drafts);
  const { unsnooze, cancelScheduled, sendScheduledNow, toggleFollowUp, addReminder, toggleReminder, removeReminder, discardDraft } = useMail.getState();
  const [text, setText] = useState('');
  const [due, setDue] = useState<number>(() => atLocal(Date.now(), 1, 9));

  const snoozed = useMemo(() => threads.filter((t) => isSnoozed(t, now)).sort((a, b) => (a.snoozedUntil ?? 0) - (b.snoozedUntil ?? 0)), [threads, now]);
  const queue = useMemo(() => scheduled.filter((s) => s.status === 'scheduled').sort((a, b) => a.sendAt - b.sendAt), [scheduled]);
  const radar = useMemo(() => followUpRadar(threads, ownerId, now), [threads, ownerId, now]);
  const dueRadar = radar.filter((f) => f.due);
  const openReminders = reminders.filter((r) => !r.done);
  const presets: { id: string; label: string; at: number }[] = [
    { id: 'hour', label: 'In 1 hour', at: Math.ceil((now + HOUR) / (15 * 60_000)) * 15 * 60_000 },
    { id: 'tomorrow', label: 'Tomorrow 09:00', at: atLocal(now, 1, 9) },
    { id: 'monday', label: 'Monday 09:00', at: nextMondayAt(now, 9) },
  ];

  const nudge = (f: (typeof radar)[number]) => {
    const c = ctx.resolve(f.to[0] ?? '');
    const ar = fmt.locale === 'ar';
    const first = c.hub ? firstOf(c.name) : c.name.split(' ')[0];
    const meFirst = firstOf(ctx.me?.name ?? '');
    const d = nudgeDraft({
      first: ar ? (AR_PERSON_NAMES[first] ?? first) : first,
      subject: f.thread.subject,
      days: Math.max(1, f.days),
      meFirst: ar ? (AR_PERSON_NAMES[meFirst] ?? meFirst) : meFirst,
      locale: fmt.locale,
    });
    openComposer({ mode: 'reply', threadId: f.thread.id, to: f.to, subject: d.subject, body: d.body });
  };

  return (
    <div className="ml-view ml-later">
      <NeoKpis label="Later at a glance">
        <NeoKpi label="Snoozed" value={fmt.num(snoozed.length)} icon={<AlarmClock />} sub={snoozed[0] ? <span>{fmt.dayTime(snoozed[0].snoozedUntil ?? now)}</span> : <span>Nothing snoozed</span>} />
        <NeoKpi label="Scheduled" value={fmt.num(queue.length)} icon={<CalendarClock />} sub={queue[0] ? <span>{fmt.dayTime(queue[0].sendAt)}</span> : <span>Outbox empty</span>} />
        <NeoKpi label="Awaiting replies" value={fmt.num(radar.length)} icon={<Radar />} tone={dueRadar.length ? 'warning' : undefined} sub={<><b>{fmt.num(dueRadar.length)}</b> <span>overdue</span></>} />
        <NeoKpi label="Reminders" value={fmt.num(openReminders.length)} icon={<BellRing />} />
      </NeoKpis>

      <div className="ml-later__grid">
        <NeoPanel hud="Wake-up timeline" title="Snoozed" icon={<AlarmClock />}>
          {snoozed.length ? (
            <ol className="ml-tl">
              {snoozed.map((t) => {
                const from = ctx.resolve(t.messages[t.messages.length - 1].from);
                return (
                  <li key={t.id} className="ml-tl__item">
                    <span className="ml-tl__dot" aria-hidden="true" />
                    <div className="ml-tl__when">
                      <b>{fmt.dayTime(t.snoozedUntil ?? now)}</b>
                      <span className="ml-tl__in neo-mono">{fmt.duration((t.snoozedUntil ?? now) - now)}</span>
                    </div>
                    <div className="ml-tl__body">
                      <span className="ml-tl__subj" data-no-i18n dir="auto">
                        {t.subject}
                      </span>
                      <span className="ml-tl__from">{from.name}</span>
                    </div>
                    <div className="ml-tl__acts">
                      <button
                        type="button"
                        className="neo-btn neo-btn--soft neo-btn--xs"
                        onClick={() => {
                          unsnooze(t.id);
                          toast.success('Back in your inbox', t.subject);
                        }}
                      >
                        <BellRing /> <span>Wake now</span>
                      </button>
                      <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={() => navigate(`/mail?thread=${t.id}`)}>
                        <span>Open</span>
                      </button>
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <NeoEmpty icon={<AlarmClock />} title="Nothing snoozed" compact>
              <span>Snooze any thread with</span> <kbd className="kbd">s</kbd> <span>to bring it back later.</span>
            </NeoEmpty>
          )}
        </NeoPanel>

        <NeoPanel hud="Outbox" title="Scheduled sends" icon={<CalendarClock />}>
          {queue.length ? (
            <ul className="ml-sch">
              {queue.map((s) => {
                const meta = REASON_META[s.reason];
                const span = Math.max(1, s.sendAt - s.createdAt);
                const people = s.draft.to.map((k) => ctx.resolve(k));
                return (
                  <li key={s.id} className="ml-sch__item">
                    <Ring value={Math.min(1, Math.max(0, (now - s.createdAt) / span))} size={44} stroke={4} label="Time until send">
                      {meta.icon}
                    </Ring>
                    <div className="ml-sch__body">
                      {s.draft.subject ? (
                        <b className="ml-sch__subj" data-no-i18n dir="auto">
                          {s.draft.subject}
                        </b>
                      ) : (
                        <b className="ml-sch__subj">(no subject)</b>
                      )}
                      <span className="ml-sch__to">
                        <span>To</span> <Avatars users={people.map((p) => ({ id: p.key, name: p.name, avatarHue: p.avatarHue }))} size={18} max={4} /> <FirstNames names={people.map((p) => p.name)} />
                      </span>
                      <span className="ml-sch__meta">
                        <Chip tone={meta.tone} size="sm">
                          {meta.label}
                        </Chip>
                        <span className="ml-sch__at">{fmt.full(s.sendAt)}</span>
                      </span>
                    </div>
                    <div className="ml-sch__count">
                      <span className="neo-hud">Sends in</span>
                      <b className="neo-mono">{fmt.duration(s.sendAt - now)}</b>
                    </div>
                    <div className="ml-sch__acts">
                      <button
                        type="button"
                        className="neo-btn neo-btn--soft neo-btn--xs"
                        onClick={() => {
                          const id = cancelScheduled(s.id);
                          if (id) useMailUi.getState().openDraft(id);
                        }}
                      >
                        <PenSquare /> <span>Edit</span>
                      </button>
                      <button
                        type="button"
                        className="neo-btn neo-btn--plasma neo-btn--xs"
                        onClick={() => {
                          if (sendScheduledNow(s.id)) toast.success('Sent', s.draft.subject);
                        }}
                      >
                        <Send className="ml-flip" /> <span>Send now</span>
                      </button>
                      <button
                        type="button"
                        className="neo-btn neo-btn--ghost neo-btn--xs"
                        onClick={() => {
                          if (cancelScheduled(s.id)) toast.info('Moved to drafts', s.draft.subject);
                        }}
                      >
                        <Undo2 /> <span>Cancel</span>
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <NeoEmpty icon={<CalendarClock />} title="Outbox is empty" compact>
              <span>Use the arrow next to Send to schedule — Nova can hold late-night mail until your quiet hours end.</span>
            </NeoEmpty>
          )}
        </NeoPanel>

        <NeoPanel hud="Follow-up radar" title="Waiting for a reply" icon={<Radar />}>
          {radar.length ? (
            <ul className="ml-fu">
              {radar.map((f) => {
                const c = ctx.resolve(f.to[0] ?? '');
                const name = c.hub ? firstOf(c.name) : c.name;
                return (
                  <li key={f.thread.id} className="ml-fu__item" data-due={f.due || undefined}>
                    <ContactAvatar c={c} size={30} presence />
                    <div className="ml-fu__body">
                      {f.due ? (
                        <b className="ml-fu__line">
                          <span>No reply from</span> <span>{name}</span> · <span>{fmt.locale === 'ar' ? arDays(f.days) : `${f.days} ${f.days === 1 ? 'day' : 'days'}`}</span>
                        </b>
                      ) : (
                        <b className="ml-fu__line">
                          <span>Watching for a reply from</span> <span>{name}</span>
                        </b>
                      )}
                      <span className="ml-fu__subj" data-no-i18n dir="auto">
                        {f.thread.subject}
                      </span>
                      {!f.due && (
                        <span className="ml-fu__next">
                          <span>Nudge due</span> <b>{fmt.dayTime(f.dueAt)}</b>
                        </span>
                      )}
                    </div>
                    <div className="ml-fu__acts">
                      <button type="button" className="neo-btn neo-btn--nova neo-btn--xs" onClick={() => nudge(f)}>
                        <Wand2 /> <span>Nova nudge</span>
                      </button>
                      <button type="button" className="neo-iconbtn neo-iconbtn--sm" onClick={() => toggleFollowUp(f.thread.id)} aria-label="Stop watching" title="Stop watching">
                        <X />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <NeoEmpty icon={<Radar />} title="No replies outstanding" compact>
              <span>Turn on follow-up for any sent mail and Nova will tell you when it goes quiet.</span>
            </NeoEmpty>
          )}
        </NeoPanel>

        <NeoPanel hud="Reminders" title="Notes for future you" icon={<BellRing />}>
          <form
            className="ml-rem__add"
            onSubmit={(e) => {
              e.preventDefault();
              if (!text.trim()) return;
              addReminder(text, due);
              setText('');
              toast.success('Reminder set', fmt.full(due));
            }}
          >
            <input className="neo-input neo-input--sm" value={text} onChange={(e) => setText(e.target.value)} placeholder="Remind me to…" aria-label="Reminder" />
            <button type="submit" className="neo-btn neo-btn--soft neo-btn--xs" disabled={!text.trim()}>
              <Plus /> <span>Add</span>
            </button>
          </form>
          <div className="ml-rem__presets" role="radiogroup" aria-label="Remind me">
            {presets.map((p) => (
              <button key={p.id} type="button" role="radio" aria-checked={Math.abs(due - p.at) < 60_000} className="ml-pill" onClick={() => setDue(p.at)}>
                <span>{p.label}</span>
              </button>
            ))}
          </div>
          {reminders.length ? (
            <ul className="ml-rem">
              {reminders.map((r) => (
                <li key={r.id} data-done={r.done || undefined} data-due={(!r.done && r.dueAt <= now) || undefined}>
                  <button type="button" className="ml-rem__check" role="checkbox" aria-checked={r.done} aria-label="Done" onClick={() => toggleReminder(r.id)}>
                    {r.done ? <Check /> : null}
                  </button>
                  <span className="ml-rem__text" data-no-i18n dir="auto">
                    {r.text}
                  </span>
                  <span className="ml-rem__due">{fmt.dayTime(r.dueAt)}</span>
                  {r.threadId && (
                    <button type="button" className="neo-iconbtn neo-iconbtn--sm" onClick={() => navigate(`/mail?thread=${r.threadId}`)} aria-label="Open thread">
                      <FileText />
                    </button>
                  )}
                  <button type="button" className="neo-iconbtn neo-iconbtn--sm" onClick={() => removeReminder(r.id)} aria-label="Delete reminder">
                    <Trash2 />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="ml-muted">No reminders yet.</p>
          )}
        </NeoPanel>

        <NeoPanel hud="Drafts" title="Saved drafts" icon={<PenSquare />}>
          {drafts.length ? (
            <ul className="ml-drafts">
              {drafts.map((d) => (
                <li key={d.id}>
                  <PenSquare aria-hidden="true" />
                  <span className="ml-drafts__text">
                    {d.subject ? (
                      <b data-no-i18n dir="auto">
                        {d.subject}
                      </b>
                    ) : (
                      <b>(no subject)</b>
                    )}
                    <span>
                      {d.to.length ? (
                        <>
                          <span>To</span> <FirstNames names={d.to.map((k) => ctx.resolve(k).name)} />
                        </>
                      ) : (
                        <span>No recipients yet</span>
                      )}
                    </span>
                  </span>
                  <span className="ml-drafts__at">{fmt.when(d.updatedAt, now)}</span>
                  <button type="button" className="neo-btn neo-btn--soft neo-btn--xs" onClick={() => useMailUi.getState().openDraft(d.id)}>
                    <span>Open</span>
                  </button>
                  <button
                    type="button"
                    className="neo-iconbtn neo-iconbtn--sm"
                    onClick={() => {
                      discardDraft(d.id);
                      useMailUi.getState().closeDraft(d.id);
                    }}
                    aria-label="Discard draft"
                  >
                    <Trash2 />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="ml-muted">No drafts.</p>
          )}
        </NeoPanel>
      </div>
    </div>
  );
}
