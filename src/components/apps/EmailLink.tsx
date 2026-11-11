import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router';
import { useCan } from '@/store/selectors';
import { mailComposeHref, type ComposeLink } from '@/mail/link';

type EmailLinkProps = Omit<ComposeLink, 'to'> & {
  /** Hub user ids or email addresses. */
  to: string | string[];
  children: ReactNode;
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'children'>;

/** RFC 6068 mailto: URL (spaces as %20, not +). */
export function mailtoUrl({ to, cc, subject, body }: ComposeLink & { to: string | string[] }): string {
  const join = (v?: string | string[]) => (Array.isArray(v) ? v : v ? [v] : []).join(',');
  const q: string[] = [];
  if (join(cc)) q.push(`cc=${encodeURIComponent(join(cc))}`);
  if (subject) q.push(`subject=${encodeURIComponent(subject)}`);
  if (body) q.push(`body=${encodeURIComponent(body)}`);
  return `mailto:${join(to)}${q.length ? `?${q.join('&')}` : ''}`;
}

/**
 * "Email someone" link used across the hub (People, Talent…). Opens Nova
 * Inbox's composer in-hub when the viewer has Helix Mail, and falls back to
 * the device mail client (mailto:) for people without it.
 */
export function EmailLink({ to, cc, subject, body, children, ...rest }: EmailLinkProps) {
  const canMail = useCan('app:mail');
  if (canMail) {
    return (
      <Link to={mailComposeHref({ to, cc, subject, body })} {...rest}>
        {children}
      </Link>
    );
  }
  return (
    <a href={mailtoUrl({ to, cc, subject, body })} {...rest}>
      {children}
    </a>
  );
}
