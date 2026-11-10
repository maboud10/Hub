import { beforeEach, describe, expect, it } from 'vitest';
import { useHub } from '@/store/hub';
import { currentViewer } from '@/lib/appBridge';
import { usePerf } from './store';
import { api } from './public';

const s = () => usePerf.getState();
const login = (id: string) => useHub.getState().login(id);
const notesFor = (userId: string) => useHub.getState().notifications.filter((n) => n.userId === userId);

describe('Performance store', () => {
  beforeEach(() => {
    useHub.getState().resetDemo();
    login('u-mei');
    s().resetDemo();
  });

  it('seeds the IDs other apps and Hub notifications rely on', () => {
    const st = s();
    for (const id of ['obj-co-passwordless', 'obj-co-design-system', 'obj-co-gcc-growth', 'obj-co-reliability', 'obj-co-people']) expect(st.objectives.some((o) => o.id === id)).toBe(true);
    for (const id of ['kr-passkeys-adoption', 'kr-password-resets', 'kr-prism-adoption', 'kr-a11y-score', 'kr-gcc-arr', 'kr-gcc-logos', 'kr-uptime', 'kr-p1-incidents', 'kr-onboarding-time', 'kr-checkin-completion'])
      expect(st.keyResults.some((k) => k.id === id)).toBe(true);
    for (const id of ['cyc-2026-q4', 'cyc-2026-q3', 'cyc-2026-q2']) expect(st.cycles.some((c) => c.id === id)).toBe(true);
    expect(st.reviews.find((r) => r.id === 'rv-q4-mei')!.self.status).toBe('draft');
    expect(st.reviews.find((r) => r.id === 'rv-q4-priya')!.self.status).toBe('submitted');
    expect(st.reviews.find((r) => r.id === 'rv-q4-lucas')!.self.status).toBe('not-started');
    expect(st.reviews.find((r) => r.id === 'rv-q3-mei')!.release?.acknowledgedAt).toBeUndefined();
    expect(st.requests.find((r) => r.id === 'fr-mei-prism')!.respondentIds).toEqual(['u-omar']);
    expect(st.feedback.find((f) => f.fromId === 'u-omar' && f.toId === 'u-priya')!.body).toBe('The query planner rewrite unblocked three teams — thank you.');
    expect(st.feedback.length).toBeGreaterThanOrEqual(40);
    expect(st.series.map((x) => x.id)).toEqual(expect.arrayContaining(['oo-omar-mei', 'oo-omar-priya', 'oo-omar-lucas', 'oo-omar-hana', 'oo-omar-kwame', 'oo-layla-omar', 'oo-layla-sara', 'oo-aisha-noah', 'oo-sara-fatima']));
    expect(st.objectives.some((o) => o.ownerId === 'u-kwame')).toBe(false);
  });

  it('lets Mei finish and submit her self-reflection, notifying Omar', () => {
    const rid = 'rv-q4-mei';
    expect(s().submitSelf(rid).ok).toBe(false); // incomplete
    const answers = {
      'q-wins': 'Shipped Prism v4 tokens to the HR Portal and Talent Hub, taking adoption from 35% to 58%.',
      'q-growth': 'I grew in owning risks: I now post a weekly risk and decision log.',
      'q-obstacles': 'The brand palette sign-off blocked the contrast audit for three weeks.',
      'q-next': 'Prism v4 GA, contrast at 100%, and onboarding two more teams.',
    };
    expect(s().saveSelf(rid, { answers, ratings: { craft: 5, collaboration: 4, ownership: 4, impact: 4, customer: 5 } }).ok).toBe(true);
    const before = notesFor('u-omar').length;
    const res = s().submitSelf(rid);
    expect(res.ok).toBe(true);
    expect(s().reviews.find((r) => r.id === rid)!.self.status).toBe('submitted');
    expect(notesFor('u-omar').length).toBe(before + 1);
    expect(notesFor('u-omar')[0].link).toBe('/performance/checkins/rv-q4-mei');
  });

  it('blocks people from writing someone else’s self-reflection', () => {
    login('u-priya');
    expect(s().saveSelf('rv-q4-mei', { answers: { 'q-wins': 'hi' } }).ok).toBe(false);
  });

  it('lets Kwame create his first individual objective but not a team one', () => {
    login('u-kwame');
    const bad = s().createObjective({ title: 'Data team goals', level: 'team', ownerId: 'u-kwame', visibility: 'public', keyResults: [] });
    expect(bad.ok).toBe(false);
    const res = s().createObjective({
      title: 'Get productive on the data platform',
      level: 'individual',
      ownerId: 'u-kwame',
      visibility: 'public',
      parentId: 'obj-co-people',
      keyResults: [
        { title: 'Cut time to first production change from 14 to 5 days', metric: 'number', start: 14, target: 5, unit: 'days' },
        { title: 'Complete the 30-60-90 milestones', metric: 'milestone', start: 0, target: 3, milestones: ['Day 30', 'Day 60', 'Day 90'] },
      ],
    });
    expect(res.ok).toBe(true);
    const id = res.ok ? res.id : '';
    expect(s().keyResults.filter((k) => k.objectiveId === id)).toHaveLength(2);
    expect(notesFor('u-sara').some((n) => n.title.includes('aligned an objective'))).toBe(true);
  });

  it('records weekly check-ins only for owners and managers', () => {
    const krId = 'kr-mei-docs';
    const before = s().keyResults.find((k) => k.id === krId)!;
    const res = s().checkIn([{ krId, value: before.current + 3, confidence: 8, note: 'Three new pages' }]);
    expect(res.ok && res.improved).toBe(1);
    const after = s().keyResults.find((k) => k.id === krId)!;
    expect(after.current).toBe(before.current + 3);
    expect(after.checkins).toHaveLength(before.checkins.length + 1);
    login('u-priya');
    expect(s().checkIn([{ krId, value: 40, confidence: 5 }]).ok).toBe(false);
    login('u-omar');
    expect(s().checkIn([{ krId, value: 40, confidence: 5 }]).ok).toBe(true);
  });

  it('toggles milestones through check-ins', () => {
    login('u-priya');
    const k = s().keyResults.find((x) => x.id === 'kr-priya-planner')!;
    const last = k.milestones!.find((m) => !m.done)!;
    const res = s().toggleMilestone(k.id, last.id);
    expect(res.ok && res.completed).toBe(true);
    expect(s().keyResults.find((x) => x.id === k.id)!.current).toBe(4);
  });

  it('runs the manager review flow end to end', () => {
    login('u-omar');
    expect(s().saveManager('rv-q4-mei', { overall: 'exceeds' }).ok).toBe(false); // locked until Mei submits
    expect(s().saveManager('rv-q4-hana', { answers: { 'q-wins': 'Hana synthesized 12 customer interviews and four insights shipped into the Prism backlog this quarter.' } }).ok).toBe(true);
    expect(s().submitManager('rv-q4-hana').ok).toBe(false); // needs ratings + 2 answers
    s().saveManager('rv-q4-hana', {
      answers: { 'q-growth': 'You now share weekly synthesis snapshots, which landed really well with design and product partners.' },
      ratings: { craft: 3, collaboration: 4, ownership: 4, impact: 3, customer: 5 },
      overall: 'meets',
      potential: 'high',
    });
    expect(s().submitManager('rv-q4-hana').ok).toBe(true);
    expect(s().releaseReview('rv-q4-hana').ok).toBe(true);
    expect(notesFor('u-hana')[0].link).toBe('/performance/checkins/rv-q4-hana?tab=summary');
    login('u-mei');
    expect(s().acknowledgeReview('rv-q4-hana').ok).toBe(false);
    login('u-hana');
    expect(s().acknowledgeReview('rv-q4-hana', 'Thanks!').ok).toBe(true);
  });

  it('only lets managers/admins calibrate their scope, and respects the lock', () => {
    expect(s().calibrate('rv-q4-priya', 3, 3).ok).toBe(false); // Mei
    login('u-omar');
    expect(s().calibrate('rv-q4-priya', 3, 2, 'Strong but scope still growing').ok).toBe(true);
    expect(s().calibrate('rv-q4-noah', 2, 2).ok).toBe(false); // not in Omar's org
    login('u-sara');
    expect(s().setCalibrationLock('cyc-2026-q4', true).ok).toBe(true);
    login('u-omar');
    expect(s().calibrate('rv-q4-priya', 3, 3).ok).toBe(false);
    expect(s().setCalibrationLock('cyc-2026-q4', false).ok).toBe(false);
    const audit = useHub.getState().audit.filter((a) => a.action.startsWith('performance.calibration'));
    expect(audit.some((a) => a.outcome === 'denied')).toBe(true);
  });

  it('handles peer nominations with manager approval', () => {
    const res = s().nominatePeers('rv-q4-mei', ['u-hana', 'u-priya']);
    expect(res.ok && res.proposed).toBe(2);
    expect(s().cycleFeedback.filter((f) => f.subjectId === 'u-mei' && f.cycleId === 'cyc-2026-q4' && f.status === 'proposed')).toHaveLength(2);
    login('u-omar');
    const ok = s().approveNominations('rv-q4-mei', ['u-hana', 'u-priya'], ['u-lucas']);
    expect(ok.ok && ok.requested).toBe(3);
    login('u-lucas');
    const item = s().cycleFeedback.find((f) => f.subjectId === 'u-mei' && f.authorId === 'u-lucas' && f.cycleId === 'cyc-2026-q4')!;
    expect(s().submitPeer(item.id, { start: 'Pairing with SRE on rollout plans.', stop: 'Nothing big.', continue: 'Clear, inclusive design crits every week.', anonymous: true }).ok).toBe(true);
  });

  it('gives continuous feedback with privacy and kudos integration', () => {
    expect(s().giveFeedback({ toId: 'u-hana', kind: 'constructive', visibility: 'public', body: 'Share synthesis earlier please.' }).ok).toBe(false);
    expect(s().giveFeedback({ toId: 'u-alex', kind: 'praise', visibility: 'private', body: 'Great accessibility fixes!' }).ok).toBe(false); // contractor
    const kudosBefore = useHub.getState().kudos.length;
    const res = s().giveFeedback({ toId: 'u-hana', kind: 'praise', visibility: 'public', body: 'Your customer clips made the crit decision easy.', kudosValue: 'customer' });
    expect(res.ok && res.kudos).toBe(true);
    expect(useHub.getState().kudos.length).toBe(kudosBefore + 1);
  });

  it('answers feedback requests and records the response', () => {
    login('u-omar');
    const res = s().giveFeedback({ toId: 'u-mei', kind: 'praise', visibility: 'private', body: 'The Prism rollout landed well — engineers loved the office hours.', requestId: 'fr-mei-prism' });
    expect(res.ok).toBe(true);
    expect(s().requests.find((r) => r.id === 'fr-mei-prism')!.responses['u-omar']?.feedbackId).toBe(res.ok ? res.id : '');
    expect(notesFor('u-mei').some((n) => n.title.includes('answered your feedback request'))).toBe(true);
  });

  it('keeps private notes to managers of the subject', () => {
    expect(s().addNote('u-priya', 'Peer note').ok).toBe(false);
    login('u-omar');
    expect(s().addNote('u-priya', 'Ready for Principal scope').ok).toBe(true);
  });

  it('completes a 1:1, carrying over unfinished agenda items', () => {
    login('u-omar');
    const id = 'oo-omar-mei';
    const before = s().series.find((x) => x.id === id)!;
    s().toggleAgendaItem(id, before.agenda[0].id);
    s().saveSharedNotes(id, 'Agreed next steps on brand palette.');
    const res = s().completeMeeting(id);
    expect(res.ok && res.carried).toBe(before.agenda.length - 1);
    const after = s().series.find((x) => x.id === id)!;
    expect(after.meetings).toHaveLength(before.meetings.length + 1);
    expect(after.agenda.every((g) => (g.carried ?? 0) >= 1)).toBe(true);
    expect(after.nextAt).toBeGreaterThan(Date.now());
    login('u-priya');
    expect(s().addAgendaItem(id, 'Sneaky item').ok).toBe(false);
  });

  it('runs cycles admin for People Ops only', () => {
    login('u-omar');
    const phases = s().cycles[0].phases;
    expect(s().createCycle({ name: 'Eng pulse', periodId: 'q4-2026', phases, departments: ['Engineering'], templateId: 'tpl-quarterly', peerAnonymous: true, upwardMin: 3, launch: true }).ok).toBe(false);
    login('u-sara');
    const res = s().createCycle({ name: 'Eng pulse', periodId: 'q4-2026', phases, departments: ['Engineering'], templateId: 'tpl-quarterly', peerAnonymous: true, upwardMin: 3, launch: true });
    expect(res.ok && res.participants).toBe(4); // Omar, Priya, Lucas, Kwame (contractors excluded)
    const nudge = s().nudge('cyc-2026-q4', ['u-lucas', 'u-layla'], 'self');
    expect(nudge.ok && nudge.count).toBe(2);
  });

  it('exposes a permission-aware bridge', () => {
    login('u-priya');
    const v = currentViewer()!;
    const krs = api.listKeyResults(v);
    expect(krs.some((k) => k.id === 'kr-passkeys-adoption')).toBe(true);
    expect(krs.some((k) => k.id === 'kr-mei-studies')).toBe(false); // private objective
    const passkeys = api.listKeyResults(v, { query: 'passkey' });
    expect(passkeys.length).toBeGreaterThan(1);
    expect(passkeys.every((k) => /passkey/i.test(`${k.title} ${k.objectiveTitle}`))).toBe(true);
    expect(api.listKeyResults(v, { ownerId: 'u-priya' }).every((k) => k.ownerId === 'u-priya')).toBe(true);
    expect(api.addEvidence(v, { userId: 'u-mei', title: 'Peer pinned', source: { app: 'projects', label: 'Helix Projects', to: '/projects' } }).ok).toBe(false);
    expect(api.addEvidence(v, { userId: 'u-priya', title: 'Shipped planner 100%', source: { app: 'projects', label: 'Helix Projects', to: '/projects' } }).ok).toBe(true);
    const entries = api.paletteEntries(v);
    expect(entries.some((e) => e.to === '/performance/okrs?checkin=1')).toBe(true);
    expect(entries.some((e) => e.to === '/performance/cycles')).toBe(false);
    login('u-sara');
    expect(api.paletteEntries(currentViewer()!).some((e) => e.to === '/performance/cycles')).toBe(true);
  });
});
