import { Building, CircleAlert, Info, Laptop, PartyPopper, Rocket, TriangleAlert, Users, type LucideIcon } from 'lucide-react';
import type { AnnouncementCategory, AnnouncementPriority } from '@/types';

export const NEWS_CATEGORIES: AnnouncementCategory[] = ['Company', 'Product', 'People', 'IT', 'Events'];

export const CATEGORY_ICON: Record<AnnouncementCategory, LucideIcon> = {
  Company: Building,
  Product: Rocket,
  People: Users,
  IT: Laptop,
  Events: PartyPopper,
};

export const PRIORITIES: AnnouncementPriority[] = ['normal', 'important', 'critical'];

export const PRIORITY_META: Record<AnnouncementPriority, { label: string; icon: LucideIcon; hint: string }> = {
  normal: { label: 'Normal', icon: Info, hint: 'A regular update in the feed.' },
  important: { label: 'Important', icon: CircleAlert, hint: 'Highlighted with an amber accent so it stands out.' },
  critical: {
    label: 'Critical',
    icon: TriangleAlert,
    hint: 'Red-alert styling and a “Critical:” notification — reserve for action-required news.',
  },
};

/** Always offered on every post; any other emoji already used on a post is shown too. */
export const DEFAULT_REACTIONS = ['👍', '🎉', '❤️', '🚀', '👀'];

/** "You, Omar and Sara" · "Omar, Sara and 3 others". */
export function summarizeNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length <= 3) return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `${names.slice(0, 2).join(', ')} and ${names.length - 2} others`;
}

export function prefersReducedMotion(): boolean {
  if (typeof document === 'undefined') return false;
  return document.documentElement.dataset.motion === 'reduced' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
