/**
 * Helix Meet — "HoloMeet · Spatial Video, Live AI Scribe & Async Clips Studio"
 * Domain types for pre-flight green-room hardware, live spatial rooms,
 * bilingual (EN ↔ AR) simultaneous transcripts, AI action items synced to
 * Helix Projects & CRM, AI Recording Vault, and Async Video Clips.
 */
import type { SigilId } from '@/projects/sigils';

export type StageLayoutMode = 'spatial_orbit' | 'speaker_spotlight' | 'grid';

export type BackgroundMode = 'nebula_holo' | 'studio_blur' | 'executive_atrium' | 'none';

export interface GreenRoomConfig {
  micOn: boolean;
  cameraOn: boolean;
  screenShareOn: boolean;
  noiseSuppressionPct: number; // e.g. 99.4
  spatialAudioOn: boolean;
  bilingualCaptionsOn: boolean; // Live EN <-> AR subtitles
  novaScribeAutoJoin: boolean;
  backgroundMode: BackgroundMode;
  stageLayout: StageLayoutMode;
  isRecording: boolean;
  handRaised: boolean;
}

export interface RoomParticipant {
  userId: string;
  roleLabel: string;
  hub: string;
  speaking: boolean;
  muted: boolean;
  cameraOn: boolean;
  handRaised?: boolean;
  talkTimePct: number;
  sentiment: 'energized' | 'aligned' | 'focused';
  audioLevel: number; // 0..100 for live frequency ring
}

export interface TranscriptLine {
  id: string;
  speakerId: string;
  timestamp: string;
  textEn: string;
  textAr: string;
  highlightKind?: 'decision' | 'action' | 'risk' | 'insight';
}

export interface MeetActionItem {
  id: string;
  title: string;
  ownerId: string;
  dueLabel: string;
  linkedApp: 'projects' | 'crm' | 'chat';
  pushedToProjects?: boolean;
  pushedToCrm?: boolean;
  projectTaskId?: string;
}

export interface MeetLivePoll {
  id: string;
  question: string;
  options: { id: string; label: string; votes: string[] }[];
}

export interface ActiveMeetRoom {
  id: string;
  code: string;
  title: string;
  subtitle: string;
  sigil: SigilId;
  color: string;
  calendarEventId?: string;
  linkedAppLabel?: string;
  linkedAppTo?: string;
  linkedCrmDealId?: string;
  startedAt: number;
  elapsedMinutes: number;
  participants: RoomParticipant[];
  transcript: TranscriptLine[];
  decisions: string[];
  actionItems: MeetActionItem[];
  livePoll: MeetLivePoll;
  whiteboardNotes: string[];
  recentReactions: { id: string; emoji: string; userId: string; at: number }[];
}

export interface RecordingChapter {
  id: string;
  startLabel: string;
  startSec: number;
  title: string;
  summary: string;
  speakerId: string;
}

export interface MeetRecording {
  id: string;
  code: string;
  title: string;
  recordedAtLabel: string;
  durationLabel: string;
  durationMins: number;
  sigil: SigilId;
  color: string;
  hostId: string;
  participantIds: string[];
  linkedAppLabel: string;
  linkedAppTo: string;
  sentimentScore: number; // 0..100
  engagementWaveform: number[]; // 16 bars 0..100
  executiveSummary: string;
  decisions: string[];
  chapters: RecordingChapter[];
  actionItems: MeetActionItem[];
  viewsCount: number;
  sharedToChat?: boolean;
}

export interface AsyncClipComment {
  id: string;
  authorId: string;
  timestampSec: number;
  text: string;
}

export interface AsyncVideoClip {
  id: string;
  code: string;
  title: string;
  summary: string;
  authorId: string;
  category: 'design_walkthrough' | 'exec_update' | 'eng_demo' | 'customer_brief';
  durationLabel: string;
  createdAtLabel: string;
  sigil: SigilId;
  color: string;
  views: number;
  hoursSavedTotal: number;
  reactions: Record<string, number>;
  keyTakeaways: string[];
  comments: AsyncClipComment[];
}

export interface MeetPulseAnalytics {
  asyncHoursSavedMonth: number;
  meetingsDeflectedCount: number;
  avgDecisionVelocityPerCall: number;
  talkTimeEquityScore: number; // 0..100
  actionItemCompletionPct: number;
  bilingualSessionsPct: number;
}

export interface MeetData {
  version: number;
  greenRoom: GreenRoomConfig;
  activeRoomId: string;
  rooms: ActiveMeetRoom[];
  recordings: MeetRecording[];
  clips: AsyncVideoClip[];
  activeRecordingId: string;
  activeChapterId: string | null;
}
