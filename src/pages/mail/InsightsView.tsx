/**
 * Helix Mail — Insights: reply-time trend, 7×24 email-hours heatmap,
 * after-hours sending linked to Wellbeing quiet hours, top correspondents,
 * newsletter clutter with 1-click bulk unsubscribe, attachment storage
 * cleanup with an "email carbon" estimate, and focus-friendly Feed digests.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Archive, BellOff, Clock3, CloudOff, HeartPulse, Inbox, Leaf, MailMinus, Moon, Newspaper, Square, SquareCheckBig, Timer, Users } from 'lucide-react';
import { Bar, Chip, NeoKpi, NeoKpis, NeoPanel, Ring, Spark } from '@/components/neo';
import { useNow } from '@/hooks/useNow';
import { loadBridge } from '@/lib/appBridge';
import { toast } from '@/store/toast';
import {
  DAY,
  DEFAULT_QUIET,
  afterHoursCount,
  attachmentStorage,
  computeRhythm,
  digestWindow,
  emailHeatmap,
  formatHM,
  heldByDigest,
  inInbox,
  isQuietHour,
  median,
  mergeApprovals,
  newsletterClutter,
  topCorrespondents,
  type QuietWindow,
} from '@/mail/engine';
import { useMail } from '@/mail/store';
import { ContactAvatar, KindIcon, Switch, fmtSize, useFmt, useMailCtx } from './parts';

/** Arabic "N weeks ago" with the right plural form. */
const arWeeksAgo = (n: number, num: (x: number) => string) => (n === 1 ? 'قبل أسبوع' : n === 2 ? 'قبل أسبوعين' : n <= 10 ? `قبل ${num(n)} أسابيع` : `قبل ${num(n)} أسبوعاً`);

export function InsightsView() {
  const ctx = useMailCtx();
  const fmt = useFmt();
  const now = useNow(60_000);
  // Monday-first weekday names in the interface language (1 Jan 2024 was a Monday).
  const DAYS = useMemo(() => Array.from({ length: 7 }, (_, i) => fmt.weekday(new Date(2024, 0, 1 + i, 12).getTime())), [fmt]);
  const ownerId = useMail((s) => s.ownerId);
  const threads = useMail((s) => s.threads);
  const contacts = useMail((s) => s.contacts);
  const sentLog = useMail((s) => s.sentLog);
  const replyLog = useMail((s) => s.replyLog);
  const history = useMail((s) => s.history);
  const prefs = useMail((s) => s.prefs);
  const approvals = useMail((s) => s.approvals);
  const liveApprovals = useMail((s) => s.liveApprovals);
  const decisions = useMail((s) => s.decisions);
  const { unsubscribe, offloadAttachments, setPrefs } = useMail.getState();
  const [quiet, setQuiet] = useState<QuietWindow>(DEFAULT_QUIET);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!ctx.viewer) return;
    let alive = true;
    loadBridge('wellbeing')
      .then((b) => alive && setQuiet(b.quietHours(ctx.viewer!)))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [ctx.viewer]);

  const unreadPriority = threads.filter((t) => t.stream === 'priority' && t.unread && inInbox(t, now, prefs)).length;
  const pending = mergeApprovals(liveApprovals, approvals, decisions, now).pending.length;
  const rhythm = computeRhythm({ sentLog, replyLog, unreadPriority, pendingApprovals: pending }, quiet, now);
  const trend = [...history.replyMinsWeekly, Math.round(median(replyLog))];
  const change = trend[0] ? Math.round(((trend[0] - trend[trend.length - 1]) / trend[0]) * 100) : 0;
  const heat = useMemo(() => emailHeatmap(history, sentLog, now), [history, sentLog, now]);
  const heatMax = Math.max(1, ...heat.flat());
  const peak = useMemo(() => {
    let best = { d: 0, h: 9, v: -1 };
    heat.forEach((row, d) => row.forEach((v, h) => v > best.v && (best = { d, h, v })));
    return best;
  }, [heat]);
  const weekSends = sentLog.filter((ts) => ts > now - 7 * DAY && ts <= now).length;
  const lastWeekAfter = afterHoursCount(sentLog, quiet, now - 14 * DAY, now - 7 * DAY);
  const afterShare = weekSends ? rhythm.afterHoursSentThisWeek / weekSends : 0;
  const top = useMemo(
    () =>
      topCorrespondents(threads, ownerId, (k) => {
        const c = ctx.resolve(k);
        return c.hub || ['customer', 'vendor', 'partner', 'person', 'internal'].includes(c.kind);
      }),
    [threads, ownerId, ctx],
  );
  const topMax = Math.max(1, ...top.map((t) => t.count));
  const clutter = useMemo(() => newsletterClutter(threads, contacts), [threads, contacts]);
  const storage = useMemo(() => attachmentStorage(threads), [threads]);
  const big = storage.items.filter((i) => i.attachment.sizeKb >= 1024);
  const digest = digestWindow(now);
  const held = heldByDigest(threads, now);
  const monthlySaved = clutter.filter((c) => picked.has(c.contact.id)).reduce((s, c) => s + c.monthly, 0);

  return (
    <div className="ml-view ml-insights">
      <NeoKpis label="Mail health">
        <NeoKpi
          label="Median reply"
          value={
            <>
              <CountMinutes mins={rhythm.avgReplyMins} />
            </>
          }
          icon={<Timer />}
          sub={
            <>
              <b>{fmt.num(Math.abs(change))}%</b> <span>{change >= 0 ? 'faster than 8 weeks ago' : 'slower than 8 weeks ago'}</span>
            </>
          }
          spark={<Spark data={trend} width={92} height={30} />}
        />
        <NeoKpi
          label="After-hours sends"
          value={fmt.num(rhythm.afterHoursSentThisWeek)}
          icon={<Moon />}
          tone={rhythm.afterHoursSentThisWeek > 3 ? 'warning' : undefined}
          sub={
            <>
              <span>Quiet hours</span> <span className="neo-mono">{`${formatHM(quiet.startHour)}–${formatHM(quiet.endHour)}`}</span>
            </>
          }
          to="/wellbeing/rhythm"
        />
        <NeoKpi label="Waiting on you" value={fmt.num(rhythm.unread)} icon={<Inbox />} sub={<span>Priority + approvals</span>} to="/mail" />
        <NeoKpi
          label="Email carbon"
          value={
            <>
              <b>{fmt.num(storage.carbonGramsYear)}</b> <small>g CO₂e</small>
            </>
          }
          icon={<Leaf />}
          sub={<span>Per year · estimate</span>}
        />
      </NeoKpis>

      <div className="ml-insights__grid">
        <NeoPanel hud="Response time" title="Median reply time, last 9 weeks" icon={<Timer />} className="ml-span-2">
          <TrendChart data={trend} />
        </NeoPanel>

        <NeoPanel hud="Rhythm" title="After-hours sending" icon={<Moon />}>
          <div className="ml-after">
            <Ring value={afterShare} size={92} stroke={9} label="Share of sends after hours" color={afterShare > 0.2 ? 'rgb(var(--warning-rgb))' : undefined}>
              {`${Math.round(afterShare * 100)}%`}
            </Ring>
            <div className="ml-after__text">
              <p>
                <b>{fmt.num(rhythm.afterHoursSentThisWeek)}</b> <span>of</span> <b>{fmt.num(weekSends)}</b> <span>emails this week went out during your quiet hours.</span>
              </p>
              <p className="ml-muted">
                <span>Last week</span> <b>{fmt.num(lastWeekAfter)}</b>
              </p>
              <Link to="/wellbeing/rhythm" className="neo-btn neo-btn--soft neo-btn--xs">
                <HeartPulse /> <span>Open Rhythm in Wellbeing</span>
              </Link>
            </div>
          </div>
          <Switch on={prefs.holdLateSends} onChange={(v) => setPrefs({ holdLateSends: v })} label="Hold late-night sends until quiet hours end">
            <span className="ml-switch__label">Hold late-night sends until quiet hours end</span>
          </Switch>
        </NeoPanel>

        <NeoPanel hud="Email hours" title="When your mail happens" icon={<Clock3 />} className="ml-span-2">
          <div className="ml-heat" role="img" aria-label="Email activity by day and hour">
            <div className="ml-heat__hours" aria-hidden="true">
              <span />
              {Array.from({ length: 24 }, (_, h) => (
                <span key={h}>{h % 3 === 0 ? String(h).padStart(2, '0') : ''}</span>
              ))}
            </div>
            {heat.map((row, d) => (
              <div key={d} className="ml-heat__row">
                <span className="ml-heat__day">{DAYS[d]}</span>
                {row.map((v, h) => (
                  <span
                    key={h}
                    className="ml-heat__cell"
                    data-quiet={isQuietHour(h, { ...quiet, enabled: true }) || undefined}
                    style={{ ['--v' as string]: v / heatMax }}
                    title={`${DAYS[d]} ${String(h).padStart(2, '0')}:00 · ${v}`}
                  />
                ))}
              </div>
            ))}
          </div>
          <div className="ml-heat__legend">
            <span className="ml-heat__swatch" data-kind="quiet" aria-hidden="true" /> <span>Quiet hours</span>
            <span className="ml-heat__swatch" aria-hidden="true" /> <span>Busier</span>
            <span className="grow" />
            <span>Busiest</span> <b>{DAYS[peak.d]}</b> <b className="neo-mono">{`${String(peak.h).padStart(2, '0')}:00`}</b>
          </div>
        </NeoPanel>

        <NeoPanel hud="People" title="Top correspondents" icon={<Users />}>
          <ul className="ml-top">
            {top.map((t) => {
              const c = ctx.resolve(t.key);
              return (
                <li key={t.key}>
                  <ContactAvatar c={c} size={26} />
                  <span className="ml-top__name">
                    <b>{c.name}</b>
                    <span>{c.hub ? c.title : c.org}</span>
                  </span>
                  <Bar value={t.count / topMax} label={c.name} />
                  <b className="ml-top__n">{fmt.num(t.count)}</b>
                </li>
              );
            })}
          </ul>
        </NeoPanel>

        <NeoPanel
          hud="Clutter"
          title="Newsletter clutter"
          icon={<Newspaper />}
          actions={
            <button
              type="button"
              className="neo-btn neo-btn--danger neo-btn--xs"
              disabled={!picked.size}
              onClick={() => {
                const archived = unsubscribe([...picked]);
                toast.success('Unsubscribed', `${fmt.num(archived)} · Threads archived`);
                setPicked(new Set());
              }}
            >
              <MailMinus /> <span>Unsubscribe</span> {picked.size > 0 && <span className="neo-count">{fmt.num(picked.size)}</span>}
            </button>
          }
          className="ml-span-2"
        >
          {clutter.length ? (
            <>
              <ul className="ml-clutter">
                {clutter.map((r) => {
                  const on = picked.has(r.contact.id);
                  return (
                    <li key={r.contact.id} data-on={on || undefined}>
                      <button
                        type="button"
                        className="neo-iconbtn neo-iconbtn--sm"
                        role="checkbox"
                        aria-checked={on}
                        aria-label="Select newsletter"
                        onClick={() =>
                          setPicked((p) => {
                            const n = new Set(p);
                            if (n.has(r.contact.id)) n.delete(r.contact.id);
                            else n.add(r.contact.id);
                            return n;
                          })
                        }
                      >
                        {on ? <SquareCheckBig /> : <Square />}
                      </button>
                      <span className="ml-clutter__name">
                        <b>{r.contact.name}</b>
                        <span data-no-i18n>{r.contact.domain}</span>
                      </span>
                      <span className="ml-clutter__rate">
                        <span className="neo-hud">Opened</span>
                        <Bar value={r.readRate} label="Open rate" />
                        <b>{`${Math.round(r.readRate * 100)}%`}</b>
                      </span>
                      <span className="ml-clutter__vol">
                        <b>{fmt.num(r.monthly)}</b> <span>per month</span>
                      </span>
                      <Chip tone={r.suggest === 'unsubscribe' ? 'danger' : r.suggest === 'digest' ? 'amber' : 'success'} size="sm">
                        {r.suggest === 'unsubscribe' ? 'Unsubscribe' : r.suggest === 'digest' ? 'Move to digest' : 'Keep'}
                      </Chip>
                    </li>
                  );
                })}
              </ul>
              <div className="ml-clutter__foot">
                <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={() => setPicked(new Set(clutter.filter((c) => c.suggest === 'unsubscribe').map((c) => c.contact.id)))}>
                  <BellOff /> <span>Select Nova’s suggestions</span>
                </button>
                {picked.size > 0 && (
                  <span className="ml-muted">
                    <b>{fmt.num(monthlySaved)}</b> <span>fewer emails a month</span>
                  </span>
                )}
              </div>
            </>
          ) : (
            <p className="ml-muted">No newsletters left — your Feed is lean.</p>
          )}
        </NeoPanel>

        <NeoPanel hud="Focus" title="Focus-friendly delivery" icon={<Clock3 />}>
          <Switch on={prefs.feedDigest} onChange={(v) => setPrefs({ feedDigest: v })} label="Batch the Feed into two daily digests">
            <span className="ml-switch__label">Batch the Feed into two daily digests</span>
          </Switch>
          <p className="ml-muted ml-digest">
            <span>Digests land at</span> <b className="neo-mono">08:30</b> <span>and</span> <b className="neo-mono">16:30</b>
          </p>
          {prefs.feedDigest && (
            <div className="ml-digest__next">
              <Ring value={1 - Math.min(1, (digest.next - now) / (8 * 3_600_000))} size={46} stroke={5} label="Next digest">
                <Newspaper />
              </Ring>
              <span>
                <span>Next digest</span> <b>{fmt.time(digest.next)}</b> · <b>{fmt.num(held)}</b> <span>newsletters held</span>
              </span>
            </div>
          )}
        </NeoPanel>

        <NeoPanel
          hud="Storage"
          title="Attachment storage & email carbon"
          icon={<CloudOff />}
          className="ml-span-2"
          actions={
            <button
              type="button"
              className="neo-btn neo-btn--soft neo-btn--xs"
              disabled={!big.length}
              onClick={() => {
                const kb = offloadAttachments(big.map((b) => b.attachment.id));
                toast.success('Moved to Drive', `${fmt.num(Math.round(kb / 1024))} ${fmt.locale === 'ar' ? 'ميغابايت' : 'MB'}`);
              }}
            >
              <Archive /> <span>Offload files over 1 MB</span>
            </button>
          }
        >
          <div className="ml-store__sum">
            <span>
              <b>{fmtSize(storage.totalKb, fmt.num)}</b> <span>in attachments</span>
            </span>
            <span>
              <Leaf aria-hidden="true" /> <b>{fmt.num(storage.carbonGramsYear)}</b> <span>g CO₂e per year (estimate)</span>
            </span>
            {storage.offloadedKb > 0 && (
              <span>
                <Archive aria-hidden="true" /> <b>{fmtSize(storage.offloadedKb, fmt.num)}</b> <span>already moved to Drive</span>
              </span>
            )}
          </div>
          <ul className="ml-store">
            {storage.items.slice(0, 6).map((i) => (
              <li key={i.attachment.id}>
                <span className="ml-store__icon" aria-hidden="true">
                  <KindIcon kind={i.attachment.kind} />
                </span>
                <span className="ml-store__name">
                  <b data-no-i18n>{i.attachment.name}</b>
                  <span data-no-i18n>{i.subject}</span>
                </span>
                <Bar value={i.attachment.sizeKb / Math.max(1, storage.items[0]?.attachment.sizeKb ?? 1)} label="Size" />
                <span className="ml-store__size">{fmtSize(i.attachment.sizeKb, fmt.num)}</span>
                <button
                  type="button"
                  className="neo-btn neo-btn--ghost neo-btn--xs"
                  onClick={() => {
                    offloadAttachments([i.attachment.id]);
                    toast.success('Moved to Drive', i.attachment.name);
                  }}
                >
                  <Archive /> <span>Offload</span>
                </button>
              </li>
            ))}
          </ul>
        </NeoPanel>
      </div>
    </div>
  );
}

function CountMinutes({ mins }: { mins: number }) {
  const fmt = useFmt();
  return (
    <>
      <b>{fmt.num(mins)}</b> <small>min</small>
    </>
  );
}

/** Larger reply-time trend with week labels. */
function TrendChart({ data }: { data: number[] }) {
  const fmt = useFmt();
  const w = 560;
  const h = 150;
  const pad = 24;
  const max = Math.max(...data) * 1.1;
  const min = 0;
  const x = (i: number) => pad + (i / (data.length - 1)) * (w - pad * 2);
  const y = (v: number) => h - pad - ((v - min) / (max - min || 1)) * (h - pad * 2);
  const line = data.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = `${line} L${x(data.length - 1)},${h - pad} L${x(0)},${h - pad} Z`;
  return (
    <div className="ml-trend">
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label="Median reply minutes by week">
        <defs>
          <linearGradient id="ml-trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--app-c1)" stopOpacity="0.4" />
            <stop offset="100%" stopColor="var(--app-c1)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((k) => (
          <line key={k} x1={pad} x2={w - pad} y1={pad + k * (h - pad * 2)} y2={pad + k * (h - pad * 2)} className="ml-trend__grid" />
        ))}
        <path d={area} fill="url(#ml-trend-fill)" />
        <path d={line} className="ml-trend__line" />
        {data.map((v, i) => (
          <circle key={i} cx={x(i)} cy={y(v)} r={i === data.length - 1 ? 5 : 3} className="ml-trend__dot" data-last={i === data.length - 1 || undefined} />
        ))}
      </svg>
      <div className="ml-trend__labels" aria-hidden="true">
        {data.map((v, i) => (
          <span key={i}>
            <b>{fmt.num(v)}</b>
            <small>{i === data.length - 1 ? 'Now' : fmt.locale === 'ar' ? arWeeksAgo(data.length - 1 - i, fmt.num) : `W-${data.length - 1 - i}`}</small>
          </span>
        ))}
      </div>
    </div>
  );
}
