/**
 * Deep links into Nova Inbox's composer. No store imports — safe to use from
 * any app (People, Talent, CRM…) without pulling Mail into their bundle.
 *
 *   /mail?compose=1&to=grace.liu@helix.co,u-omar&subject=…&body=…
 *
 * `to` / `cc` accept hub user ids (`u-…`) or raw email addresses.
 */
export interface ComposeLink {
  to?: string | string[];
  cc?: string | string[];
  subject?: string;
  body?: string;
}

const list = (v?: string | string[]) =>
  (Array.isArray(v) ? v : v ? [v] : [])
    .map((s) => s.trim())
    .filter(Boolean)
    .join(',');

export function mailComposeHref({ to, cc, subject, body }: ComposeLink = {}): string {
  const p = new URLSearchParams({ compose: '1' });
  if (list(to)) p.set('to', list(to));
  if (list(cc)) p.set('cc', list(cc));
  if (subject) p.set('subject', subject);
  if (body) p.set('body', body);
  return `/mail?${p.toString()}`;
}

/** Parse the compose deep-link query (inverse of `mailComposeHref`). Returns null when `compose` isn't set. */
export function parseComposeLink(search: string): (Required<Pick<ComposeLink, 'subject' | 'body'>> & { to: string[]; cc: string[] }) | null {
  const p = new URLSearchParams(search);
  if (!p.get('compose')) return null;
  const split = (k: string) =>
    (p.get(k) ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  return { to: split('to'), cc: split('cc'), subject: p.get('subject') ?? '', body: p.get('body') ?? '' };
}
