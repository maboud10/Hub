/**
 * Helix Mail — Screener: HEY-style first-contact screening as a swipeable card
 * stack. Nova's trust radar scores SPF / DKIM / DMARC, domain age, lookalike
 * domains (he1ix-co.com → helix.co) and link reputation. Allow into Inbox /
 * Feed / Paper trail, Block, or Report phish → IT Helpdesk security ticket.
 */
import { useMemo, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { Ban, Check, CircleAlert, CircleCheck, CircleX, Inbox, LifeBuoy, MailQuestion, Newspaper, Receipt, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Chip, NeoBanner, NeoEmpty, NeoPanel, NeoTracker, Ring, type Tone } from '@/components/neo';
import { useNow } from '@/hooks/useNow';
import { loadBridge } from '@/lib/appBridge';
import { toast } from '@/store/toast';
import { PHISH_STEPS, arDays, phishStage, snippetOf, threadTime, trustReport, type TrustReport } from '@/mail/engine';
import { useMail } from '@/mail/store';
import type { MailContact, MailThread, ScreenerDestination } from '@/mail/types';
import { ContactAvatar, useFmt, useMailCtx, useMailKeys } from './parts';

const DEST: { id: ScreenerDestination; label: string; icon: ReactNode }[] = [
  { id: 'inbox', label: 'Inbox', icon: <Inbox /> },
  { id: 'feed', label: 'Feed', icon: <Newspaper /> },
  { id: 'paper', label: 'Paper trail', icon: <Receipt /> },
];

const VERDICT: Record<TrustReport['verdict'], { label: string; tone: Tone; color: string }> = {
  trusted: { label: 'Looks legit', tone: 'success', color: 'rgb(var(--success-rgb))' },
  caution: { label: 'Be careful', tone: 'warning', color: 'rgb(var(--warning-rgb))' },
  danger: { label: 'Likely phishing', tone: 'danger', color: 'rgb(var(--danger-rgb))' },
};

const AUTH_LABEL: Record<string, string> = { pass: 'Pass', fail: 'Fail', softfail: 'Soft fail', none: 'None' };
const SHORT: Record<string, string> = { spf: 'SPF', dkim: 'DKIM', dmarc: 'DMARC', age: 'Age', lookalike: 'Lookalike', links: 'Links' };

interface QueueItem {
  contact: MailContact;
  threads: MailThread[];
}

export function ScreenerView() {
  const ctx = useMailCtx();
  const fmt = useFmt();
  const navigate = useNavigate();
  const now = useNow(5_000);
  const threads = useMail((s) => s.threads);
  const contacts = useMail((s) => s.contacts);
  const phish = useMail((s) => s.phish);
  const screen = useMail((s) => s.screen);
  const setPhishTicket = useMail((s) => s.setPhishTicket);
  const [dest, setDest] = useState<ScreenerDestination>('inbox');
  const [drag, setDrag] = useState<{ x: number; dx: number } | null>(null);
  const [leaving, setLeaving] = useState<'allow' | 'block' | null>(null);

  const queue: QueueItem[] = useMemo(() => {
    const by = new Map<string, MailThread[]>();
    for (const t of threads) {
      if (t.folder !== 'screener') continue;
      const k = t.messages[0]?.from;
      if (k) by.set(k, [...(by.get(k) ?? []), t]);
    }
    return [...by.entries()]
      .map(([id, ts]) => ({ contact: ctx.contactMap.get(id)!, threads: ts }))
      .filter((x) => x.contact)
      .sort((a, b) => threadTime(b.threads[0]) - threadTime(a.threads[0]));
  }, [threads, ctx.contactMap]);

  const screened = useMemo(
    () => contacts.filter((c) => c.screener && c.screener !== 'pending' && threads.some((t) => t.messages[0]?.from === c.id && t.folder !== 'screener')),
    [contacts, threads],
  );

  const top = queue[0];
  const report = useMemo(() => (top ? trustReport(top.contact) : null), [top]);
  const rtl = fmt.locale === 'ar';
  const sem = (drag?.dx ?? 0) * (rtl ? -1 : 1);

  const finish = (kind: 'allow' | 'block', fn: () => void) => {
    setLeaving(kind);
    window.setTimeout(() => {
      fn();
      setLeaving(null);
      setDrag(null);
    }, 220);
  };
  const allow = (d: ScreenerDestination = dest) => {
    if (!top) return;
    const c = top.contact;
    finish('allow', () => {
      screen(c.id, { kind: 'allow', destination: d });
      toast.success('Sender allowed', c.name);
    });
  };
  const block = () => {
    if (!top) return;
    const c = top.contact;
    finish('block', () => {
      screen(c.id, { kind: 'block' });
      toast.info('Sender blocked', c.name);
    });
  };
  const reportPhish = async () => {
    if (!top || !report) return;
    const c = top.contact;
    const subject = top.threads[0].subject;
    screen(c.id, { kind: 'report' });
    if (!ctx.viewer) return;
    try {
      const hd = await loadBridge('helpdesk');
      const t = c.trust;
      const r = hd.createTicket(ctx.viewer, {
        subject: `Phishing report: ${subject}`,
        description: [
          `Sender: ${c.name} <${c.email}>`,
          `Domain: ${c.domain}${report.lookalikeOf ? ` (lookalike of ${report.lookalikeOf})` : ''}`,
          `Nova trust score: ${report.score}/100`,
          t ? `SPF ${t.spf} · DKIM ${t.dkim} · DMARC ${t.dmarc} · domain age ${t.domainAgeDays}d · link reputation ${t.linkReputation}/100` : '',
          '',
          'Reported from the Nova Inbox Screener. The message has been quarantined for everyone.',
        ].join('\n'),
        category: 'security',
        priority: 'P2',
        source: { app: 'mail', label: 'Nova Inbox · Screener', to: '/mail/screener' },
      });
      if (r.ok) {
        setPhishTicket(c.id, { id: r.ticketId, to: r.to });
        toast.success('Reported to Security', r.ticketId);
      } else toast.error('Couldn’t open a ticket', r.error);
    } catch {
      toast.error('IT Helpdesk is unavailable');
    }
  };

  useMailKeys(
    {
      arrowright: () => (rtl ? block() : allow()),
      arrowleft: () => (rtl ? allow() : block()),
    },
    !!top,
  );

  const onDown = (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button, a, input')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ x: e.clientX, dx: 0 });
  };
  const onMove = (e: ReactPointerEvent<HTMLElement>) => {
    if (drag) setDrag({ ...drag, dx: e.clientX - drag.x });
  };
  const onUp = () => {
    if (!drag) return;
    if (sem > 120) allow();
    else if (sem < -120) block();
    else setDrag(null);
  };

  const cardStyle: CSSProperties = leaving
    ? { transform: `translateX(${(leaving === 'allow' ? 1 : -1) * (rtl ? -1 : 1) * 140}%) rotate(${(leaving === 'allow' ? 1 : -1) * (rtl ? -1 : 1) * 12}deg)`, opacity: 0 }
    : drag
      ? { transform: `translateX(${drag.dx}px) rotate(${drag.dx / 24}deg)`, transition: 'none' }
      : {};

  return (
    <div className="ml-screener">
      <div className="ml-screener__main">
        {top && report ? (
          <>
            <div className="ml-stack">
              {queue.slice(1, 3).map((x, i) => (
                <div key={x.contact.id} className="ml-stack__ghost neo-plane" style={{ ['--d' as string]: i + 1 } as CSSProperties} aria-hidden="true" />
              ))}
              <article
                className="ml-scard neo-plane"
                data-verdict={report.verdict}
                style={cardStyle}
                onPointerDown={onDown}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onPointerCancel={() => setDrag(null)}
                aria-label={top.contact.name}
              >
                <span className="ml-scard__hint" data-kind="allow" style={{ opacity: Math.max(0, Math.min(1, sem / 120)) }} aria-hidden="true">
                  <Check /> <span>Allow</span>
                </span>
                <span className="ml-scard__hint" data-kind="block" style={{ opacity: Math.max(0, Math.min(1, -sem / 120)) }} aria-hidden="true">
                  <Ban /> <span>Block</span>
                </span>

                <header className="ml-scard__head">
                  <ContactAvatar c={ctx.resolve(top.contact.id)} size={48} />
                  <div className="ml-scard__who">
                    <div className="neo-hud">First contact</div>
                    <h3 className="ml-scard__name">{top.contact.name}</h3>
                    <span className="ml-scard__email" data-no-i18n>
                      {top.contact.email}
                    </span>
                  </div>
                  <Chip tone={VERDICT[report.verdict].tone} size="lg" icon={report.verdict === 'trusted' ? <ShieldCheck /> : <ShieldAlert />}>
                    {VERDICT[report.verdict].label}
                  </Chip>
                </header>

                {report.lookalikeOf && (
                  <NeoBanner tone="danger" icon={<ShieldAlert />} title="Lookalike domain">
                    <span>This sender imitates</span> <b className="neo-mono">{report.lookalikeOf}</b> <span>using</span> <b className="neo-mono">{top.contact.domain}</b>
                  </NeoBanner>
                )}

                <div className="ml-scard__grid">
                  <TrustRadar report={report} />
                  <ul className="ml-checks" aria-label="Trust checks">
                    {report.checks.map((c) => (
                      <li key={c.id} data-state={c.ok ? 'ok' : c.warn ? 'warn' : 'fail'}>
                        {c.ok ? <CircleCheck aria-hidden="true" /> : c.warn ? <CircleAlert aria-hidden="true" /> : <CircleX aria-hidden="true" />}
                        <span className="ml-checks__label">{c.label}</span>
                        <span className="ml-checks__val">
                          {c.id === 'age' ? (
                            fmt.locale === 'ar' ? (
                              <b>{arDays(top.contact.trust?.domainAgeDays ?? 0)}</b>
                            ) : (
                              <>
                                <b>{fmt.num(top.contact.trust?.domainAgeDays ?? 0)}</b> <span>days</span>
                              </>
                            )
                          ) : c.id === 'links' ? (
                            top.contact.trust?.links ? (
                              <>
                                <b>{fmt.num(top.contact.trust.linkReputation)}</b>/100
                              </>
                            ) : (
                              <span>No links</span>
                            )
                          ) : c.id === 'lookalike' ? (
                            report.lookalikeOf ? (
                              <b className="neo-mono">{report.lookalikeOf}</b>
                            ) : (
                              <span>None</span>
                            )
                          ) : (
                            <span>{AUTH_LABEL[c.detail] ?? c.detail}</span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="ml-scard__mail">
                  <MailQuestion aria-hidden="true" />
                  <div className="ml-scard__mailtext">
                    <b data-no-i18n dir="auto">
                      {top.threads[0].subject}
                    </b>
                    <span data-no-i18n dir="auto">
                      {snippetOf(top.threads[0].messages[0].body, 150)}
                    </span>
                  </div>
                  <span className="ml-scard__when">{fmt.when(threadTime(top.threads[0]), now)}</span>
                </div>

                <footer className="ml-scard__acts">
                  <div role="radiogroup" aria-label="Allow into" className="ml-dest">
                    {DEST.map((d) => (
                      <button key={d.id} type="button" role="radio" aria-checked={dest === d.id} onClick={() => setDest(d.id)}>
                        {d.icon}
                        <span>{d.label}</span>
                      </button>
                    ))}
                  </div>
                  <div className="ml-scard__btns">
                    <button type="button" className="neo-btn neo-btn--success neo-btn--sm" onClick={() => allow()}>
                      <Check /> <span>Allow</span>
                    </button>
                    <button type="button" className="neo-btn neo-btn--soft neo-btn--sm" onClick={block}>
                      <Ban /> <span>Block</span>
                    </button>
                    <button type="button" className="neo-btn neo-btn--danger neo-btn--sm" onClick={() => void reportPhish()}>
                      <ShieldAlert /> <span>Report phish</span>
                    </button>
                  </div>
                </footer>
              </article>
            </div>
            <p className="ml-screener__tip">
              <span>Swipe or use the arrow keys</span> <kbd className="kbd">{rtl ? '←' : '→'}</kbd> <span>Allow</span> <kbd className="kbd">{rtl ? '→' : '←'}</kbd> <span>Block</span>
            </p>
          </>
        ) : (
          <NeoEmpty icon={<ShieldCheck />} title="Screener is clear">
            <span>New senders will wait here until you decide. Nobody new reaches your Inbox without your OK.</span>
          </NeoEmpty>
        )}
      </div>

      <aside className="ml-screener__side" aria-label="Screener overview">
        <NeoPanel hud="Queue" title="Waiting to be screened">
          {queue.length ? (
            <ul className="ml-mini">
              {queue.map((q) => {
                const r = trustReport(q.contact);
                return (
                  <li key={q.contact.id} data-top={q === top || undefined}>
                    <ContactAvatar c={ctx.resolve(q.contact.id)} size={26} />
                    <span className="ml-mini__text">
                      <b>{q.contact.name}</b>
                      <span data-no-i18n>{q.contact.domain}</span>
                    </span>
                    <Ring value={r.score / 100} size={30} stroke={3} color={VERDICT[r.verdict].color} label={`${r.score} · Trust score`}>
                      {r.score}
                    </Ring>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="ml-muted">Nobody is waiting.</p>
          )}
        </NeoPanel>

        <NeoPanel hud="Decisions" title="Recently screened">
          {screened.length ? (
            <ul className="ml-decided">
              {screened.map((c) => {
                const rep = phish[c.id];
                return (
                  <li key={c.id}>
                    <div className="ml-decided__row">
                      <ContactAvatar c={ctx.resolve(c.id)} size={24} />
                      <b className="grow truncate">{c.name}</b>
                      {c.screener === 'allowed' ? (
                        <Chip tone="success" size="sm" icon={<Check />}>
                          <span>Allowed</span> · <span>{DEST.find((d) => d.id === c.screenerDestination)?.label ?? 'Inbox'}</span>
                        </Chip>
                      ) : c.screener === 'blocked' ? (
                        <Chip tone="slate" size="sm" icon={<Ban />}>
                          Blocked
                        </Chip>
                      ) : (
                        <Chip tone="danger" size="sm" icon={<ShieldAlert />}>
                          Reported
                        </Chip>
                      )}
                    </div>
                    {c.screener === 'reported' && (
                      <NeoTracker
                        compact
                        steps={PHISH_STEPS.map((label) => ({ label }))}
                        current={phishStage(rep, now)}
                        label="Phishing report"
                        className="ml-decided__tracker"
                      />
                    )}
                    {rep?.ticketTo && (
                      <button type="button" className="ml-linkbtn" onClick={() => navigate(rep.ticketTo!)}>
                        <LifeBuoy aria-hidden="true" /> <span>Security ticket</span> <b className="neo-mono">{rep.ticketId}</b>
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="ml-muted">Decisions you make appear here.</p>
          )}
        </NeoPanel>
      </aside>
    </div>
  );
}

/* ==========================================================================
   Trust radar
   ========================================================================== */

function TrustRadar({ report }: { report: TrustReport }) {
  const n = report.checks.length;
  const R = 62;
  const cx = 90;
  const cy = 86;
  const pt = (i: number, r: number) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;
  };
  const val = (c: TrustReport['checks'][number]) => (c.ok ? 1 : c.warn ? 0.55 : 0.18);
  const poly = report.checks.map((c, i) => pt(i, R * val(c)).join(',')).join(' ');
  const v = VERDICT[report.verdict];
  return (
    <div className="ml-radar" data-verdict={report.verdict}>
      <svg viewBox="0 0 180 172" className="ml-radar__svg" role="img" aria-label="Nova trust radar">
        {[0.34, 0.67, 1].map((k) => (
          <polygon key={k} className="ml-radar__grid" points={report.checks.map((_, i) => pt(i, R * k).join(',')).join(' ')} />
        ))}
        {report.checks.map((c, i) => {
          const [x, y] = pt(i, R);
          return <line key={c.id} className="ml-radar__axis" x1={cx} y1={cy} x2={x} y2={y} />;
        })}
        <polygon className="ml-radar__shape" points={poly} />
        {report.checks.map((c, i) => {
          const [x, y] = pt(i, R * val(c));
          return <circle key={c.id} className="ml-radar__dot" data-state={c.ok ? 'ok' : c.warn ? 'warn' : 'fail'} cx={x} cy={y} r={3.2} />;
        })}
        {report.checks.map((c, i) => {
          const [x, y] = pt(i, R + 15);
          return (
            <text key={c.id} x={x} y={y} className="ml-radar__label" textAnchor="middle" dominantBaseline="middle">
              {SHORT[c.id]}
            </text>
          );
        })}
      </svg>
      <div className="ml-radar__score">
        <Ring value={report.score / 100} size={58} stroke={6} color={v.color} label={`${report.score} · Trust score`}>
          {report.score}
        </Ring>
        <span className="neo-hud">Trust score</span>
      </div>
    </div>
  );
}
