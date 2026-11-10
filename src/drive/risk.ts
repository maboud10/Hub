/**
 * Governance risk radar — oversharing findings with one-click fixes.
 * Pure: (ctx) → findings. Fixes are applied by the store (`fixFinding`).
 */
import type { Item } from './types';
import { DAY, LABEL_NAME, LEVEL_LABEL } from './meta';
import { ancestors, chainOf, dlpBlock, isTrashed, principalName, type EngineCtx } from './access';

export type FindingKind = 'org-wide-confidential' | 'restricted-stale' | 'restricted-long' | 'stale-public-link' | 'contractor-confidential';

export type FixAction =
  | { type: 'remove-share'; hostKind: 'item' | 'drive'; hostId: string; shareId: string }
  | { type: 'disable-link'; itemId: string }
  | { type: 'purge-expired'; itemId: string }
  | { type: 'clamp-expiry'; itemId: string; shareIds: string[]; days: number }
  | { type: 'move-out'; itemId: string; toParentId: string | null };

export interface Finding {
  id: string;
  kind: FindingKind;
  severity: 'high' | 'medium' | 'low';
  itemId: string;
  title: string;
  detail: string;
  fixLabel: string;
  fix: FixAction;
  /** Contractor/DLP findings: already blocked by policy (dormant) or live (exposed). */
  state: 'exposed' | 'dormant';
}

export const FINDING_NAME: Record<FindingKind, string> = {
  'org-wide-confidential': 'Confidential shared org-wide',
  'restricted-stale': 'Expired grants on Restricted items',
  'restricted-long': 'Restricted shares over the limit',
  'stale-public-link': 'Public links older than policy',
  'contractor-confidential': 'Contractors on Confidential items',
};

export function findRisks(ctx: EngineCtx): Finding[] {
  const out: Finding[] = [];
  const live = ctx.items.filter((i) => !isTrashed(ctx, i));
  const sensitive = (i: Item) => i.label === 'confidential' || i.label === 'restricted';

  for (const item of live) {
    const chain = chainOf(ctx, item);
    const rule = ctx.policy.rules[item.label];

    // 1) Confidential (or stricter) visible to everyone at Helix.
    if (sensitive(item) && item.kind !== 'folder') {
      for (const node of chain) {
        const s = node.shares.find((x) => x.principal.type === 'org' && (x.expiresAt === null || x.expiresAt > ctx.now));
        if (s) {
          const blocked = !!dlpBlock(rule, item.label, { principal: s.principal }, null);
          out.push({
            id: `org:${item.id}:${node.id}`,
            kind: 'org-wide-confidential',
            severity: blocked ? 'medium' : 'high',
            itemId: item.id,
            title: `${item.name}`,
            detail: `${LABEL_NAME[item.label]} item visible to everyone at Helix (${LEVEL_LABEL[s.level]}${node.id === item.id ? '' : ` via folder ${node.name}`}).`,
            fixLabel: node.id === item.id ? 'Remove org-wide share' : `Remove share on ${node.name}`,
            fix: { type: 'remove-share', hostKind: 'item', hostId: node.id, shareId: s.id },
            state: blocked ? 'dormant' : 'exposed',
          });
          break;
        }
        if (node.link.scope === 'org' || node.link.scope === 'anyone') {
          if (node.link.scope === 'anyone') break; // handled by the stale-link rule / DLP
          const blocked = !!dlpBlock(rule, item.label, { scope: node.link.scope }, null);
          out.push({
            id: `orglink:${item.id}:${node.id}`,
            kind: 'org-wide-confidential',
            severity: blocked ? 'medium' : 'high',
            itemId: item.id,
            title: item.name,
            detail: `${LABEL_NAME[item.label]} item open to anyone at Helix with the link${node.id === item.id ? '' : ` (link on ${node.name})`}.`,
            fixLabel: 'Restrict the link',
            fix: { type: 'disable-link', itemId: node.id },
            state: blocked ? 'dormant' : 'exposed',
          });
          break;
        }
      }
    }

    // 2) Restricted items: expired grants still on record, and shares beyond the max duration.
    if (item.label === 'restricted') {
      const expired = item.shares.filter((s) => s.expiresAt !== null && s.expiresAt <= ctx.now);
      if (expired.length)
        out.push({
          id: `stale:${item.id}`,
          kind: 'restricted-stale',
          severity: 'medium',
          itemId: item.id,
          title: item.name,
          detail: `${expired.length} expired grant${expired.length > 1 ? 's' : ''} (${expired.map((s) => principalName(ctx, s.principal)).join(', ')}) still listed on a Restricted item.`,
          fixLabel: 'Clean up expired grants',
          fix: { type: 'purge-expired', itemId: item.id },
          state: 'dormant',
        });
      const max = rule.maxShareDays;
      if (max !== null) {
        const long = item.shares.filter((s) => (s.expiresAt === null || s.expiresAt > ctx.now + max * DAY + DAY) && !(s.expiresAt !== null && s.expiresAt <= ctx.now));
        if (long.length)
          out.push({
            id: `long:${item.id}`,
            kind: 'restricted-long',
            severity: 'high',
            itemId: item.id,
            title: item.name,
            detail: `${long.map((s) => principalName(ctx, s.principal)).join(', ')} ${long.length > 1 ? 'have' : 'has'} ${long.some((s) => s.expiresAt === null) ? 'open-ended' : 'long'} access — Restricted shares must expire within ${max} days.`,
            fixLabel: `Set expiry to ${max} days`,
            fix: { type: 'clamp-expiry', itemId: item.id, shareIds: long.map((s) => s.id), days: max },
            state: 'exposed',
          });
      }
    }

    // 3) Public links older than the policy window.
    if (item.link.scope === 'anyone' && item.link.at && ctx.now - item.link.at > ctx.policy.staleLinkDays * DAY) {
      const days = Math.round((ctx.now - item.link.at) / DAY);
      out.push({
        id: `link:${item.id}`,
        kind: 'stale-public-link',
        severity: item.label === 'public' ? 'low' : 'medium',
        itemId: item.id,
        title: item.name,
        detail: `Anyone with the link has had ${LEVEL_LABEL[item.link.level].toLowerCase()} access for ${days} days (policy: ${ctx.policy.staleLinkDays}).`,
        fixLabel: 'Turn off public link',
        fix: { type: 'disable-link', itemId: item.id },
        state: 'exposed',
      });
    }

    // 4) Named contractor grants reaching Confidential / Restricted items.
    if (sensitive(item) && item.kind !== 'folder') {
      for (const [idx, node] of chain.entries()) {
        for (const s of node.shares) {
          if (s.principal.type !== 'user') continue;
          const u = ctx.user.get(s.principal.id);
          if (!u || !u.active || !u.roleIds.includes('contractor')) continue;
          if (s.expiresAt !== null && s.expiresAt <= ctx.now) continue;
          const dormant = !rule.contractors;
          const parentOfShared = idx === 0 ? null : (ancestors(ctx, node)[0]?.id ?? null);
          out.push({
            id: `contractor:${item.id}:${s.id}`,
            kind: 'contractor-confidential',
            severity: dormant ? 'low' : 'high',
            itemId: item.id,
            title: item.name,
            detail:
              idx === 0
                ? `${u.name} (contractor) has a direct ${LEVEL_LABEL[s.level].toLowerCase()} share${dormant ? ' — currently blocked by DLP' : ''}.`
                : `${u.name} (contractor) inherits ${LEVEL_LABEL[s.level]} from folder ${node.name}${dormant ? ' — currently blocked by DLP' : ''}.`,
            fixLabel: idx === 0 ? `Remove ${u.name.split(' ')[0]}` : `Move out of ${node.name}`,
            fix: idx === 0 ? { type: 'remove-share', hostKind: 'item', hostId: item.id, shareId: s.id } : { type: 'move-out', itemId: item.id, toParentId: parentOfShared },
            state: dormant ? 'dormant' : 'exposed',
          });
        }
      }
    }
  }

  const order = { high: 0, medium: 1, low: 2 };
  return out.sort((a, b) => order[a.severity] - order[b.severity] || a.title.localeCompare(b.title));
}
