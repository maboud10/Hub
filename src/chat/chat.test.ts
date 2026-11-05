import { beforeEach, describe, expect, it } from 'vitest';
import { useHub } from '@/store/hub';
import { canViewChannel, resolveChatUser, useChatStore } from './store';

describe('Pulse Chat Store & Interactive Features', () => {
  beforeEach(() => {
    useHub.getState().resetDemo();
    useHub.getState().login('u-layla');
    useChatStore.getState().resetChat();
  });

  it('seeds all required channels, DMs, and enforces RBAC on private #exec-sync', () => {
    const { channels } = useChatStore.getState();
    const ids = channels.map((c) => c.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'ch-general',
        'ch-ship-it',
        'ch-watercooler',
        'ch-kudos',
        'ch-design',
        'ch-ask-it',
        'ch-dubai',
        'ch-exec',
        'dm-mei',
        'dm-marcus',
        'dm-sara',
        'dm-elena',
        'dm-omar',
        'dm-kwame',
      ]),
    );

    const execChannel = channels.find((c) => c.id === 'ch-exec')!;
    const layla = resolveChatUser('u-layla');
    const alexContractor = resolveChatUser('u-alex');
    expect(canViewChannel(execChannel, layla)).toBe(true);
    expect(canViewChannel(execChannel, alexContractor)).toBe(false);
  });

  it('sends messages, toggles emoji reactions, pins, and bookmarks', () => {
    const store = useChatStore.getState();
    const msg = store.sendMessage('ch-general', 'Shipping Prism v2.4 tokens to production! 🚀');

    expect(msg.channelId).toBe('ch-general');
    expect(msg.body).toContain('Shipping Prism v2.4');

    store.toggleReaction(msg.id, '🔥', 'u-mei');
    store.toggleReaction(msg.id, '🔥', 'u-omar');
    let updated = useChatStore.getState().messages.find((m) => m.id === msg.id)!;
    expect(updated.reactions['🔥']).toEqual(['u-mei', 'u-omar']);

    // Toggle off for u-mei
    store.toggleReaction(msg.id, '🔥', 'u-mei');
    updated = useChatStore.getState().messages.find((m) => m.id === msg.id)!;
    expect(updated.reactions['🔥']).toEqual(['u-omar']);

    // Pin and Star
    store.togglePinMessage(msg.id);
    store.toggleStarMessage(msg.id, 'u-layla');
    updated = useChatStore.getState().messages.find((m) => m.id === msg.id)!;
    expect(updated.pinned).toBe(true);
    expect(updated.starredByIds).toContain('u-layla');
  });

  it('creates interactive polls and switches votes cleanly', () => {
    const store = useChatStore.getState();
    const pollMsg = store.createPoll('ch-design', 'Best speaking ring curve?', [
      'Spring 340ms',
      'Ease-Out 500ms',
    ]);

    const opt1 = pollMsg.poll!.options[0].id;
    const opt2 = pollMsg.poll!.options[1].id;

    // Author starts on opt1; now u-layla votes for opt2
    store.votePoll(pollMsg.id, opt2, 'u-layla');
    const updated = useChatStore.getState().messages.find((m) => m.id === pollMsg.id)!;
    expect(updated.poll!.options.find((o) => o.id === opt1)!.voterIds).not.toContain('u-layla');
    expect(updated.poll!.options.find((o) => o.id === opt2)!.voterIds).toContain('u-layla');
  });

  it('posts Kudos cards, syncs with NEXUS Hub Kudos, and increments High-Five boosts', () => {
    const store = useChatStore.getState();
    const initialHubKudosCount = useHub.getState().kudos.length;

    const kudosMsg = store.sendKudosCard(
      'ch-kudos',
      'u-mei',
      'Craft',
      'Built the adaptive glassmorphism tokens in record time!',
      'u-layla',
    );

    expect(kudosMsg.kudos?.recipientId).toBe('u-mei');
    expect(kudosMsg.kudos?.boostCount).toBe(1);
    expect(useHub.getState().kudos.length).toBe(initialHubKudosCount + 1);

    store.boostKudos(kudosMsg.id, 'u-omar');
    store.boostKudos(kudosMsg.id, 'u-sara');
    const updated = useChatStore.getState().messages.find((m) => m.id === kudosMsg.id)!;
    expect(updated.kudos?.boostCount).toBe(3);
    expect(updated.kudos?.boosterIds).toEqual(expect.arrayContaining(['u-layla', 'u-omar', 'u-sara']));
  });

  it('supports thread replies and reactions on replies', () => {
    const store = useChatStore.getState();
    const reply = store.replyInThread('msg-gen-1', 'Count me in for the lightning demo!', 'u-priya');
    expect(reply).not.toBeNull();

    store.toggleReplyReaction('msg-gen-1', reply!.id, '🎉', 'u-layla');
    const parent = useChatStore.getState().messages.find((m) => m.id === 'msg-gen-1')!;
    const targetReply = parent.replies.find((r) => r.id === reply!.id)!;
    expect(targetReply.reactions['🎉']).toContain('u-layla');
  });

  it('manages Live Huddles and generates Nova AI Huddle Notes in the channel', () => {
    const store = useChatStore.getState();
    const huddle = store.startOrJoinHuddle('ch-ship-it', 'Release Train Check-in');
    expect(huddle.channelId).toBe('ch-ship-it');
    expect(huddle.participantIds).toContain('u-layla');

    store.toggleHuddleMute('u-layla');
    expect(useChatStore.getState().activeHuddle?.mutedIds).toContain('u-layla');

    store.toggleHuddleScreenShare('Prism Token Diff');
    expect(useChatStore.getState().activeHuddle?.screenSharerId).toBe('u-layla');

    store.throwHuddleReaction('🚀', 'u-mei');
    expect(useChatStore.getState().activeHuddle?.floatingReactions.length).toBe(1);

    const notesMsg = store.generateHuddleNotes('ch-ship-it');
    expect(notesMsg.kind).toBe('huddle_notes');
    expect(notesMsg.huddleNotes?.actionItems.length).toBeGreaterThan(0);

    const firstActionId = notesMsg.huddleNotes!.actionItems[0].id;
    const prevDone = notesMsg.huddleNotes!.actionItems[0].done;
    store.toggleHuddleActionItem(notesMsg.id, firstActionId);
    const updatedNotes = useChatStore.getState().messages.find((m) => m.id === notesMsg.id)!;
    expect(updatedNotes.huddleNotes!.actionItems[0].done).toBe(!prevDone);
  });

  it('spins Coffee Roulette matches, schedules 15m huddles, and shuffles Watercooler Icebreakers', () => {
    const store = useChatStore.getState();
    const coffeeMsg = store.spinCoffeeMatch('ch-watercooler');
    expect(coffeeMsg.kind).toBe('coffee_match');
    expect(coffeeMsg.coffeeMatch?.pairUserIds.length).toBe(2);

    store.scheduleCoffeeHuddle(coffeeMsg.id);
    const scheduled = useChatStore.getState().messages.find((m) => m.id === coffeeMsg.id)!;
    expect(scheduled.coffeeMatch?.status).toBe('scheduled');

    const ibMsg = store.dropIcebreaker('ch-watercooler');
    const firstQ = ibMsg.icebreaker!.question;
    store.spinIcebreakerQuestion(ibMsg.id);
    store.answerIcebreaker(ibMsg.id, 'Karak chai every afternoon!', 'u-omar');

    const updatedIb = useChatStore.getState().messages.find((m) => m.id === ibMsg.id)!;
    expect(updatedIb.icebreaker!.question).not.toBe(firstQ);
    expect(updatedIb.icebreaker!.answers).toHaveLength(1);
  });

  it('updates Employee Pulse Vibe and generates Nova AI Catch Me Up summaries', () => {
    const store = useChatStore.getState();
    const vibe = store.setVibe('🎧', 'Deep in Focus', 'Lo-Fi Beats', '2 hours', 'u-layla');
    expect(vibe.emoji).toBe('🎧');
    expect(useChatStore.getState().vibes['u-layla'].soundTag).toBe('Lo-Fi Beats');

    const summary = store.generateCatchUpSummary('ch-general');
    expect(summary.channelId).toBe('ch-general');
    expect(summary.messageCount).toBeGreaterThan(0);
    expect(summary.openPolls.length).toBeGreaterThan(0);
  });
});
