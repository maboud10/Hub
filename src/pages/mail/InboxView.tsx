/**
 * Helix Mail — Inbox (home): Nova Morning Brief + Inbox-Zero orbit on top of a
 * three-pane triage cockpit (streams · Nova-ranked list · reading pane), with
 * search operators, bulk actions and Superhuman-style keyboard triage.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import {
  Archive,
  ArrowDownWideNarrow,
  ChevronDown,
  ChevronUp,
  Clock3,
  Flame,
  Inbox,
  Keyboard,
  MailOpen,
  Paperclip,
  RefreshCw,
  Sparkles,
  Square,
  SquareCheckBig,
  Star,
  Tag,
  Trash2,
  Wand2,
  X,
} from 'lucide-react';
import { Chip, CountUp, NeoEmpty, NeoMenu, NeoPopover, NeoSearch, useTypewriter, type MenuEntry } from '@/components/neo';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useNow } from '@/hooks/useNow';
import { burstConfetti } from '@/lib/confetti';
import { AR_PERSON_NAMES, translateToArabic, useI18n } from '@/lib/i18n';
import { toast } from '@/store/toast';
import {
  STREAM_ORDER,
  buildBrief,
  digestWindow,
  heldByDigest,
  inInbox,
  isEmptySearch,
  lastInbound,
  lastMessage,
  matchesSearch,
  mergeApprovals,
  parseSearch,
  rankThread,
  rankThreads,
  snippetOf,
  streamCounts,
  threadTime,
  toClear,
  type RankedThread,
} from '@/mail/engine';
import { buildRankContext, useMail } from '@/mail/store';
import type { MailStream, MailThread } from '@/mail/types';
import { ApprovalsDeck } from './ApprovalsDeck';
import { ContactAvatar, ReasonChip, STREAM_META, SnoozeList, firstOf, useFmt, useMailCtx, useMailKeys, type MailCtx } from './parts';
import { ReadingPane } from './ReadingPane';
import { composeFor, useMailUi } from './ui';

const ORG_AR: Record<string, string> = { 'Emirates Group': 'مجموعة الإمارات', Aramex: 'أرامكس', 'DP World': 'موانئ دبي العالمية', Helix: 'هيليكس' };
const BASE_LABELS = ['Customers', 'Security', 'Finance', 'Board', 'Hiring', 'Ops', 'Product', 'Vendors', 'Travel', 'Press', 'People'];

export function InboxView() {
  const ctx = useMailCtx();
  const navigate = useNavigate();
  const [sp, setSp] = useSearchParams();
  const now = useNow(30_000);
  const fmt = useFmt();
  const isPhone = useMediaQuery('(max-width: 860px)');

  const ownerId = useMail((s) => s.ownerId);
  const threads = useMail((s) => s.threads);
  const prefs = useMail((s) => s.prefs);
  const approvals = useMail((s) => s.approvals);
  const liveApprovals = useMail((s) => s.liveApprovals);
  const decisions = useMail((s) => s.decisions);
  const { archive, trash, snooze, setRead, toggleLabel, moveToStream, openThread, toggleStar, setPrefs, celebrateZero } = useMail.getState();

  const [stream, setStream] = useState<MailStream>(() => (STREAM_ORDER.includes(sp.get('stream') as MailStream) ? (sp.get('stream') as MailStream) : 'priority'));
  const [cursor, setCursor] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const [snoozeFor, setSnoozeFor] = useState<{ anchor: HTMLElement | null; ids: string[] } | null>(null);
  const [celebrating, setCelebrating] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const ready = ownerId === ctx.ownerId;
  const rankCtx = useMemo(() => buildRankContext(ownerId, ctx.users, ctx.contacts, now), [ownerId, ctx.users, ctx.contacts, now]);
  const counts = useMemo(() => streamCounts(threads, now, prefs), [threads, now, prefs]);
  const approvalsView = useMemo(() => mergeApprovals(liveApprovals, approvals, decisions, now), [liveApprovals, approvals, decisions, now]);
  const parsed = useMemo(() => parseSearch(q), [q]);
  const searching = !isEmptySearch(parsed);

  const resolveStr = useMemo(() => {
    return (k: string) => {
      const c = ctx.resolve(k);
      return `${c.name} ${c.email} ${c.org}`;
    };
  }, [ctx]);

  const list: RankedThread[] = useMemo(() => {
    if (searching) {
      return threads
        .filter((t) => !['trash', 'screener', 'quarantine', 'spam'].includes(t.folder) && matchesSearch(t, parsed, resolveStr, now))
        .map((t) => rankThread(t, rankCtx))
        .sort((a, b) => threadTime(b.thread) - threadTime(a.thread));
    }
    const inbox = threads.filter((t) => inInbox(t, now, prefs) && t.stream === stream);
    if (stream === 'priority') return rankThreads(inbox, rankCtx);
    return inbox.map((t) => rankThread(t, rankCtx)).sort((a, b) => threadTime(b.thread) - threadTime(a.thread));
  }, [threads, stream, searching, parsed, resolveStr, rankCtx, now, prefs]);

  const allRanked = useMemo(() => rankThreads(threads.filter((t) => inInbox(t, now, prefs)), rankCtx), [threads, rankCtx, now, prefs]);
  const remaining = useMemo(() => toClear(threads, now).length, [threads, now]);
  const sweepIds = useMemo(
    () => allRanked.filter((r) => (r.thread.stream === 'updates' || r.thread.stream === 'other') && r.score < 40 && !r.thread.starred && now - threadTime(r.thread) > 2 * 3_600_000).map((r) => r.thread.id),
    [allRanked, now],
  );
  const screenerCount = useMemo(() => new Set(threads.filter((t) => t.folder === 'screener').map((t) => t.messages[0]?.from)).size, [threads]);

  // Deep links: ?thread=<id> opens a thread, ?stream=approvals picks a stream.
  useEffect(() => {
    const tid = sp.get('thread');
    const st = sp.get('stream') as MailStream | null;
    if (!tid && !st) return;
    if (!ready) return;
    if (st && STREAM_ORDER.includes(st)) setStream(st);
    if (tid) {
      const t = threads.find((x) => x.id === tid);
      if (t) {
        if (inInbox(t, now, prefs)) setStream(t.stream);
        else setPinned(t.id);
        setQ('');
        setCursor(t.id);
        setReading(true);
        openThread(t.id);
      } else toast.warning('Thread not found', tid);
    }
    const next = new URLSearchParams(sp);
    next.delete('thread');
    next.delete('stream');
    setSp(next, { replace: true });
  }, [sp, ready]); // eslint-disable-line react-hooks/exhaustive-deps -- react to new deep links only

  const current = useMemo(() => threads.find((t) => t.id === cursor) ?? null, [threads, cursor]);

  // Keep a selection on desktop (the reading pane follows the cursor, Superhuman-style).
  const pendingDeepLink = sp.has('thread');
  useEffect(() => {
    if (pendingDeepLink) return; // the deep-link effect owns the cursor this commit
    if (stream === 'approvals' && !searching) return;
    const inList = list.some((r) => r.thread.id === cursor);
    if ((cursor && inList) || (cursor && cursor === pinned)) return;
    if (!isPhone) setCursor(list[0]?.thread.id ?? null);
    else if (cursor && !inList) {
      setCursor(null);
      setReading(false);
    }
  }, [list, cursor, pinned, isPhone, stream, searching, pendingDeepLink]);

  // Mark read once a thread has been on screen for a moment.
  useEffect(() => {
    if (!current?.unread) return;
    if (isPhone && !reading) return;
    const id = window.setTimeout(() => openThread(current.id), 650);
    return () => window.clearTimeout(id);
  }, [current?.id, current?.unread, isPhone, reading, openThread]);

  // Inbox zero → aurora + streak.
  const prevRemaining = useRef(remaining);
  useEffect(() => {
    if (ready && prevRemaining.current > 0 && remaining === 0) {
      const streak = celebrateZero();
      setCelebrating(true);
      burstConfetti();
      toast.success('Inbox zero', `🔥 ${fmt.num(streak)} · Day streak`);
      const id = window.setTimeout(() => setCelebrating(false), 5200);
      prevRemaining.current = remaining;
      return () => window.clearTimeout(id);
    }
    prevRemaining.current = remaining;
  }, [remaining, ready, celebrateZero]);

  const select = (id: string, open = true) => {
    setCursor(id);
    if (id !== pinned) setPinned(null);
    if (open) setReading(true);
  };

  const move = (delta: number) => {
    if (!list.length) return;
    const idx = list.findIndex((r) => r.thread.id === cursor);
    const next = list[Math.max(0, Math.min(list.length - 1, idx < 0 ? 0 : idx + delta))];
    if (!next) return;
    setCursor(next.thread.id);
    requestAnimationFrame(() => document.getElementById(`ml-row-${next.thread.id}`)?.querySelector<HTMLElement>('.ml-row__main')?.focus({ preventScroll: false }));
  };

  const targetIds = () => (checked.size ? [...checked] : current ? [current.id] : []);

  const afterRemove = (ids: string[]) => {
    if (cursor && ids.includes(cursor)) {
      const idx = list.findIndex((r) => r.thread.id === cursor);
      const rest = list.filter((r) => !ids.includes(r.thread.id));
      const next = rest[Math.min(idx, rest.length - 1)];
      setCursor(next?.thread.id ?? null);
      if (!next) setReading(false);
    }
    setChecked((c) => new Set([...c].filter((x) => !ids.includes(x))));
  };

  const doArchive = (ids: string[]) => {
    if (!ids.length) return;
    archive(ids);
    afterRemove(ids);
    if (ids.length === 1) toast.success('Archived');
    else toast.success('Threads archived', fmt.num(ids.length));
  };
  const doTrash = (ids: string[]) => {
    if (!ids.length) return;
    trash(ids);
    afterRemove(ids);
    if (ids.length === 1) toast.info('Moved to trash');
    else toast.info('Threads moved to trash', fmt.num(ids.length));
  };
  const doSnooze = (ids: string[], at: number) => {
    snooze(ids, at);
    afterRemove(ids);
    setSnoozeFor(null);
    toast.success('Snoozed', fmt.dayTime(at));
  };
  const openSnooze = (ids: string[]) => {
    if (!ids.length) return;
    const anchor = (document.getElementById(`ml-row-${ids[0]}`) as HTMLElement | null) ?? document.querySelector<HTMLElement>('.ml-read__snooze');
    setSnoozeFor({ anchor, ids });
  };
  const toggleCheck = (id: string) =>
    setChecked((c) => {
      const n = new Set(c);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  useMailKeys({
    j: () => move(1),
    k: () => move(-1),
    arrowdown: () => move(1),
    arrowup: () => move(-1),
    enter: () => current && select(current.id),
    o: () => current && select(current.id),
    e: () => doArchive(targetIds()),
    s: () => openSnooze(targetIds()),
    '#': () => doTrash(targetIds()),
    x: () => current && toggleCheck(current.id),
    '/': () => searchRef.current?.focus(),
    escape: () => {
      if (reading && isPhone) setReading(false);
      else if (checked.size) setChecked(new Set());
      else if (q) setQ('');
    },
    ...(current
      ? {
          r: () => composeFor(current, 'reply', ownerId),
          a: () => composeFor(current, 'replyAll', ownerId),
          f: () => composeFor(current, 'forward', ownerId),
        }
      : {}),
  });

  const labels = useMemo(() => [...new Set([...BASE_LABELS, ...threads.flatMap((t) => t.labels)])].sort(), [threads]);
  const labelMenu: MenuEntry[] = labels.map((l) => ({ label: l, icon: <Tag />, onSelect: () => toggleLabel([...checked], l) }));
  const moveMenu: MenuEntry[] = STREAM_ORDER.filter((s) => s !== 'approvals').map((s) => ({ label: STREAM_META[s].label, icon: STREAM_META[s].icon, onSelect: () => moveToStream([...checked], s) }));

  const showApprovals = stream === 'approvals' && !searching;
  const allChecked = list.length > 0 && list.every((r) => checked.has(r.thread.id));

  return (
    <div className="ml-home" data-phone={isPhone || undefined}>
      <section className="ml-hero" data-collapsed={prefs.briefCollapsed || undefined} aria-label="Nova morning brief">
        <NovaBrief
          ctx={ctx}
          ownerId={ownerId}
          ranked={allRanked}
          approvals={approvalsView.pending.length}
          screener={screenerCount}
          feedCount={counts.feed.total}
          feedHeld={heldByDigest(threads, now)}
          digestOn={prefs.feedDigest}
          collapsed={prefs.briefCollapsed}
          onToggle={() => setPrefs({ briefCollapsed: !prefs.briefCollapsed })}
          onJump={(chip) => {
            if (chip.kind === 'thread') {
              const t = threads.find((x) => x.id === chip.target);
              if (t) {
                setQ('');
                setStream(t.stream);
                select(t.id);
              }
            } else if (chip.kind === 'stream') {
              setQ('');
              setStream(chip.target as MailStream);
            } else navigate(chip.target);
          }}
        />
        <ZeroOrbit
          remaining={remaining}
          streak={prefs.zeroStreak}
          celebrating={celebrating}
          sweepCount={sweepIds.length}
          onSweep={() => {
            archive(sweepIds);
            afterRemove(sweepIds);
            toast.success('Nova sweep complete', `${fmt.num(sweepIds.length)} · Threads archived`);
          }}
        />
      </section>

      <div className="ml-cockpit" data-reading={(reading && !!current) || undefined} data-wide={showApprovals || undefined}>
        <nav className="ml-streams" aria-label="Streams">
          <div className="ml-streams__list" role="tablist" aria-orientation={isPhone ? 'horizontal' : 'vertical'} aria-label="Streams">
            {STREAM_ORDER.map((s) => {
              const meta = STREAM_META[s];
              const total = s === 'approvals' ? approvalsView.pending.length : counts[s].total;
              const unread = s === 'approvals' ? approvalsView.pending.length : counts[s].unread;
              return (
                <button
                  key={s}
                  type="button"
                  role="tab"
                  aria-selected={!searching && stream === s}
                  className="ml-stream"
                  data-stream={s}
                  title={meta.hint}
                  onClick={() => {
                    setQ('');
                    setStream(s);
                    setChecked(new Set());
                    setReading(false);
                  }}
                >
                  <span className="ml-stream__icon" aria-hidden="true">
                    {meta.icon}
                  </span>
                  <span className="ml-stream__label">{meta.label}</span>
                  {total > 0 && (
                    <span className="ml-stream__count" data-unread={unread > 0 || undefined}>
                      {fmt.num(total)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="ml-streams__foot">
            {prefs.feedDigest ? (
              <span className="ml-streams__note">
                <Clock3 aria-hidden="true" /> <span>Feed digest</span> <b>{fmt.time(digestWindow(now).next)}</b>
              </span>
            ) : (
              <span className="ml-streams__note">
                <Sparkles aria-hidden="true" /> <span>Nova-ranked</span>
              </span>
            )}
            <button type="button" className="ml-streams__keys" onClick={() => useMailUi.getState().setShortcuts(true)}>
              <Keyboard aria-hidden="true" /> <span>Shortcuts</span> <kbd className="kbd">?</kbd>
            </button>
          </div>
        </nav>

        {showApprovals ? (
          <div className="ml-wide" role="tabpanel" aria-label="Approvals">
            <ApprovalsDeck view={approvalsView} />
          </div>
        ) : (
          <>
            <section className="ml-list" role="tabpanel" aria-label={searching ? 'Search results' : STREAM_META[stream].label}>
              <header className="ml-list__head">
                <NeoSearch value={q} onChange={setQ} inputRef={searchRef} kbd="/" size="sm" placeholder="Search mail — from: has:attachment is:unread label:" label="Search mail" className="ml-search" />
                <div className="ml-list__bar">
                  <button
                    type="button"
                    className="neo-iconbtn neo-iconbtn--sm"
                    role="checkbox"
                    aria-checked={allChecked}
                    aria-label="Select all"
                    onClick={() => setChecked(allChecked ? new Set() : new Set(list.map((r) => r.thread.id)))}
                  >
                    {allChecked ? <SquareCheckBig /> : <Square />}
                  </button>
                  {searching ? (
                    <span className="ml-list__title">
                      <span>Results across all mail</span> <b>{fmt.num(list.length)}</b>
                    </span>
                  ) : (
                    <span className="ml-list__title">
                      {stream === 'priority' ? <ArrowDownWideNarrow aria-hidden="true" /> : STREAM_META[stream].icon}
                      <span>{stream === 'priority' ? 'Nova-ranked' : STREAM_META[stream].label}</span> <b>{fmt.num(list.length)}</b>
                    </span>
                  )}
                </div>
                {searching && (
                  <div className="ml-ops" aria-label="Search operators">
                    {(['from', 'to', 'label', 'has', 'is', 'in'] as const).flatMap((op) =>
                      parsed[op].map((v) => (
                        <Chip key={`${op}:${v}`} tone="app" size="sm">
                          <span className="neo-mono">{op}:</span>
                          {v}
                        </Chip>
                      )),
                    )}
                  </div>
                )}
              </header>

              {checked.size > 0 && (
                <div className="ml-bulk" role="toolbar" aria-label="Bulk actions">
                  <span className="ml-bulk__count">
                    <b>{fmt.num(checked.size)}</b> <span>selected</span>
                  </span>
                  <button type="button" className="neo-btn neo-btn--soft neo-btn--xs" onClick={() => doArchive([...checked])}>
                    <Archive /> <span>Archive</span>
                  </button>
                  <button type="button" className="neo-btn neo-btn--soft neo-btn--xs" onClick={() => openSnooze([...checked])}>
                    <Clock3 /> <span>Snooze</span>
                  </button>
                  <button type="button" className="neo-btn neo-btn--soft neo-btn--xs" onClick={() => setRead([...checked], true)}>
                    <MailOpen /> <span>Mark read</span>
                  </button>
                  <NeoMenu
                    items={labelMenu}
                    label="Label"
                    trigger={(p) => (
                      <button {...p} type="button" className="neo-btn neo-btn--soft neo-btn--xs">
                        <Tag /> <span>Label</span> <ChevronDown />
                      </button>
                    )}
                  />
                  <NeoMenu
                    items={moveMenu}
                    label="Move to stream"
                    trigger={(p) => (
                      <button {...p} type="button" className="neo-btn neo-btn--soft neo-btn--xs">
                        <Inbox /> <span>Move</span> <ChevronDown />
                      </button>
                    )}
                  />
                  <button type="button" className="neo-iconbtn neo-iconbtn--sm" onClick={() => doTrash([...checked])} aria-label="Delete selected">
                    <Trash2 />
                  </button>
                  <button type="button" className="neo-iconbtn neo-iconbtn--sm" onClick={() => setChecked(new Set())} aria-label="Clear selection">
                    <X />
                  </button>
                </div>
              )}

              {list.length ? (
                <ul className="ml-rows" ref={listRef} aria-label="Threads">
                  {list.map((r) => (
                    <ThreadRow
                      key={r.thread.id}
                      r={r}
                      ctx={ctx}
                      now={now}
                      active={r.thread.id === cursor}
                      checked={checked.has(r.thread.id)}
                      onCheck={() => toggleCheck(r.thread.id)}
                      onOpen={() => select(r.thread.id)}
                      onStar={() => toggleStar(r.thread.id)}
                    />
                  ))}
                </ul>
              ) : (
                <div className="ml-list__empty">
                  <NeoEmpty icon={searching ? <RefreshCw /> : <Inbox />} title={searching ? 'No mail matches that search' : 'Nothing here — nicely done'} compact>
                    {searching ? <span>Try from:, has:attachment, is:unread or label:</span> : <span>New mail for this stream will land here.</span>}
                  </NeoEmpty>
                </div>
              )}
            </section>

            <section className="ml-read" aria-label="Reading pane">
              {current ? (
                <ReadingPane
                  key={current.id}
                  thread={current}
                  ctx={ctx}
                  rank={rankThread(current, rankCtx)}
                  now={now}
                  onBack={() => setReading(false)}
                  onArchive={() => doArchive([current.id])}
                  onTrash={() => doTrash([current.id])}
                  onSnooze={(el) => setSnoozeFor({ anchor: el, ids: [current.id] })}
                />
              ) : (
                <div className="ml-read__empty">
                  <NeoEmpty icon={<MailOpen />} title="Select a thread" compact>
                    <span>Use</span> <kbd className="kbd">j</kbd> <kbd className="kbd">k</kbd> <span>to move and</span> <kbd className="kbd">e</kbd> <span>to archive.</span>
                  </NeoEmpty>
                </div>
              )}
            </section>
          </>
        )}
      </div>

      <NeoPopover open={!!snoozeFor} anchor={snoozeFor?.anchor ?? null} onClose={() => setSnoozeFor(null)} placement="bottom-end" width={270} label="Snooze until">
        {snoozeFor && <SnoozeList onPick={(at) => doSnooze(snoozeFor.ids, at)} />}
      </NeoPopover>
    </div>
  );
}

/* ==========================================================================
   Thread row
   ========================================================================== */

function ThreadRow({
  r,
  ctx,
  now,
  active,
  checked,
  onCheck,
  onOpen,
  onStar,
}: {
  r: RankedThread;
  ctx: MailCtx;
  now: number;
  active: boolean;
  checked: boolean;
  onCheck: () => void;
  onOpen: () => void;
  onStar: () => void;
}) {
  const fmt = useFmt();
  const locale = useI18n((s) => s.locale);
  const t = r.thread;
  const last = lastMessage(t);
  const lead = lastInbound(t, ctx.ownerId) ?? last;
  const people = [...new Set(t.messages.map((m) => m.from))];
  const names = people.map((k) => (k === ctx.ownerId ? 'me' : firstOf(ctx.resolve(k).name))).slice(-3);
  const hasAtt = t.messages.some((m) => m.attachments?.length);
  const subject = locale === 'ar' && t.ar ? t.ar.subject : t.subject;
  const snippet = locale === 'ar' && t.ar ? t.ar.bodies[t.ar.bodies.length - 1] : last.body;
  return (
    <li id={`ml-row-${t.id}`} className="ml-row" data-unread={t.unread || undefined} data-active={active || undefined} data-checked={checked || undefined}>
      <button type="button" className="ml-row__check" role="checkbox" aria-checked={checked} aria-label="Select thread" onClick={onCheck}>
        {checked ? <SquareCheckBig /> : <Square />}
      </button>
      <button type="button" className="ml-row__main" onClick={onOpen} aria-current={active || undefined}>
        <ContactAvatar c={ctx.resolve(lead.from)} size={34} presence />
        <span className="ml-row__body">
          <span className="ml-row__top">
            <span className="ml-row__from">
              {names.map((n, i) => (
                <span key={`${n}-${i}`}>
                  {i > 0 && (locale === 'ar' ? '، ' : ', ')}
                  {n === 'me' ? <span>me</span> : n}
                </span>
              ))}
            </span>
            {t.messages.length > 1 && <span className="ml-row__n">{fmt.num(t.messages.length)}</span>}
            <span className="ml-row__time">{fmt.when(threadTime(t), now)}</span>
          </span>
          <span className="ml-row__subject" data-no-i18n dir="auto">
            {subject}
          </span>
          <span className="ml-row__snippet" data-no-i18n dir="auto">
            {snippetOf(snippet, 120)}
          </span>
          {(r.reasons.length > 0 || hasAtt || t.nova?.amount || t.labels.length > 0) && (
            <span className="ml-row__chips">
              {r.reasons.slice(0, 2).map((x) => (
                <ReasonChip key={x.id} r={x} now={now} />
              ))}
              {t.nova?.amount && (
                <Chip tone="slate" size="sm">
                  {t.nova.amount}
                </Chip>
              )}
              {hasAtt && <Paperclip className="ml-row__clip" aria-label="Has attachments" />}
              {t.labels.slice(0, r.reasons.length ? 1 : 2).map((l) => (
                <span key={l} className="ml-label">
                  {l}
                </span>
              ))}
            </span>
          )}
        </span>
      </button>
      <button type="button" className="ml-row__star" aria-label="Star thread" aria-pressed={t.starred} onClick={onStar}>
        <Star />
      </button>
    </li>
  );
}

/* ==========================================================================
   Nova Morning Brief
   ========================================================================== */

function NovaBrief({
  ctx,
  ownerId,
  ranked,
  approvals,
  screener,
  feedCount,
  feedHeld,
  digestOn,
  collapsed,
  onToggle,
  onJump,
}: {
  ctx: MailCtx;
  ownerId: string;
  ranked: RankedThread[];
  approvals: number;
  screener: number;
  feedCount: number;
  feedHeld: number;
  digestOn: boolean;
  collapsed: boolean;
  onToggle: () => void;
  onJump: (chip: ReturnType<typeof buildBrief>['chips'][number]) => void;
}) {
  const locale = useI18n((s) => s.locale);
  const fmt = useFmt();
  const [stamp, setStamp] = useState(0);
  const latest = useRef({ ranked, approvals, screener, feedCount, feedHeld, digestOn });
  latest.current = { ranked, approvals, screener, feedCount, feedHeld, digestOn };
  const ready = ranked.length > 0;
  // Live approvals land asynchronously on first load — re-snapshot once when they do.
  const liveLoaded = useMail((s) => s.liveApprovalsAt !== null);
  // Snapshot the brief (typing restarts only on refresh, language change or when live approvals first arrive).
  const brief = useMemo(() => {
    const l = latest.current;
    return buildBrief({
      locale,
      now: Date.now(),
      ranked: l.ranked,
      ownerId,
      approvals: l.approvals,
      screener: l.screener,
      feedCount: l.feedCount,
      feedHeld: l.feedHeld,
      digestOn: l.digestOn,
      nameOf: (k) => {
        const c = ctx.resolve(k);
        const n = c.hub ? firstOf(c.name) : c.name;
        return locale === 'ar' ? (AR_PERSON_NAMES[n] ?? AR_PERSON_NAMES[c.name] ?? translateToArabic(n)) : n;
      },
      orgOf: (k) => {
        const c = ctx.resolve(k);
        return locale === 'ar' ? (ORG_AR[c.org] ?? translateToArabic(c.org)) : c.org;
      },
      weekdayName: (ts) => fmt.weekdayLong(ts),
      isVip: (k) => !!ctx.resolve(k).vip,
    });
  }, [locale, stamp, ownerId, ready, liveLoaded]); // eslint-disable-line react-hooks/exhaustive-deps -- deliberate snapshot
  const [typed, done] = useTypewriter(collapsed ? '' : brief.text, 160);

  return (
    <div className="ml-brief neo-nova" data-no-i18n={undefined}>
      <div className="neo-nova__glow" aria-hidden="true" />
      <header className="ml-brief__head">
        <span className="neo-novaorb" aria-hidden="true">
          <i />
        </span>
        <div className="ml-brief__titles">
          <div className="neo-hud">Nova morning brief</div>
          <h2 className="ml-brief__title">
            {brief.count > 0 ? (
              <>
                <b>{fmt.num(brief.count)}</b> <span>{brief.count === 1 ? 'thing needs you' : 'things need you'}</span>
              </>
            ) : (
              <span>You’re on top of it</span>
            )}
          </h2>
        </div>
        <button type="button" className="neo-iconbtn neo-iconbtn--sm" onClick={() => setStamp((x) => x + 1)} aria-label="Refresh brief" title="Refresh brief">
          <RefreshCw />
        </button>
        <button type="button" className="neo-iconbtn neo-iconbtn--sm" onClick={onToggle} aria-label={collapsed ? 'Expand brief' : 'Collapse brief'} aria-expanded={!collapsed}>
          {collapsed ? <ChevronDown /> : <ChevronUp />}
        </button>
      </header>
      {!collapsed && (
        <>
          <p className="ml-brief__text" data-no-i18n dir="auto">
            <span aria-hidden="true">
              {typed}
              {!done && <i className="ml-caret" />}
            </span>
            <span className="neo-sr" aria-live="polite">
              {done ? brief.text : ''}
            </span>
          </p>
          <div className="ml-brief__chips" role="list" aria-label="Jump to">
            {brief.chips.map((c) => (
              <button key={c.id} type="button" role="listitem" className="ml-jump" data-tone={c.tone} onClick={() => onJump(c)} data-no-i18n>
                <Wand2 aria-hidden="true" />
                <span dir="auto">{c.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ==========================================================================
   Inbox-Zero orbit
   ========================================================================== */

function ZeroOrbit({ remaining, streak, celebrating, sweepCount, onSweep }: { remaining: number; streak: number; celebrating: boolean; sweepCount: number; onSweep: () => void }) {
  const fmt = useFmt();
  const dots = Math.min(remaining, 28);
  return (
    <div className="ml-orbit" data-zero={remaining === 0 || undefined} data-celebrate={celebrating || undefined}>
      <div className="ml-orbit__stage" role="img" aria-label={remaining === 0 ? 'Inbox zero' : `${fmt.num(remaining)} · Threads to clear`}>
        {remaining === 0 && <div className="ml-aurora" aria-hidden="true" />}
        <div className="ml-orbit__ring" aria-hidden="true" />
        <div className="ml-orbit__ring ml-orbit__ring--inner" aria-hidden="true" />
        <div className="ml-orbit__spin" aria-hidden="true">
          {Array.from({ length: dots }, (_, i) => (
            <i key={i} style={{ ['--i' as string]: i, ['--n' as string]: dots } as CSSProperties} />
          ))}
        </div>
        <div className="ml-orbit__core" aria-hidden="true">
          <b>
            <CountUp value={remaining} />
          </b>
          <span>to clear</span>
        </div>
      </div>
      <div className="ml-orbit__meta">
        <div className="neo-hud">Inbox zero orbit</div>
        {remaining === 0 ? (
          <strong className="ml-orbit__headline">Inbox zero</strong>
        ) : (
          <strong className="ml-orbit__headline">
            <b>{fmt.num(remaining)}</b> <span>threads in orbit</span>
          </strong>
        )}
        <span className="ml-orbit__streak">
          <Flame aria-hidden="true" /> <b>{fmt.num(streak)}</b> <span>day streak</span>
        </span>
        <button type="button" className="neo-btn neo-btn--nova neo-btn--xs" onClick={onSweep} disabled={!sweepCount} title="Archive low-signal updates Nova is confident you don’t need">
          <Wand2 /> <span>Nova sweep</span> {sweepCount > 0 && <span className="neo-count">{fmt.num(sweepCount)}</span>}
        </button>
      </div>
    </div>
  );
}

export type { MailThread };
