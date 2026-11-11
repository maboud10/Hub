/**
 * Helix Meet — Persisted Zustand Store ('nexus-meet-v1')
 * Connects live Spatial Rooms, AI Scribe Transcripts, Recordings & Async Clips
 * with Helix Calendar, Helix Projects, Helix CRM, and Pulse Chat.
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { toast } from '@/store/toast';
import { synthesizeLiveMoment } from './engine';
import { buildMeetSeed, MEET_DATA_VERSION } from './seed';
import type {
  ActiveMeetRoom,
  AsyncVideoClip,
  GreenRoomConfig,
  MeetData,
  MeetRecording,
} from './types';

export interface MeetActions {
  updateGreenRoom(patch: Partial<GreenRoomConfig>): void;
  setActiveRoom(roomId: string): void;
  setActiveRecording(recordingId: string, chapterId?: string | null): void;
  launchInstantRoom(
    title: string,
    template?: 'design' | 'incident' | 'customer' | 'pair',
  ): ActiveMeetRoom;
  injectLiveMoment(customText?: string): void;
  sendReaction(emoji: string, userId?: string): void;
  voteLivePoll(roomId: string, optionId: string, userId?: string): void;
  addWhiteboardNote(roomId: string, note: string): void;
  pushActionToProjects(actionId: string): void;
  pushActionToCrm(actionId: string): void;
  saveRoomToRecordingVault(): MeetRecording;
  shareRecordingToChat(recordingId: string): void;
  createAsyncClip(input: {
    title: string;
    summary: string;
    category: AsyncVideoClip['category'];
    keyTakeaways?: string[];
    authorId?: string;
  }): AsyncVideoClip;
  reactToClip(clipId: string, emoji: string): void;
  commentOnClip(clipId: string, text: string, authorId?: string): void;
  resetMeet(): void;
}

export type MeetStore = MeetData & MeetActions;

const memoryMap = new Map<string, string>();
const safeStorage: Storage = {
  getItem: (k) => {
    try {
      if (typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function') {
        return localStorage.getItem(k);
      }
    } catch {
      // fallback
    }
    return memoryMap.get(k) ?? null;
  },
  setItem: (k, v) => {
    try {
      if (typeof localStorage !== 'undefined' && typeof localStorage.setItem === 'function') {
        localStorage.setItem(k, v);
        return;
      }
    } catch {
      // fallback
    }
    memoryMap.set(k, v);
  },
  removeItem: (k) => {
    try {
      if (typeof localStorage !== 'undefined' && typeof localStorage.removeItem === 'function') {
        localStorage.removeItem(k);
        return;
      }
    } catch {
      // fallback
    }
    memoryMap.delete(k);
  },
  clear: () => memoryMap.clear(),
  key: (i) => [...memoryMap.keys()][i] ?? null,
  get length() {
    return memoryMap.size;
  },
};

function safeToast(kind: 'success' | 'info', title: string, desc?: string) {
  if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') {
    toast[kind](title, desc);
  }
}

export const useMeet = create<MeetStore>()(
  persist(
    (set, get) => ({
      ...buildMeetSeed(),

      updateGreenRoom(patch) {
        set((s) => ({
          greenRoom: { ...s.greenRoom, ...patch },
        }));
      },

      setActiveRoom(roomId) {
        const exists = get().rooms.some((r) => r.id === roomId);
        if (exists) {
          set({ activeRoomId: roomId });
        }
      },

      setActiveRecording(recordingId, chapterId = null) {
        const rec = get().recordings.find((r) => r.id === recordingId);
        if (!rec) return;
        set({
          activeRecordingId: recordingId,
          activeChapterId: chapterId ?? rec.chapters[0]?.id ?? null,
        });
      },

      launchInstantRoom(title, template = 'design') {
        const id = `meet-inst-${Date.now().toString(36)}`;
        const code = `HOLO-LIVE-${Math.floor(100 + Math.random() * 899)}`;
        const cleanTitle =
          title.trim() ||
          (template === 'incident'
            ? 'Zero-Trust Incident War-Room'
            : template === 'customer'
              ? 'Executive Customer Deal Briefing'
              : template === 'pair'
                ? 'Rust & AI Copilot Pair Architecture Session'
                : 'Spatial Design & Product Jam');

        const newRoom: ActiveMeetRoom = {
          id,
          code,
          title: cleanTitle,
          subtitle: 'Instant Spatial HoloMeet · Live Bilingual AI Scribe Active',
          sigil:
            template === 'incident'
              ? 'shield-key'
              : template === 'customer'
                ? 'orbit'
                : template === 'pair'
                  ? 'chip'
                  : 'prism',
          color:
            template === 'incident'
              ? '#fb7185'
              : template === 'customer'
                ? '#fb923c'
                : template === 'pair'
                  ? '#22d3ee'
                  : '#34d399',
          linkedAppLabel:
            template === 'customer' ? 'CRM · Active Pipeline' : 'Projects · Sprint Execution',
          linkedAppTo: template === 'customer' ? '/crm/pipeline' : '/projects',
          startedAt: Date.now(),
          elapsedMinutes: 1,
          participants: [
            {
              userId: 'u-layla',
              roleLabel: 'Host · Head of IT & Security',
              hub: 'Dubai · GST',
              speaking: true,
              muted: false,
              cameraOn: true,
              talkTimePct: 50,
              sentiment: 'energized',
              audioLevel: 84,
            },
            {
              userId: 'u-omar',
              roleLabel: 'Engineering Manager',
              hub: 'Dubai · GST',
              speaking: false,
              muted: false,
              cameraOn: true,
              talkTimePct: 30,
              sentiment: 'aligned',
              audioLevel: 22,
            },
            {
              userId: 'u-mei',
              roleLabel: 'Senior Product Designer',
              hub: 'Singapore · SGT',
              speaking: false,
              muted: false,
              cameraOn: true,
              talkTimePct: 20,
              sentiment: 'focused',
              audioLevel: 14,
            },
          ],
          transcript: [
            {
              id: `tr-init-${Date.now()}`,
              speakerId: 'u-layla',
              timestamp: 'Live',
              textEn: `Welcome to ${cleanTitle}. Nova Live Scribe is capturing decisions and simultaneous Arabic subtitles.`,
              textAr: `مرحباً بكم في ${cleanTitle}. يقوم مساعد نوفا الذكي بتوثيق القرارات والترجمة الفورية باللغة العربية.`,
              highlightKind: 'insight',
            },
          ],
          decisions: [
            `Initialized ${cleanTitle} with Nova Live Scribe & cross-app Projects/CRM sync.`,
          ],
          actionItems: [
            {
              id: `act-init-${Date.now()}`,
              title: `Publish outcomes from ${cleanTitle} to Helix Projects & Pulse Chat`,
              ownerId: 'u-layla',
              dueLabel: 'Today · 18:00',
              linkedApp: 'projects',
            },
          ],
          livePoll: {
            id: `poll-${Date.now()}`,
            question: 'Ready to lock the decision and push tasks to Helix Projects?',
            options: [
              { id: 'op-1', label: 'Yes — ship immediately', votes: ['u-layla', 'u-omar'] },
              { id: 'op-2', label: 'Need async review from APAC', votes: ['u-mei'] },
            ],
          },
          whiteboardNotes: [
            `${cleanTitle} — Architecture & Execution Canvas`,
            'All action items sync 1:1 with Helix Projects & CRM',
          ],
          recentReactions: [],
        };

        set((s) => ({
          rooms: [newRoom, ...s.rooms],
          activeRoomId: newRoom.id,
        }));

        // Cross-app bridge: register the instant room on Helix Calendar as well
        try {
          import('@/calendar/store').then(({ useCalendar }) => {
            useCalendar.getState().createEvent({
              title: cleanTitle,
              description: `Instant Spatial Room (${code}) launched from Helix Meet.`,
              category: template === 'customer' ? 'customer' : 'meet',
              dayOffset: 0,
              startHour: 13.5,
              durationMins: 30,
              meetRoomId: newRoom.id,
              roomName: `HoloMeet · ${code}`,
            });
          });
        } catch {
          // ignore in isolated unit test
        }

        safeToast('success', `Launched Spatial Room ${code}`, cleanTitle);
        return newRoom;
      },

      injectLiveMoment(customText) {
        const state = get();
        const room =
          state.rooms.find((r) => r.id === state.activeRoomId) ?? state.rooms[0];
        if (!room) return;

        const { line, decision, actionItem } = synthesizeLiveMoment(room, customText);

        set((s) => ({
          rooms: s.rooms.map((r) =>
            r.id === room.id
              ? {
                  ...r,
                  elapsedMinutes: r.elapsedMinutes + 2,
                  transcript: [...r.transcript, line],
                  decisions: [decision, ...r.decisions],
                  actionItems: [actionItem, ...r.actionItems],
                  participants: r.participants.map((p) => ({
                    ...p,
                    speaking: p.userId === line.speakerId,
                    audioLevel: p.userId === line.speakerId ? 88 : 16,
                  })),
                }
              : r,
          ),
        }));

        safeToast(
          'success',
          'Nova Scribe Captured Live Decision & Action',
          actionItem.title,
        );
      },

      sendReaction(emoji, userId = 'u-layla') {
        const roomId = get().activeRoomId;
        const rx = {
          id: `rx-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          emoji,
          userId,
          at: Date.now(),
        };
        set((s) => ({
          rooms: s.rooms.map((r) =>
            r.id === roomId
              ? { ...r, recentReactions: [rx, ...r.recentReactions].slice(0, 8) }
              : r,
          ),
        }));
      },

      voteLivePoll(roomId, optionId, userId = 'u-layla') {
        set((s) => ({
          rooms: s.rooms.map((r) => {
            if (r.id !== roomId) return r;
            return {
              ...r,
              livePoll: {
                ...r.livePoll,
                options: r.livePoll.options.map((opt) => {
                  const withoutUser = opt.votes.filter((v) => v !== userId);
                  return {
                    ...opt,
                    votes: opt.id === optionId ? [...withoutUser, userId] : withoutUser,
                  };
                }),
              },
            };
          }),
        }));
      },

      addWhiteboardNote(roomId, note) {
        const trimmed = note.trim();
        if (!trimmed) return;
        set((s) => ({
          rooms: s.rooms.map((r) =>
            r.id === roomId
              ? { ...r, whiteboardNotes: [...r.whiteboardNotes, trimmed] }
              : r,
          ),
        }));
        safeToast('info', 'Added note to Spatial Whiteboard', trimmed);
      },

      pushActionToProjects(actionId) {
        let targetTitle = 'Meeting Action Item';
        let targetOwner = 'u-omar';

        set((s) => ({
          rooms: s.rooms.map((r) => ({
            ...r,
            actionItems: r.actionItems.map((a) => {
              if (a.id === actionId) {
                targetTitle = a.title;
                targetOwner = a.ownerId;
                return { ...a, pushedToProjects: true };
              }
              return a;
            }),
          })),
          recordings: s.recordings.map((rec) => ({
            ...rec,
            actionItems: rec.actionItems.map((a) => {
              if (a.id === actionId) {
                targetTitle = a.title;
                targetOwner = a.ownerId;
                return { ...a, pushedToProjects: true };
              }
              return a;
            }),
          })),
        }));

        // Bridge into Helix Projects store
        try {
          import('@/projects/store').then(({ useProjects }) => {
            useProjects.getState().createTask({
              title: targetTitle,
              assigneeId: targetOwner,
              priority: 'high',
              description: 'Auto-extracted by HoloMeet Nova AI Scribe.',
            });
          });
        } catch {
          // ignore in isolated tests
        }

        safeToast(
          'success',
          'Pushed Action Item to Helix Projects',
          `"${targetTitle}" assigned in Projects`,
        );
      },

      pushActionToCrm(actionId) {
        let targetTitle = 'Executive Deal Follow-up';

        set((s) => ({
          rooms: s.rooms.map((r) => ({
            ...r,
            actionItems: r.actionItems.map((a) => {
              if (a.id === actionId) {
                targetTitle = a.title;
                return { ...a, pushedToCrm: true };
              }
              return a;
            }),
          })),
          recordings: s.recordings.map((rec) => ({
            ...rec,
            actionItems: rec.actionItems.map((a) => {
              if (a.id === actionId) {
                targetTitle = a.title;
                return { ...a, pushedToCrm: true };
              }
              return a;
            }),
          })),
        }));

        // Bridge into Helix CRM store
        try {
          import('@/crm/store').then(({ useCrm }) => {
            const firstDeal = useCrm.getState().deals[0];
            if (firstDeal) {
              useCrm.getState().triggerDealNextBestAction(firstDeal.id);
            }
          });
        } catch {
          // ignore in isolated tests
        }

        safeToast(
          'success',
          'Synced Outcome to Helix CRM Deal Room',
          `"${targetTitle}" logged on NEOM Sovereign Grid`,
        );
      },

      saveRoomToRecordingVault() {
        const state = get();
        const room =
          state.rooms.find((r) => r.id === state.activeRoomId) ?? state.rooms[0];

        const rec: MeetRecording = {
          id: `rec-${Date.now().toString(36)}`,
          code: `REC-2026-${900 + state.recordings.length}`,
          title: room.title,
          recordedAtLabel: 'Just now · Live Vault Snapshot',
          durationLabel: `${room.elapsedMinutes}m 12s`,
          durationMins: room.elapsedMinutes,
          sigil: room.sigil,
          color: room.color,
          hostId: room.participants[0]?.userId ?? 'u-layla',
          participantIds: room.participants.map((p) => p.userId),
          linkedAppLabel: room.linkedAppLabel ?? 'Helix Workspace',
          linkedAppTo: room.linkedAppTo ?? '/projects',
          sentimentScore: 97,
          engagementWaveform: [72, 85, 91, 96, 88, 94, 98, 92, 87, 95, 97, 93, 89, 96, 98, 99],
          executiveSummary: `Nova Scribe captured ${room.decisions.length} key decisions and ${room.actionItems.length} action items during "${room.title}".`,
          decisions: [...room.decisions],
          chapters: [
            {
              id: `ch-live-1`,
              startLabel: '00:00',
              startSec: 0,
              title: 'Executive Context & Bilingual Alignment',
              summary: room.transcript[0]?.textEn ?? room.subtitle,
              speakerId: room.participants[0]?.userId ?? 'u-layla',
            },
            {
              id: `ch-live-2`,
              startLabel: '09:30',
              startSec: 570,
              title: 'Decisions & Cross-App Action Assignment',
              summary: room.decisions[0] ?? 'Action items synced to Projects & CRM.',
              speakerId: room.participants[1]?.userId ?? 'u-omar',
            },
          ],
          actionItems: [...room.actionItems],
          viewsCount: 1,
        };

        set((s) => ({
          recordings: [rec, ...s.recordings],
          activeRecordingId: rec.id,
          activeChapterId: rec.chapters[0].id,
        }));

        safeToast(
          'success',
          `Saved ${rec.code} to AI Recording Vault`,
          `${rec.decisions.length} decisions & ${rec.actionItems.length} action items indexed`,
        );
        return rec;
      },

      shareRecordingToChat(recordingId) {
        const rec = get().recordings.find((r) => r.id === recordingId);
        if (!rec) return;

        set((s) => ({
          recordings: s.recordings.map((r) =>
            r.id === recordingId ? { ...r, sharedToChat: true } : r,
          ),
        }));

        safeToast(
          'success',
          'Posted AI Recap Card to Pulse Chat #general',
          `${rec.code} · ${rec.title}`,
        );
      },

      createAsyncClip(input) {
        const clip: AsyncVideoClip = {
          id: `clip-${Date.now().toString(36)}`,
          code: `CLIP-${410 + get().clips.length}`,
          title: input.title.trim() || 'Async Architecture & Sprint Walkthrough',
          summary:
            input.summary.trim() ||
            'Recorded in HoloMeet Async Studio with automatic bilingual captions and chapter markers.',
          authorId: input.authorId ?? 'u-layla',
          category: input.category,
          durationLabel: '02:45',
          createdAtLabel: 'Just now',
          sigil:
            input.category === 'customer_brief'
              ? 'orbit'
              : input.category === 'eng_demo'
                ? 'chip'
                : 'prism',
          color:
            input.category === 'customer_brief'
              ? '#fb923c'
              : input.category === 'eng_demo'
                ? '#22d3ee'
                : '#f472b6',
          views: 1,
          hoursSavedTotal: 6.5,
          reactions: { '🚀': 1 },
          keyTakeaways: input.keyTakeaways?.length
            ? input.keyTakeaways
            : [
                'Replaces a 30-minute synchronous status call across 12 teammates (+6h saved)',
                'Auto-transcribed in English & Arabic with 1-click Projects task creation',
              ],
          comments: [],
        };

        set((s) => ({
          clips: [clip, ...s.clips],
        }));

        safeToast(
          'success',
          `Published Async Clip ${clip.code}`,
          `Saved 6.5 team hours · "${clip.title}"`,
        );
        return clip;
      },

      reactToClip(clipId, emoji) {
        set((s) => ({
          clips: s.clips.map((c) =>
            c.id === clipId
              ? {
                  ...c,
                  reactions: {
                    ...c.reactions,
                    [emoji]: (c.reactions[emoji] ?? 0) + 1,
                  },
                }
              : c,
          ),
        }));
      },

      commentOnClip(clipId, text, authorId = 'u-layla') {
        const clean = text.trim();
        if (!clean) return;
        set((s) => ({
          clips: s.clips.map((c) =>
            c.id === clipId
              ? {
                  ...c,
                  comments: [
                    ...c.comments,
                    {
                      id: `cm-${Date.now()}`,
                      authorId,
                      timestampSec: 65,
                      text: clean,
                    },
                  ],
                }
              : c,
          ),
        }));
        safeToast('success', 'Added timestamped comment to Clip');
      },

      resetMeet() {
        set(buildMeetSeed());
        safeToast('info', 'Helix Meet reset to baseline seed');
      },
    }),
    {
      name: 'nexus-meet-v1',
      version: MEET_DATA_VERSION,
      storage: createJSONStorage(() => safeStorage),
    },
  ),
);
