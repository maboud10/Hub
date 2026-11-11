import { beforeEach, describe, expect, it } from 'vitest';
import { SEED_ROLES } from '@/data/roles';
import { SEED_USERS } from '@/data/users';
import type { BridgeViewer } from '@/lib/appBridge';
import { effectivePermissions } from '@/lib/rbac';
import { useHub } from '@/store/hub';
import { DEFAULT_LOADERS, collectLiveApprovals, decideApproval, type ApprovalLoaders } from './approvals';
import {
  CARBON_G_PER_MB_YEAR,
  DAY,
  DEFAULT_QUIET,
  HOUR,
  PHISH_REVIEW_MS,
  UNDO_MS,
  afterHoursCount,
  arDays,
  atLocal,
  attachmentStorage,
  buildBrief,
  collision,
  detectLookalike,
  detectMeeting,
  digestWindow,
  dlpCheck,
  extractActions,
  inInbox,
  isExternalRecipient,
  isQuietAt,
  localHourIn,
  matchesSearch,
  median,
  mergeApprovals,
  newsletterClutter,
  nextQuietEnd,
  novaDraft,
  nudgeDraft,
  parseSearch,
  phishStage,
  rankThreads,
  reasonText,
  resolveContact,
  schedulePresets,
  sharedStage,
  slaState,
  smartRepliesFor,
  SNIPPETS,
  trustReport,
  visibleMailboxes,
  whenOnline,
} from './engine';
import { mailComposeHref, parseComposeLink } from './link';
import { api } from './public';
import { SHARED_MAILBOXES, buildMailSeed, seedContacts } from './seed';
import { buildRankContext, resolveRecipients, useMail } from './store';
import type { MailAttachment, MailThread } from './types';

const viewerFor = (id: string): BridgeViewer => {
  const user = SEED_USERS.find((u) => u.id === id)!;
  return { user, roles: SEED_ROLES, perms: effectivePermissions(user, SEED_ROLES) };
};
const noMail: BridgeViewer = { user: SEED_USERS[0], roles: [], perms: new Set(['app:chat']) };
const thread = (id: string) => useMail.getState().threads.find((t) => t.id === id)!;
const failing = (): Promise<never> => Promise.reject(new Error('offline'));
const allFailing: ApprovalLoaders = { procurement: failing, hr: failing, expenses: failing, talent: failing };

describe('Helix Mail · Nova Inbox', () => {
  beforeEach(() => {
    useMail.getState().ensureOwner('u-layla');
    useMail.getState().resetDemo();
    useMail.getState().ensureOwner('u-layla');
  });

  it('ranks the manager thread above newsletters and explains why with reason chips', () => {
    const now = Date.now();
    const seed = buildMailSeed('u-omar', SEED_USERS, now);
    const ctx = buildRankContext('u-omar', SEED_USERS, seed.contacts, now);
    expect(ctx.managerKey).toBe('u-layla');
    const ranked = rankThreads(seed.threads.filter((t) => t.folder === 'inbox'), ctx);
    const board = ranked.find((r) => r.thread.id === 'th-board-deck')!;
    const manager = board.reasons.find((r) => r.id === 'manager')!;
    expect(reasonText(manager, now)).toBe('From your manager');
    const newsletter = ranked.find((r) => r.thread.id === 'th-tldr')!;
    expect(board.score).toBeGreaterThan(newsletter.score);
    expect(ranked[0].score).toBeGreaterThanOrEqual(ranked[ranked.length - 1].score);
  });

  it('flags VIP customers, deadlines and people blocked', () => {
    const now = Date.now();
    const st = useMail.getState();
    const ctx = buildRankContext('u-layla', SEED_USERS, st.contacts, now);
    expect(ctx.managerKey).toBe('x-ceo');
    const ranked = rankThreads(st.threads.filter((t) => t.folder === 'inbox'), ctx);
    const emirates = ranked.find((r) => r.thread.id === 'th-emirates-sla')!;
    expect(emirates.reasons.map((r) => r.id)).toEqual(expect.arrayContaining(['vip', 'blocking']));
    expect(reasonText(emirates.reasons.find((r) => r.id === 'blocking')!, now)).toBe('Blocks 3 people');
    expect(reasonText(emirates.reasons.find((r) => r.id === 'vip')!, now)).toBe('VIP customer');
    const audit = ranked.find((r) => r.thread.id === 'th-q4-audit')!;
    expect(reasonText(audit.reasons.find((r) => r.id === 'deadline')!, now)).toMatch(/^Deadline (today|tomorrow|Fri)$/);
  });

  it('parses search operators (from:, has:, is:, label:, quoted values, free text)', () => {
    const p = parseSearch('from:grace has:attachment is:unread label:"Board deck" audit "access review" foo:bar');
    expect(p.from).toEqual(['grace']);
    expect(p.has).toEqual(['attachment']);
    expect(p.is).toEqual(['unread']);
    expect(p.label).toEqual(['board deck']);
    expect(p.text).toEqual(['audit', 'access review', 'foo:bar']);
  });

  it('filters threads with search operators', () => {
    const now = Date.now();
    const st = useMail.getState();
    const users = new Map(SEED_USERS.map((u) => [u.id, u]));
    const contacts = new Map(st.contacts.map((c) => [c.id, c]));
    const resolve = (k: string) => {
      const c = resolveContact(k, users, contacts);
      return `${c.name} ${c.email} ${c.org}`;
    };
    const hits = st.threads.filter((t) => matchesSearch(t, parseSearch('from:grace has:attachment'), resolve, now));
    expect(hits.map((t) => t.id)).toEqual(['th-q4-audit']);
    const security = st.threads.filter((t) => matchesSearch(t, parseSearch('is:unread label:security'), resolve, now)).map((t) => t.id);
    expect(security).toEqual(expect.arrayContaining(['th-mfa-rollout', 'th-okta-signin']));
    expect(st.threads.filter((t) => matchesSearch(t, parseSearch('"cargo tracking" from:emirates'), resolve, now)).map((t) => t.id)).toEqual(['th-emirates-sla']);
  });

  it('snoozes a thread out of the inbox and wakes it back up, unread', () => {
    const now = Date.now();
    useMail.getState().snooze(['th-q4-audit'], now + 60_000, now);
    expect(inInbox(thread('th-q4-audit'), now, useMail.getState().prefs)).toBe(false);
    const res = useMail.getState().tick(now + 61_000);
    expect(res.woke).toContain('th-q4-audit');
    const woke = thread('th-q4-audit');
    expect(woke.snoozedUntil).toBeNull();
    expect(woke.unread).toBe(true);
    expect(inInbox(woke, now + 61_000)).toBe(true);
  });

  it('schedules sends to respect quiet hours and recipients’ working hours', () => {
    const q = { enabled: true, startHour: 19, endHour: 8 };
    const at22 = atLocal(Date.now(), 0, 22);
    const at10 = atLocal(Date.now(), 0, 10);
    expect(isQuietAt(at22, q)).toBe(true);
    expect(isQuietAt(at10, q)).toBe(false);
    const end = nextQuietEnd(at22, q);
    expect(new Date(end).getHours()).toBe(8);
    expect(end - at22).toBeLessThan(11 * HOUR);
    const quiet = schedulePresets(at22, q, []).find((p) => p.id === 'quiet')!;
    expect(quiet.active).toBe(true);
    expect(quiet.at).toBe(end);
    expect(schedulePresets(at10, q, []).find((p) => p.id === 'quiet')!.at).toBe(at10);
    const london = whenOnline(at22, ['Europe/London']);
    expect(localHourIn('Europe/London', london)).toBeGreaterThanOrEqual(9);
    expect(localHourIn('Europe/London', london)).toBeLessThan(18);
    // The store holds the mail until quiet hours end, then sends it on tick.
    const id = useMail.getState().createDraft({ to: ['u-omar'], subject: 'Late idea', body: 'Can wait until morning.' });
    expect(useMail.getState().scheduleDraft(id, end, 'quiet-hours', at22).ok).toBe(true);
    const item = useMail.getState().scheduled.find((s) => s.draft.id === id)!;
    expect(item.reason).toBe('quiet-hours');
    expect(useMail.getState().tick(end + 1000).sent).toContain(item.id);
    expect(useMail.getState().threads.some((t) => t.subject === 'Late idea' && t.folder === 'sent')).toBe(true);
  });

  it('gives a 5-second undo window before mail actually leaves', () => {
    const now = Date.now();
    const id = useMail.getState().createDraft({ to: ['u-omar'], subject: 'Test undo', body: 'Hello Omar' });
    expect(useMail.getState().queueSend(id, now).ok).toBe(true);
    expect(useMail.getState().pending?.commitAt).toBe(now + UNDO_MS);
    expect(useMail.getState().drafts.some((d) => d.id === id)).toBe(false);
    expect(useMail.getState().undoSend()).toBe(id);
    expect(useMail.getState().drafts.some((d) => d.id === id)).toBe(true);
    expect(useMail.getState().threads.some((t) => t.subject === 'Test undo')).toBe(false);
    useMail.getState().queueSend(id, now);
    useMail.getState().tick(now + UNDO_MS - 1);
    expect(useMail.getState().pending).not.toBeNull();
    useMail.getState().tick(now + UNDO_MS + 10);
    expect(useMail.getState().pending).toBeNull();
    expect(useMail.getState().threads.find((t) => t.subject === 'Test undo')?.folder).toBe('sent');
    expect(useMail.getState().inbound['u-omar']?.[0]?.subject).toBe('Test undo');
  });

  it('delivers to hub recipients across persona switches', () => {
    const id = useMail.getState().createDraft({ to: ['u-omar'], subject: 'Persona check', body: 'Hi' });
    useMail.getState().queueSend(id);
    useMail.getState().commitSend();
    useMail.getState().ensureOwner('u-omar');
    const omar = useMail.getState();
    expect(omar.ownerId).toBe('u-omar');
    const got = omar.threads.find((t) => t.subject === 'Persona check')!;
    expect(got.folder).toBe('inbox');
    expect(got.messages[0].from).toBe('u-layla');
    useMail.getState().ensureOwner('u-layla');
    expect(useMail.getState().threads.find((t) => t.subject === 'Persona check')?.folder).toBe('sent');
  });

  it('DLP blocks confidential files to external recipients unless shared as a protected link', () => {
    const contacts = new Map(seedContacts().map((c) => [c.id, c]));
    const isExt = (k: string) => isExternalRecipient(k, contacts);
    const conf: MailAttachment = { id: 'a1', name: 'SoD.xlsx', kind: 'sheet', sizeKb: 10, sensitivity: 'confidential' };
    expect(dlpCheck({ to: ['x-aramex'], cc: [], attachments: [conf], sensitivity: 'internal' }, isExt).level).toBe('block');
    expect(dlpCheck({ to: ['u-grace', 'grace.liu@helix.co', 'x-ceo'], cc: [], attachments: [conf], sensitivity: 'internal' }, isExt).level).toBe('ok');
    expect(dlpCheck({ to: ['x-aramex'], cc: [], attachments: [{ ...conf, protectedLink: true }], sensitivity: 'internal' }, isExt).level).toBe('ok');
    expect(dlpCheck({ to: ['x-aramex'], cc: [], attachments: [conf], sensitivity: 'encrypted' }, isExt).level).toBe('warn');
    expect(dlpCheck({ to: ['partner@gmail.com'], cc: [], attachments: [{ ...conf, sensitivity: 'restricted' }], sensitivity: 'encrypted' }, isExt).level).toBe('block');
    const id = useMail.getState().createDraft({ to: ['lina.farouk@aramex.com'], subject: 'Matrix', body: 'Attached', attachments: [conf] });
    const res = useMail.getState().queueSend(id);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/DLP/);
  });

  it('trust radar catches lookalike domains and failing authentication', () => {
    expect(detectLookalike('he1ix-co.com')).toBe('helix.co');
    expect(detectLookalike('helixco-mail.com')).toBe('helix.co');
    expect(detectLookalike('aws-billing-support.co')).toBe('aws.amazon.com');
    expect(detectLookalike('emiratesnbd.com')).toBeNull();
    expect(detectLookalike('helix.co')).toBeNull();
    const contacts = seedContacts();
    const phish = trustReport(contacts.find((c) => c.id === 'x-phish-it')!);
    expect(phish.verdict).toBe('danger');
    expect(phish.lookalikeOf).toBe('helix.co');
    expect(phish.checks.find((c) => c.id === 'spf')!.ok).toBe(false);
    expect(trustReport(contacts.find((c) => c.id === 'x-maf')!).verdict).toBe('trusted');
  });

  it('screener allows into a destination, blocks, and reports phish into quarantine', () => {
    const now = Date.now();
    expect(useMail.getState().screen('x-maf', { kind: 'allow', destination: 'inbox' })).toEqual(['th-scr-maf']);
    expect(thread('th-scr-maf')).toMatchObject({ folder: 'inbox', stream: 'priority' });
    expect(useMail.getState().contacts.find((c) => c.id === 'x-maf')!.screener).toBe('allowed');
    useMail.getState().screen('x-menabytes', { kind: 'allow', destination: 'feed' });
    expect(thread('th-scr-menabytes').stream).toBe('feed');
    useMail.getState().screen('x-phish-ceo', { kind: 'block' });
    expect(thread('th-scr-phish-ceo').folder).toBe('spam');
    useMail.getState().screen('x-phish-it', { kind: 'report' }, now);
    expect(thread('th-scr-phish-it').folder).toBe('quarantine');
    const report = useMail.getState().phish['x-phish-it'];
    expect(phishStage(report, now)).toBe(2);
    expect(phishStage(report, now + PHISH_REVIEW_MS)).toBe(3);
  });

  it('shared inbox: claim, reply against SLA, collision detection and mailbox visibility', () => {
    const now = Date.now();
    const st = useMail.getState();
    expect(sharedStage(st.shared.find((c) => c.id === 'sh-it-vpn')!)).toBe(1);
    st.assignShared('sh-it-vpn', 'u-layla', now);
    let conv = useMail.getState().shared.find((c) => c.id === 'sh-it-vpn')!;
    expect(conv).toMatchObject({ status: 'assigned', assigneeId: 'u-layla' });
    expect(sharedStage(conv)).toBe(2);
    useMail.getState().replyShared('sh-it-vpn', 'Switch to the hotspot profile.', now + 1000);
    conv = useMail.getState().shared.find((c) => c.id === 'sh-it-vpn')!;
    expect(conv.status).toBe('waiting');
    expect(sharedStage(conv)).toBe(3);
    expect(slaState(conv, now + 2000).met).toBe(true);
    const screen = st.shared.find((c) => c.id === 'sh-it-screen')!;
    const phases = [0, 9000, 18000].map((dt) => collision(screen, 'u-layla', now + dt));
    expect(phases.every((p) => p.others[0]?.userId === 'u-mateo')).toBe(true);
    expect(phases.some((p) => p.typing)).toBe(true);
    expect(collision(screen, 'u-mateo', now).others).toHaveLength(0);
    expect(visibleMailboxes(SHARED_MAILBOXES, { id: 'u-mei', department: 'Design', perms: new Set(['app:mail']) })).toEqual([{ mailbox: SHARED_MAILBOXES[0], observer: true }]);
    expect(visibleMailboxes(SHARED_MAILBOXES, { id: 'u-noah', department: 'Sales', perms: new Set() }).map((m) => m.mailbox.id)).toEqual(['sales']);
    expect(visibleMailboxes(SHARED_MAILBOXES, viewerFor('u-layla') && { id: 'u-layla', perms: new Set(['*']) })).toHaveLength(4);
  });

  it('approvals fall back to seeded demo items when no source app has anything pending', async () => {
    const now = Date.now();
    const seeded = useMail.getState().approvals;
    const demo = mergeApprovals([], seeded, {}, now);
    expect(demo.mode).toBe('demo');
    expect(demo.pending).toHaveLength(seeded.length);
    const live = [{ ...seeded[0], id: 'ap-live-1', live: true }];
    expect(mergeApprovals(live, seeded, {}, now).pending.map((i) => i.id)).toEqual(['ap-live-1']);
    const caughtUp = mergeApprovals([], seeded, { 'ap-live-1': { decision: 'approved', at: now, item: live[0] } }, now);
    expect(caughtUp.mode).toBe('live');
    expect(caughtUp.pending).toHaveLength(0);
    expect(caughtUp.decided[0].id).toBe('ap-live-1');
    const offline = await collectLiveApprovals(viewerFor('u-layla'), SEED_USERS, allFailing);
    expect(offline.items).toEqual([]);
    expect(offline.errors).toEqual(['procurement', 'hr', 'expenses', 'talent']);
  });

  it('synthesizes live HR approvals for the viewer and approves through the HR Portal’s own action', async () => {
    useHub.setState({ sessionUserId: 'u-layla' });
    const res = await collectLiveApprovals(viewerFor('u-layla'), SEED_USERS, { ...allFailing, hr: DEFAULT_LOADERS.hr });
    const omarsLeave = res.items.find((i) => i.source === 'leave' && i.requesterId === 'u-omar')!;
    expect(omarsLeave).toBeDefined();
    expect(omarsLeave.relation).toBe('direct');
    expect(omarsLeave.live).toBe(true);
    const out = await decideApproval(omarsLeave, 'approved', undefined, DEFAULT_LOADERS);
    expect(out.ok).toBe(true);
    const { useHr } = await import('@/hr/store');
    expect(useHr.getState().leave.find((l) => l.id === omarsLeave.sourceId)?.status).toBe('approved');
  });

  it('rhythm() reports after-hours sends, unread load and median reply time', () => {
    const now = Date.now();
    const st = useMail.getState();
    const r = api.rhythm(viewerFor('u-layla'));
    expect(r.afterHoursSentThisWeek).toBe(afterHoursCount(st.sentLog, DEFAULT_QUIET, now - 7 * DAY, now + 1000));
    expect(r.afterHoursSentThisWeek).toBeGreaterThan(0);
    expect(r.avgReplyMins).toBe(Math.round(median(st.replyLog)));
    const unreadPriority = st.threads.filter((t) => t.stream === 'priority' && t.unread && inInbox(t, now, st.prefs)).length;
    expect(r.unread).toBe(unreadPriority + st.approvals.length);
    expect(api.rhythm(noMail)).toEqual({ afterHoursSentThisWeek: 0, unread: 0, avgReplyMins: 0 });
  });

  it('sendMail() is permission-gated, validates input and lands in Sent', () => {
    const denied = api.sendMail(noMail, { to: ['u-omar'], subject: 'Hi' });
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.error).toMatch(/Helix Mail access/);
    const v = viewerFor('u-layla');
    expect(api.sendMail(v, { to: [], subject: 'Hi' }).ok).toBe(false);
    expect(api.sendMail(v, { to: ['u-omar'], subject: '   ' }).ok).toBe(false);
    expect(api.sendMail(v, { to: ['not-an-email'], subject: 'Hi' }).ok).toBe(false);
    const ok = api.sendMail(v, {
      to: ['u-omar', 'lina.farouk@aramex.com', 'new.person@example.com'],
      subject: 'Offer letter ready',
      body: 'See the letter in Drive.',
      source: { app: 'hub', label: 'Talent Hub', to: '/talent' },
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.to).toBe(`/mail?thread=${ok.threadId}`);
      const t = thread(ok.threadId);
      expect(t.folder).toBe('sent');
      expect(t.messages[0].to).toEqual(['u-omar', 'x-aramex', 'x-new-person-example-com']);
      expect(t.source?.label).toBe('Talent Hub');
    }
  });

  it('palette entries are gated on app:mail and expose actions + top threads', () => {
    expect(api.paletteEntries(noMail)).toEqual([]);
    const entries = api.paletteEntries(viewerFor('u-layla'));
    const actions = entries.filter((e) => e.group === 'Actions').map((e) => e.to);
    expect(actions).toEqual(expect.arrayContaining(['/mail?compose=1', '/mail', '/mail/screener', '/mail?stream=approvals', '/mail/shared', '/mail/insights', '/mail/later']));
    const work = entries.filter((e) => e.group === 'Work');
    expect(work).toHaveLength(15);
    expect(work.every((w) => /^\/mail\?thread=th-/.test(w.to))).toBe(true);
    expect(new Set(entries.map((e) => e.id)).size).toBe(entries.length);
    // Another persona's palette is computed without switching the loaded mailbox.
    expect(api.paletteEntries(viewerFor('u-omar')).length).toBeGreaterThan(7);
    expect(useMail.getState().ownerId).toBe('u-layla');
  });

  it('compose deep links round-trip and resolve hub users by id or email', () => {
    const href = mailComposeHref({ to: ['u-omar', 'grace.liu@helix.co'], cc: 'lina.farouk@aramex.com', subject: 'Q4 sync & next steps', body: 'Hi,\nLine 2' });
    expect(href.startsWith('/mail?compose=1')).toBe(true);
    const parsed = parseComposeLink(href.split('?')[1])!;
    expect(parsed).toEqual({ to: ['u-omar', 'grace.liu@helix.co'], cc: ['lina.farouk@aramex.com'], subject: 'Q4 sync & next steps', body: 'Hi,\nLine 2' });
    expect(parseComposeLink('thread=th-1')).toBeNull();
    expect(resolveRecipients(parsed.to, SEED_USERS, seedContacts()).keys).toEqual(['u-omar', 'u-grace']);
    expect(resolveRecipients(parsed.cc, SEED_USERS, seedContacts()).keys).toEqual(['x-aramex']);
  });

  it('Nova extracts meetings and action items, and drafts in three tones with Arabic', () => {
    const now = Date.now();
    const m = detectMeeting('Can we get on a call Thursday 14:00 Dubai?', now)!;
    expect(m.label).toBe('Thursday 14:00 Dubai');
    expect(m.startHour).toBe(14);
    expect(m.dayOffset).toBeGreaterThanOrEqual(0);
    expect(m.dayOffset).toBeLessThanOrEqual(7);
    expect(detectMeeting('tomorrow at 3pm works', now)?.startHour).toBe(15);
    expect(detectMeeting('No times in here.', now)).toBeNull();
    expect(extractActions('Please send the revised quote. Could you confirm data residency for KSA? Thanks!')).toEqual(['Send the revised quote', 'Confirm data residency for KSA']);
    const formal = novaDraft({ prompt: 'follow up about the SOC 2 report', tone: 'formal', toFirstNames: ['Lina'], meFirst: 'Layla' });
    expect(formal.en.startsWith('Dear Lina')).toBe(true);
    expect(formal.en).toContain('the SOC 2 report');
    expect(formal.subject).toBe('Following up: the SOC 2 report');
    expect(formal.ar).toMatch(/[\u0600-\u06FF]/);
    expect(novaDraft({ prompt: 'thank them', tone: 'concise', toFirstNames: ['Omar'], meFirst: 'Layla' }).en.split('\n').length).toBeLessThan(6);
  });

  it('insights: newsletter clutter, 1-click unsubscribe, storage offload and email carbon', () => {
    const st = useMail.getState();
    const rows = newsletterClutter(st.threads, st.contacts);
    expect(rows[0].readRate).toBeLessThanOrEqual(rows[rows.length - 1].readRate);
    expect(rows.find((r) => r.contact.id === 'x-gulfbiz')!.suggest).toBe('unsubscribe');
    expect(st.unsubscribe(['x-gulfbiz', 'x-hbr'])).toBe(2);
    expect(thread('th-gulfbiz').folder).toBe('archive');
    expect(newsletterClutter(useMail.getState().threads, useMail.getState().contacts).some((r) => r.contact.id === 'x-gulfbiz')).toBe(false);
    const storage = attachmentStorage(useMail.getState().threads);
    expect(storage.totalKb).toBeGreaterThan(0);
    expect(storage.carbonGramsYear).toBeCloseTo((storage.totalKb / 1024) * CARBON_G_PER_MB_YEAR, 0);
    const biggest = storage.items[0].attachment;
    expect(useMail.getState().offloadAttachments([biggest.id])).toBe(biggest.sizeKb);
    expect(attachmentStorage(useMail.getState().threads).totalKb).toBe(storage.totalKb - biggest.sizeKb);
  });

  it('Feed digest batching holds newsletters until the next 08:30 / 16:30 slot', () => {
    const now = Date.now();
    const { last, next } = digestWindow(now);
    expect(last).toBeLessThanOrEqual(now);
    expect(next).toBeGreaterThan(now);
    const feed = thread('th-tldr');
    const fresh: MailThread = { ...feed, messages: [{ ...feed.messages[0], at: last + 1 }] };
    expect(inInbox(fresh, now, { feedDigest: true })).toBe(false);
    expect(inInbox(fresh, now, { feedDigest: false })).toBe(true);
  });

  it('morning brief credits the VIP customer\u2019s organisation, not the colleague who forwarded', () => {
    const now = Date.now();
    const base = thread('th-emirates-sla');
    // The latest inbound message comes from an internal colleague; the VIP sits earlier in the thread.
    const t: MailThread = { ...base, stream: 'priority', folder: 'inbox', messages: [...base.messages, { ...base.messages[0], id: 'm-fwd', from: 'u-yusuf', to: ['u-layla'], cc: [], at: now - 60_000 }] };
    const contacts = new Map(useMail.getState().contacts.map((c) => [c.id, c]));
    const users = new Map(SEED_USERS.map((u) => [u.id, u]));
    const input = {
      now,
      ranked: [{ thread: t, score: 92, reasons: [{ id: 'vip' as const, weight: 28, tone: 'amber' as const }] }],
      ownerId: 'u-layla',
      approvals: 2,
      screener: 0,
      feedCount: 3,
      feedHeld: 0,
      digestOn: false,
      nameOf: (k: string) => resolveContact(k, users, contacts).name,
      orgOf: (k: string) => resolveContact(k, users, contacts).org,
      weekdayName: () => 'Thursday',
      isVip: (k: string) => !!resolveContact(k, users, contacts).vip,
    };
    const en = buildBrief({ ...input, locale: 'en' });
    expect(en.count).toBe(2);
    expect(en.text).toContain('Emirates Group');
    expect(en.text).not.toMatch(/Helix (wants|needs|is waiting)/);
    expect(en.chips.map((c) => c.kind)).toEqual(['thread', 'stream']);
    expect(buildBrief({ ...input, locale: 'ar' }).text).toMatch(/[\u0600-\u06FF]/);
  });

  it('Arabic Nova helpers: smart replies, nudges, snippets and day plurals', () => {
    const t = thread('th-emirates-sla');
    const ar = smartRepliesFor(t, 'ar');
    expect(ar).toHaveLength(3);
    expect(ar.every((r) => /[\u0600-\u06FF]/.test(r))).toBe(true);
    expect(smartRepliesFor(t).every((r) => !/[\u0600-\u06FF]/.test(r))).toBe(true);
    expect([1, 2, 5, 12].map(arDays)).toEqual(['يوم واحد', 'يومان', '5 أيام', '12 يوماً']);
    const nudge = nudgeDraft({ first: 'دانيال', subject: 'Q4 numbers', days: 3, meFirst: 'ليلى', locale: 'ar' });
    expect(nudge.subject).toBe('Re: Q4 numbers');
    expect(nudge.body).toContain('3 أيام');
    expect(nudgeDraft({ first: 'Daniel', subject: 'Re: Q4', days: 1, meFirst: 'Layla' }).body).toContain('1 day.');
    expect(SNIPPETS.every((s) => /[\u0600-\u06FF]/.test(s.bodyAr) && s.body.length > 20)).toBe(true);
  });

  it('inbox zero keeps a daily streak', () => {
    const now = Date.now();
    expect(useMail.getState().celebrateZero(now)).toBe(4);
    expect(useMail.getState().celebrateZero(now + 1000)).toBe(4);
    expect(useMail.getState().celebrateZero(now + 3 * DAY)).toBe(1);
  });
});
