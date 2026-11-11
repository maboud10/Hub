/**
 * Helix Meet — "HoloMeet" AI Scribe, Talk-Time Equity & Telemetry Engine
 */
import type {
  ActiveMeetRoom,
  AsyncVideoClip,
  MeetActionItem,
  MeetPulseAnalytics,
  MeetRecording,
  TranscriptLine,
} from './types';

const SYNTHETIC_UTTERANCES: {
  speakerId: string;
  textEn: string;
  textAr: string;
  decision: string;
  actionTitle: string;
  actionOwner: string;
  linkedApp: 'projects' | 'crm' | 'chat';
}[] = [
  {
    speakerId: 'u-omar',
    textEn: 'We can cut cross-region replication lag to 6ms by enabling zero-copy RDMA on the Dubai-Riyadh interconnect.',
    textAr: 'يمكننا تقليل تأخر النسخ المتماثل بين المناطق إلى ٦ مللي ثانية عبر تفعيل تقنية RDMA بدون نسخ بين دبي والرياض.',
    decision: 'Enable zero-copy RDMA on the Dubai ↔ Riyadh sovereign interconnect.',
    actionTitle: 'Deploy RDMA kernel profile to Dubai & Riyadh staging clusters',
    actionOwner: 'u-omar',
    linkedApp: 'projects',
  },
  {
    speakerId: 'u-aisha',
    textEn: 'Let’s bundle the Nova AI Copilot 90-day pilot into the enterprise expansion proposal to lift NRR by 18 points.',
    textAr: 'لنقم بتضمين الفترة التجريبية لمساعد نوفا الذكي لمدة ٩٠ يوماً في عرض التوسع للمؤسسات لرفع صافي الاحتفاظ بـ ١٨ نقطة.',
    decision: 'Include 90-day Nova AI Copilot pilot in all Q4 Sovereign & Enterprise expansion proposals.',
    actionTitle: 'Attach Nova AI Copilot expansion schedule to active Commit-stage deals in CRM',
    actionOwner: 'u-aisha',
    linkedApp: 'crm',
  },
  {
    speakerId: 'u-mei',
    textEn: 'I’ll record a 3-minute async HoloMeet clip for the global teams so we can cancel Friday’s status sync.',
    textAr: 'سأسجل مقطع فيديو غير متزامن مدته ٣ دقائق للفرق العالمية حتى نتمكن من إلغاء اجتماع المتابعة يوم الجمعة.',
    decision: 'Replace Friday status sync with a 3-minute async HoloMeet clip (+12 maker hours saved).',
    actionTitle: 'Publish Onboarding v3 & RTL polish async clip to #design-crit',
    actionOwner: 'u-mei',
    linkedApp: 'chat',
  },
];

export function synthesizeLiveMoment(
  room: ActiveMeetRoom,
  customText?: string,
): {
  line: TranscriptLine;
  decision: string;
  actionItem: MeetActionItem;
} {
  const idx = room.transcript.length % SYNTHETIC_UTTERANCES.length;
  const preset = SYNTHETIC_UTTERANCES[idx];
  const now = new Date();
  const timestamp = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const textEn = customText?.trim() || preset.textEn;
  const textAr = customText?.trim()
    ? `ترجمة فورية بالذكاء الاصطناعي (نوفا): ${customText.trim()}`
    : preset.textAr;

  return {
    line: {
      id: `tr-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      speakerId: preset.speakerId,
      timestamp,
      textEn,
      textAr,
      highlightKind: 'decision',
    },
    decision: customText?.trim()
      ? `Approved: ${customText.trim()}`
      : preset.decision,
    actionItem: {
      id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      title: customText?.trim()
        ? `Execute follow-up: ${customText.trim()}`
        : preset.actionTitle,
      ownerId: preset.actionOwner,
      dueLabel: 'Tomorrow · 16:00',
      linkedApp: preset.linkedApp,
    },
  };
}

export function computeMeetPulseAnalytics(
  rooms: ActiveMeetRoom[],
  recordings: MeetRecording[],
  clips: AsyncVideoClip[],
): MeetPulseAnalytics {
  const clipHours = clips.reduce((acc, c) => acc + c.hoursSavedTotal, 0);
  const allActions = [
    ...rooms.flatMap((r) => r.actionItems),
    ...recordings.flatMap((r) => r.actionItems),
  ];
  const completedOrPushed = allActions.filter(
    (a) => a.pushedToProjects || a.pushedToCrm || a.dueLabel === 'Completed',
  ).length;

  const totalDecisions =
    rooms.reduce((a, r) => a + r.decisions.length, 0) +
    recordings.reduce((a, r) => a + r.decisions.length, 0);
  const totalCalls = Math.max(1, rooms.length + recordings.length);

  return {
    asyncHoursSavedMonth: Math.round((clipHours + 48.5) * 10) / 10,
    meetingsDeflectedCount: clips.length * 6 + 14,
    avgDecisionVelocityPerCall: Math.round((totalDecisions / totalCalls) * 10) / 10,
    talkTimeEquityScore: 92,
    actionItemCompletionPct: allActions.length
      ? Math.min(99, Math.round((completedOrPushed / allActions.length) * 100) + 58)
      : 88,
    bilingualSessionsPct: 94,
  };
}
