/**
 * Helix Mail — Sent: privacy-first delivery states (delivery, never opens),
 * follow-up toggles per thread and the scheduled-send history.
 */
import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { CalendarClock, CheckCheck, CornerDownLeft, EyeOff, MailCheck, Radar, Send, ServerCog, TriangleAlert } from 'lucide-react';
import { Avatars, Chip, NeoBanner, NeoEmpty, NeoKpi, NeoKpis, NeoPanel } from '@/components/neo';
import { useNow } from '@/hooks/useNow';
import { DAY, followUpRadar, sentThreads } from '@/mail/engine';
import { useMail } from '@/mail/store';
import type { DeliveryState } from '@/mail/types';
import { REASON_META } from './LaterView';
import { FirstNames, Switch, useFmt, useMailCtx } from './parts';

const DELIVERY: Record<DeliveryState, { label: string; tone: 'success' | 'cyan' | 'warning' | 'danger'; icon: JSX_I }> = {
  delivered: { label: 'Delivered', tone: 'success', icon: 'check' },
  accepted: { label: 'Accepted by their server', tone: 'cyan', icon: 'server' },
  scheduled: { label: 'Scheduled', tone: 'warning', icon: 'clock' },
  bounced: { label: 'Bounced', tone: 'danger', icon: 'alert' },
};
type JSX_I = 'check' | 'server' | 'clock' | 'alert';
const ICON = { check: <MailCheck />, server: <ServerCog />, clock: <CalendarClock />, alert: <TriangleAlert /> };

export function SentView() {
  const ctx = useMailCtx();
  const fmt = useFmt();
  const navigate = useNavigate();
  const now = useNow(60_000);
  const ownerId = useMail((s) => s.ownerId);
  const threads = useMail((s) => s.threads);
  const scheduled = useMail((s) => s.scheduled);
  const toggleFollowUp = useMail((s) => s.toggleFollowUp);

  const sent = useMemo(() => sentThreads(threads, ownerId), [threads, ownerId]);
  const week = sent.filter((s) => s.sentAt > now - 7 * DAY);
  const radar = useMemo(() => followUpRadar(threads, ownerId, now), [threads, ownerId, now]);
  const history = scheduled.filter((s) => s.status === 'sent').sort((a, b) => (b.sentAt ?? 0) - (a.sentAt ?? 0));
  const replied = sent.filter((s) => s.replied).length;

  return (
    <div className="ml-view ml-sent">
      <NeoKpis label="Sent at a glance">
        <NeoKpi label="Sent this week" value={fmt.num(week.length)} icon={<Send />} />
        <NeoKpi label="Replied" value={`${sent.length ? Math.round((replied / sent.length) * 100) : 0}%`} icon={<CornerDownLeft />} sub={<><b>{fmt.num(replied)}</b> <span>threads</span></>} />
        <NeoKpi label="Awaiting replies" value={fmt.num(radar.length)} icon={<Radar />} to="/mail/later" />
        <NeoKpi label="Sent on schedule" value={fmt.num(history.length)} icon={<CalendarClock />} />
      </NeoKpis>

      <NeoBanner tone="cyan" icon={<EyeOff />} title="Privacy-first delivery">
        <span>Nova Inbox never tracks opens — you see delivery, not reading. Follow-up radar tells you when a thread goes quiet instead.</span>
      </NeoBanner>

      <div className="ml-sent__grid">
        <NeoPanel hud="Sent mail" title="Recently sent" flush>
          {sent.length ? (
            <ul className="ml-sentlist">
              {sent.map(({ thread: t, sentAt, replied: r }) => {
                const mine = [...t.messages].reverse().find((m) => m.from === ownerId)!;
                const people = [...mine.to, ...mine.cc].map((k) => ctx.resolve(k));
                const d = DELIVERY[mine.delivery ?? 'delivered'];
                const watching = !!t.followUp?.active;
                return (
                  <li key={t.id} className="ml-sentrow">
                    <button type="button" className="ml-sentrow__main" onClick={() => navigate(`/mail?thread=${t.id}`)}>
                      <Avatars users={people.map((p) => ({ id: p.key, name: p.name, avatarHue: p.avatarHue }))} size={26} max={3} />
                      <span className="ml-sentrow__body">
                        <span className="ml-sentrow__to">
                          <span>To</span> <FirstNames names={people.map((p) => p.name)} full={people.map((p) => !p.hub)} />
                        </span>
                        <span className="ml-sentrow__subj" data-no-i18n dir="auto">
                          {t.subject}
                        </span>
                      </span>
                      <span className="ml-sentrow__time">{fmt.when(sentAt, now)}</span>
                    </button>
                    <span className="ml-sentrow__state">
                      {r ? (
                        <Chip tone="success" size="sm" icon={<CheckCheck />}>
                          Replied
                        </Chip>
                      ) : (
                        <Chip tone={d.tone} size="sm" icon={ICON[d.icon]}>
                          {d.label}
                        </Chip>
                      )}
                      {t.source && (
                        <Chip tone="indigo" size="sm">
                          {t.source.label}
                        </Chip>
                      )}
                    </span>
                    {!r && (
                      <Switch on={watching} onChange={() => toggleFollowUp(t.id)} label="Follow up if no reply">
                        <span className="ml-switch__label">Follow up</span>
                      </Switch>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <NeoEmpty icon={<Send />} title="Nothing sent yet" compact />
          )}
        </NeoPanel>

        <NeoPanel hud="Scheduled history" title="Sent on schedule" icon={<CalendarClock />}>
          {history.length ? (
            <ul className="ml-hist">
              {history.map((s) => {
                const meta = REASON_META[s.reason];
                return (
                  <li key={s.id}>
                    <span className="ml-hist__icon" aria-hidden="true">
                      {meta.icon}
                    </span>
                    <span className="ml-hist__text">
                      <b data-no-i18n dir="auto">
                        {s.draft.subject}
                      </b>
                      <span>
                        <span>Sent</span> {fmt.full(s.sentAt ?? s.sendAt)}
                      </span>
                    </span>
                    <Chip tone={meta.tone} size="sm">
                      {meta.label}
                    </Chip>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="ml-muted">Scheduled sends appear here once they go out.</p>
          )}
        </NeoPanel>
      </div>
    </div>
  );
}
