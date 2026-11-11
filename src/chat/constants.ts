/**
 * Static catalog data for Pulse Chat (no React here — icons are mapped in the UI layer).
 */
import type { KudosValue } from '@/types';
import type { WorkspaceAppId } from '@/lib/appBridge';
import type { BotId, SendEffect } from './types';

export interface BotMeta {
  id: BotId;
  name: string;
  /** Workspace app the bot speaks for (Nova has none). */
  app?: WorkspaceAppId;
  c1: string;
  c2: string;
  blurb: string;
  /** Where the app lives. */
  to?: string;
}

export const BOTS: Record<BotId, BotMeta> = {
  'bot-projects': {
    id: 'bot-projects',
    name: 'Helix Projects',
    app: 'projects',
    c1: '#818cf8',
    c2: '#22d3ee',
    blurb: 'Task assignments, due dates and milestone updates.',
    to: '/projects',
  },
  'bot-drive': {
    id: 'bot-drive',
    name: 'Helix Drive',
    app: 'drive',
    c1: '#38bdf8',
    c2: '#34d399',
    blurb: 'Files shared with you, comments and access requests.',
    to: '/drive',
  },
  'bot-helpdesk': {
    id: 'bot-helpdesk',
    name: 'IT Helpdesk',
    app: 'helpdesk',
    c1: '#fb923c',
    c2: '#f43f5e',
    blurb: 'Ticket updates, incidents and device alerts.',
    to: '/helpdesk',
  },
  'bot-nova': {
    id: 'bot-nova',
    name: 'Nova',
    c1: '#a78bfa',
    c2: '#f472b6',
    blurb: 'Your AI teammate: catch-ups, summaries, reminders and drafts.',
  },
};

/** Card styling per workspace app (BridgeCard.app). */
export const APP_META: Record<WorkspaceAppId, { name: string; c1: string; c2: string }> = {
  projects: { name: 'Helix Projects', c1: '#818cf8', c2: '#22d3ee' },
  drive: { name: 'Helix Drive', c1: '#38bdf8', c2: '#34d399' },
  chat: { name: 'Pulse Chat', c1: '#22d3ee', c2: '#d946ef' },
  helpdesk: { name: 'IT Helpdesk', c1: '#fb923c', c2: '#f43f5e' },
  performance: { name: 'Performance & OKRs', c1: '#f59e0b', c2: '#ec4899' },
  procurement: { name: 'Procurement', c1: '#14b8a6', c2: '#06b6d4' },
  crm: { name: 'CRM', c1: '#f97316', c2: '#facc15' },
  insights: { name: 'Insights', c1: '#38bdf8', c2: '#8b5cf6' },
  meet: { name: 'Helix Meet', c1: '#34d399', c2: '#06b6d4' },
  calendar: { name: 'Helix Calendar', c1: '#f472b6', c2: '#8b5cf6' },
  mail: { name: 'Helix Mail', c1: '#38bdf8', c2: '#6366f1' },
  wellbeing: { name: 'Helix Wellbeing', c1: '#fb7185', c2: '#a855f7' },
  devhub: { name: 'DevHub', c1: '#a3e635', c2: '#22c55e' },
  cloud: { name: 'Cloud Console', c1: '#38bdf8', c2: '#2563eb' },
  incidents: { name: 'Incident Command', c1: '#f87171', c2: '#f97316' },
  vault: { name: 'Vault', c1: '#facc15', c2: '#f59e0b' },
  security: { name: 'Security Center', c1: '#f472b6', c2: '#e11d48' },
  spaces: { name: 'Spaces', c1: '#e879f9', c2: '#a855f7' },
};

export const KUDOS_VALUES: { id: KudosValue; label: string; blurb: string; tone: 'cyan' | 'violet' | 'pink' | 'amber' | 'emerald' }[] = [
  { id: 'teamwork', label: 'Teamwork', blurb: 'Lifted the whole team', tone: 'cyan' },
  { id: 'innovation', label: 'Innovation', blurb: 'Found a better way', tone: 'violet' },
  { id: 'customer', label: 'Customer love', blurb: 'Went the extra mile for customers', tone: 'pink' },
  { id: 'ownership', label: 'Ownership', blurb: 'Owned it end to end', tone: 'amber' },
  { id: 'craft', label: 'Craft', blurb: 'Sweated the details', tone: 'emerald' },
];
export const kudosMeta = (v: KudosValue) => KUDOS_VALUES.find((k) => k.id === v) ?? KUDOS_VALUES[0];

export const SEND_EFFECTS: { id: SendEffect; label: string; blurb: string }[] = [
  { id: 'confetti', label: 'Confetti', blurb: 'A burst of celebration' },
  { id: 'spotlight', label: 'Spotlight', blurb: 'Dims the room, lights your message' },
  { id: 'lasers', label: 'Lasers', blurb: 'Plasma beams sweep the channel' },
  { id: 'echo', label: 'Echo', blurb: 'Your words ripple outward' },
];

export const DEFAULT_QUICK_REACTIONS = ['👍', '🎉', '🔥'];

export const MOODS: { value: 1 | 2 | 3 | 4 | 5; emoji: string; label: string; color: string }[] = [
  { value: 1, emoji: '😫', label: 'Drained', color: '#fb7185' },
  { value: 2, emoji: '😕', label: 'Meh', color: '#fb923c' },
  { value: 3, emoji: '🙂', label: 'Okay', color: '#fbbf24' },
  { value: 4, emoji: '😄', label: 'Good', color: '#34d399' },
  { value: 5, emoji: '🤩', label: 'Energized', color: '#22d3ee' },
];

/** Daily Spark icebreakers — one per day, rotating. */
export const SPARK_QUESTIONS: string[] = [
  'What’s a hill you will gladly die on about food or tech?',
  'Show us your desk right now — what’s the one item you can’t work without?',
  'If you could teleport anywhere for lunch today, where are we going and what are we ordering?',
  'What was the first album, concert or video game you were completely obsessed with?',
  'What tiny habit or shortcut saves you 30 minutes every week?',
  'Coffee, matcha, karak chai or sparkling water — what fuels your afternoon?',
  'What’s something you learned this month that surprised you?',
  'Which app on your phone would you keep if you could only keep three?',
  'What’s the best piece of career advice you’ve ever received?',
  'If our team had a theme song, what would it be?',
  'What’s a skill you’d love to learn from someone at Helix?',
  'Describe your perfect weekend in three emoji.',
  'What’s the most underrated city you’ve ever visited?',
  'Which fictional character would be the best teammate — and why?',
];

/** Day index since the Unix epoch in local time. */
export function dayIndex(ts = Date.now()): number {
  const d = new Date(ts);
  return Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000) | 0);
}

/** Today’s Daily Spark question. */
export function sparkOfDay(ts = Date.now()): string {
  return SPARK_QUESTIONS[dayIndex(ts) % SPARK_QUESTIONS.length];
}

/** Conversation starters for Coffee Roulette matches. */
export const COFFEE_PROMPTS: string[] = [
  'Trade one thing you’re building this month and one thing you’re curious about.',
  'Share the best thing you ate this week — bonus points for a photo.',
  'What does a great Friday afternoon look like for your team?',
  'Swap one productivity trick each.',
  'What’s a project at Helix you wish more people knew about?',
];
