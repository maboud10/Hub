/**
 * Helix Mail — "Nova Inbox"
 * NEO shell for /mail/*: Nova-ranked triage, approvals that act in place,
 * a trust-radar Screener, Later (snoozed · scheduled · follow-ups), Sent,
 * shared team inboxes and Insights linked to Wellbeing.
 */
import '@/styles/neo.css';
import '@/styles/mail.css';
import { useEffect, useMemo, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router';
import { BarChart3, CalendarClock, CalendarDays, Inbox, Mail, MessagesSquare, PenSquare, RotateCcw, Send, ShieldQuestion, Users } from 'lucide-react';
import { NeoAppFrame, isNavActive, type NeoNavItem } from '@/components/neo';
import { useNow } from '@/hooks/useNow';
import { firstName, greeting } from '@/lib/format';
import { useHub } from '@/store/hub';
import { useSessionUser } from '@/store/selectors';
import { parseComposeLink } from '@/mail/link';
import { followUpRadar, inInbox, visibleMailboxes } from '@/mail/engine';
import { SHARED_MAILBOXES } from '@/mail/seed';
import { useMail } from '@/mail/store';
import { syncLiveApprovals } from '@/mail/approvals';
import { ComposerDock, UndoBar } from './Composer';
import { InboxView } from './InboxView';
import { InsightsView } from './InsightsView';
import { LaterView } from './LaterView';
import { MAIL_TINT, ShortcutsOverlay, useMailCtx, useMailKeys } from './parts';
import { ScreenerView } from './ScreenerView';
import { SentView } from './SentView';
import { SharedView } from './SharedView';
import { openComposer, useMailUi } from './ui';

interface SectionMeta {
  to: string;
  end?: boolean;
  icon: ReactNode;
  eyebrow: string;
  title: string;
  sub: string;
}

const SECTIONS: SectionMeta[] = [
  {
    to: '/mail',
    end: true,
    icon: <Mail />,
    eyebrow: 'Mail deck',
    title: 'Nova Inbox',
    sub: 'Nova-ranked triage, approvals that act in place and a Screener that keeps strangers (and phish) out.',
  },
  {
    to: '/mail/screener',
    icon: <ShieldQuestion />,
    eyebrow: 'Mail deck · Screener',
    title: 'First-contact Screener',
    sub: 'Nova trust radar checks SPF, DKIM, DMARC, domain age and lookalike domains before anyone new reaches you.',
  },
  {
    to: '/mail/later',
    icon: <CalendarClock />,
    eyebrow: 'Mail deck · Later',
    title: 'Snoozed, Scheduled & Follow-ups',
    sub: 'A wake-up timeline, scheduled sends that respect quiet hours and a radar for replies that never came.',
  },
  {
    to: '/mail/sent',
    icon: <Send />,
    eyebrow: 'Mail deck · Sent',
    title: 'Sent & Delivery',
    sub: 'Privacy-first delivery states (no read tracking), follow-up nudges and your scheduled-send history.',
  },
  {
    to: '/mail/shared',
    icon: <Users />,
    eyebrow: 'Mail deck · Shared',
    title: 'Shared Inboxes',
    sub: 'SLA rings, collision detection, internal notes and one-click Helpdesk tickets for team mailboxes.',
  },
  {
    to: '/mail/insights',
    icon: <BarChart3 />,
    eyebrow: 'Mail deck · Insights',
    title: 'Mail Insights & Rhythm',
    sub: 'Reply-time trends, after-hours sending linked to Wellbeing, newsletter clutter and email carbon.',
  },
];

/** Resolve deep-link recipients: hub ids stay, hub emails become ids, other emails stay raw. */
function resolveLinkRecipients(list: string[]): string[] {
  const users = useHub.getState().users;
  return list.map((x) => {
    if (users.some((u) => u.id === x)) return x;
    const byEmail = users.find((u) => u.email.toLowerCase() === x.toLowerCase());
    return byEmail?.id ?? x;
  });
}

export function MailPage() {
  const me = useSessionUser();
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const ctx = useMailCtx();
  const now = useNow(30_000);

  const ownerId = useMail((s) => s.ownerId);
  const threads = useMail((s) => s.threads);
  const prefs = useMail((s) => s.prefs);
  const shared = useMail((s) => s.shared);
  const resetDemo = useMail((s) => s.resetDemo);
  const ensureOwner = useMail((s) => s.ensureOwner);

  // The signed-in person owns the mailbox (persona switching keeps each mailbox).
  useEffect(() => {
    if (me?.id) ensureOwner(me.id);
  }, [me?.id, ensureOwner]);

  // Pull live approvals (Procurement, HR, Expenses, Talent) so counts, the brief and rhythm are real from the first paint.
  useEffect(() => {
    const viewer = ctx.viewer;
    if (!viewer || ownerId !== viewer.user.id) return;
    const at = useMail.getState().liveApprovalsAt;
    if (at && Date.now() - at < 60_000) return;
    void syncLiveApprovals(viewer, ctx.users).catch(() => undefined);
  }, [ownerId, ctx.viewer, ctx.users]);

  // Wake snoozed mail, fire due scheduled sends and expired undo windows.
  useEffect(() => {
    const run = () => useMail.getState().tick();
    run();
    const id = window.setInterval(run, 15_000);
    return () => window.clearInterval(id);
  }, []);

  // Compose deep link: /mail?compose=1&to=u-omar,grace.liu@helix.co&subject=…&body=…
  useEffect(() => {
    const link = parseComposeLink(search);
    if (!link || !me) return;
    openComposer({ to: resolveLinkRecipients(link.to), cc: resolveLinkRecipients(link.cc), subject: link.subject, body: link.body });
    const p = new URLSearchParams(search);
    ['compose', 'to', 'cc', 'subject', 'body'].forEach((k) => p.delete(k));
    const rest = p.toString();
    navigate(`${pathname}${rest ? `?${rest}` : ''}`, { replace: true });
  }, [search, pathname, navigate, me]);

  // Mail-wide keys: c = compose, ? = shortcuts.
  useMailKeys({
    c: () => openComposer(),
    '?': () => useMailUi.getState().setShortcuts(true),
  });

  const counts = useMemo(() => {
    if (ownerId !== me?.id) return { inbox: 0, screener: 0, later: 0, shared: 0 };
    const inbox = threads.filter((t) => t.stream === 'priority' && t.unread && inInbox(t, now, prefs)).length;
    const screener = new Set(threads.filter((t) => t.folder === 'screener').map((t) => t.messages[0]?.from)).size;
    const later = followUpRadar(threads, ownerId, now).filter((f) => f.due).length;
    const boxes = ctx.viewer ? visibleMailboxes(SHARED_MAILBOXES, { id: ctx.viewer.user.id, department: ctx.viewer.user.department, perms: ctx.viewer.perms }) : [];
    const ids = new Set(boxes.map((b) => b.mailbox.id));
    const sharedNew = shared.filter((c) => ids.has(c.mailboxId) && c.status === 'new').length;
    return { inbox, screener, later, shared: sharedNew };
  }, [threads, prefs, shared, now, ownerId, me?.id, ctx.viewer]);

  const items: NeoNavItem[] = [
    { to: '/mail', label: 'Inbox', icon: <Inbox />, end: true, badge: counts.inbox || null, title: 'Nova Inbox · Priority triage, approvals & morning brief' },
    { to: '/mail/screener', label: 'Screener', icon: <ShieldQuestion />, badge: counts.screener || null, badgeTone: 'danger', title: 'First-contact Screener with Nova trust radar' },
    { to: '/mail/later', label: 'Later', icon: <CalendarClock />, badge: counts.later || null, title: 'Snoozed, scheduled sends, follow-up radar & reminders' },
    { to: '/mail/sent', label: 'Sent', icon: <Send />, title: 'Sent mail & privacy-first delivery states' },
    { to: '/mail/shared', label: 'Shared', icon: <Users />, badge: counts.shared || null, title: 'Shared team inboxes with SLA & collision detection' },
    { to: '/mail/insights', label: 'Insights', icon: <BarChart3 />, title: 'Mail insights, rhythm & email carbon' },
  ];

  const section = SECTIONS.find((s) => isNavActive(s, pathname)) ?? SECTIONS[0];
  const isHome = section.to === '/mail';

  const actions = (
    <>
      <button type="button" className="neo-btn neo-btn--soft" onClick={resetDemo} title="Reset Mail demo data">
        <RotateCcw />
        <span className="neo-btn__label">Reset Demo</span>
      </button>
      <button type="button" className="neo-btn neo-btn--plasma" onClick={() => openComposer()} title="Compose (C)" data-qa="mail-compose-btn">
        <PenSquare />
        <span className="neo-btn__label">Compose</span>
        <kbd className="kbd ml-kbd-inline" aria-hidden="true">
          C
        </kbd>
      </button>
    </>
  );

  return (
    <NeoAppFrame
      app="mail"
      tint={MAIL_TINT}
      className="mail-page"
      brand={{ icon: <Mail />, label: 'Helix Mail', to: '/mail' }}
      items={items}
      footer={[
        { to: '/calendar', label: 'Calendar', icon: <CalendarDays />, title: 'Open Helix Calendar' },
        { to: '/chat', label: 'Chat', icon: <MessagesSquare />, title: 'Open Pulse Chat' },
      ]}
      head={{
        icon: section.icon,
        eyebrow: section.eyebrow,
        title: isHome ? `${greeting()}${me ? `, ${firstName(me.name)}` : ''}` : section.title,
        sub: section.sub,
        actions,
      }}
      pad={!isHome}
      bodyClassName={isHome ? 'ml-body-home' : undefined}
      overlays={
        <>
          <ComposerDock />
          <UndoBar />
          <ShortcutsOverlay />
        </>
      }
    >
      <Routes>
        <Route index element={<InboxView />} />
        <Route path="screener" element={<ScreenerView />} />
        <Route path="later" element={<LaterView />} />
        <Route path="sent" element={<SentView />} />
        <Route path="shared" element={<SharedView />} />
        <Route path="insights" element={<InsightsView />} />
        <Route path="*" element={<Navigate to="/mail" replace />} />
      </Routes>
    </NeoAppFrame>
  );
}

export default MailPage;
