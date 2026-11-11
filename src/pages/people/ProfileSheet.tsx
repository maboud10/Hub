import { useEffect, useMemo, useRef, type CSSProperties, type ReactNode } from 'react';
import {
  Award,
  Ban,
  Cake,
  CalendarDays,
  ChevronRight,
  Clock,
  Copy,
  IdCard,
  Link2,
  Lock,
  LockKeyhole,
  LockOpen,
  Mail,
  MapPin,
  MessagesSquare,
  Network,
  PenLine,
  Phone,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UsersRound,
  X,
} from 'lucide-react';
import type { Role, User } from '@/types';
import { Sheet } from '@/components/ui/Sheet';
import { Avatar, ClearanceBadge, PRESENCE_LABEL, RoleChip } from '@/components/ui/primitives';
import { useHub } from '@/store/hub';
import { useCan, useRoles, useSessionUser } from '@/store/selectors';
import { toast } from '@/store/toast';
import { clearanceOf, isGrantActive, primaryRole } from '@/lib/rbac';
import { firstName, relativeTime, tzLabel } from '@/lib/format';
import { cx } from '@/lib/cx';
import { EmailLink } from '@/components/apps/EmailLink';
import { LocalTime } from './PersonCard';
import {
  DEPARTMENT_ICON,
  KUDOS_META,
  formatBirthday,
  formatStartDate,
  isBirthdayToday,
  isVisibleTo,
  tenure,
} from './peopleUtils';

interface ProfileSheetProps {
  /** User to display (kept while the sheet animates out). */
  userId: string | null;
  open: boolean;
  now: number;
  viewerOffset: number;
  onClose(): void;
  onSelect(id: string): void;
  onMessage(user: User): void;
  onKudos(user: User): void;
  onEditSelf(): void;
}

/** Classified-document style placeholder for fields the viewer may not see. */
export function Redacted({ width = 110, label = 'Requires People Ops clearance' }: { width?: number; label?: string }) {
  return (
    <span className="ppl-redact" tabIndex={0} role="img" aria-label={`Redacted. ${label}`} data-tip={label}>
      <LockKeyhole aria-hidden="true" />
      <span className="ppl-redact__bar" style={{ width }} aria-hidden="true">
        <span className="ppl-redact__glyphs">████████████</span>
      </span>
    </span>
  );
}

function Fact({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="ppl-fact">
      <dt className="ppl-fact__label">
        {icon}
        {label}
      </dt>
      <dd className="ppl-fact__value">{children}</dd>
    </div>
  );
}

async function copy(text: string, success: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(success);
  } catch {
    toast.info('Copy this manually', text);
  }
}

export function ProfileSheet({ userId, open, now, viewerOffset, onClose, onSelect, onMessage, onKudos, onEditSelf }: ProfileSheetProps) {
  const users = useHub((s) => s.users);
  const kudos = useHub((s) => s.kudos);
  const roles = useRoles();
  const me = useSessionUser();
  const canSensitive = useCan('hub.people.sensitive');
  const canManage = useCan('hub.users.manage');
  const canKudos = useCan('hub.kudos.give');

  const user = useMemo(() => users.find((u) => u.id === userId) ?? null, [users, userId]);

  const related = useMemo(() => {
    if (!user) return null;
    const visible = (u: User) => isVisibleTo(u, canManage);
    const manager = user.managerId ? users.find((u) => u.id === user.managerId && visible(u)) : undefined;
    const reports = users.filter((u) => u.managerId === user.id && visible(u)).sort((a, b) => a.name.localeCompare(b.name));
    const received = kudos.filter((k) => k.toId === user.id).sort((a, b) => b.at - a.at);
    return { manager, reports, received };
  }, [user, users, kudos, canManage]);

  // In-sheet navigation (manager / direct reports): announce the new person and start at the top.
  const nameRef = useRef<HTMLHeadingElement>(null);
  const prev = useRef({ id: userId, open });
  useEffect(() => {
    const was = prev.current;
    if (open && was.open && userId && was.id !== userId) {
      const heading = nameRef.current;
      heading?.focus({ preventScroll: true });
      heading?.closest('.sheet__body')?.scrollTo({ top: 0, behavior: document.documentElement.dataset.motion === 'reduced' ? 'auto' : 'smooth' });
    }
    prev.current = { id: userId, open };
  }, [userId, open]);

  if (!user || !related) return null;

  const isSelf = me?.id === user.id;
  // Your own record is always yours to see; everyone else's needs the sensitive-data permission.
  const showSensitive = canSensitive || isSelf;
  const DeptIcon = DEPARTMENT_ICON[user.department];
  const first = firstName(user.name);
  const userRoles = user.roleIds.map((id) => roles.find((r) => r.id === id)).filter((r): r is Role => !!r);
  const primary = primaryRole(user, roles);
  const directGrants = user.grants.filter((g) => isGrantActive(g, now)).length;
  const usersById = new Map(users.map((u) => [u.id, u]));
  const { manager, reports, received } = related;
  const showLastActive = (user.presence === 'away' || user.presence === 'offline') && user.lastActiveAt;

  const copyLink = () => {
    const url = new URL(window.location.href);
    url.search = '';
    url.hash = '';
    url.searchParams.set('u', user.id);
    void copy(url.toString(), 'Profile link copied');
  };

  const header = (
    <div className="sheet__head ppl-sheet__head">
      <span className="ppl-sheet__crumb">
        <UsersRound aria-hidden="true" />
        <span>Directory</span>
        <ChevronRight aria-hidden="true" />
        <span className="truncate">{first}</span>
      </span>
      <span className="spacer" />
      <button type="button" className="icon-btn" onClick={copyLink} aria-label="Copy link to this profile" data-tip="Copy link" data-tip-pos="bottom">
        <Link2 />
      </button>
      <button type="button" className="icon-btn" onClick={onClose} aria-label="Close profile">
        <X />
      </button>
    </div>
  );

  const footer = isSelf ? (
    <button type="button" className="btn btn--primary grow" onClick={onEditSelf}>
      <PenLine /> Edit profile &amp; status
    </button>
  ) : (
    <>
      {user.active && (
        <button type="button" className="btn btn--primary grow" onClick={() => onMessage(user)}>
          <MessagesSquare /> Message
        </button>
      )}
      <EmailLink className={cx('btn', !user.active && 'grow')} to={user.email}>
        <Mail /> Email
      </EmailLink>
      {canKudos && user.active && (
        <button type="button" className="btn" onClick={() => onKudos(user)}>
          <Award /> Kudos
        </button>
      )}
    </>
  );

  return (
    <Sheet open={open} onClose={onClose} header={header} footer={footer} width={480} label={`${user.name} — profile`} className="ppl-sheet">
      <div className="ppl-profile">
        {/* ── Identity ── */}
        <section className="ppl-hero" style={{ '--hue': user.avatarHue } as CSSProperties}>
          <div className="ppl-hero__glow" aria-hidden="true" />
          <div className="ppl-hero__avatar">
            <Avatar user={user} size={88} presence />
          </div>
          <div className="ppl-hero__text">
            <h2 className="ppl-hero__name" ref={nameRef} tabIndex={-1}>
              {user.name}
              {user.pronouns && <span className="ppl-pronouns">{user.pronouns}</span>}
            </h2>
            <p className="ppl-hero__title">{user.title}</p>
            <div className="ppl-hero__badges">
              <span className="tag">
                <DeptIcon aria-hidden="true" /> {user.department}
              </span>
              {isSelf && <span className="badge badge--solid">You</span>}
              {!user.active && (
                <span className="badge badge--danger">
                  <Ban /> Deactivated
                </span>
              )}
              {showSensitive && isBirthdayToday(user.birthday, now) && (
                <span className="badge badge--warning">
                  <Cake /> Birthday today
                </span>
              )}
            </div>
          </div>
        </section>

        <div className={cx('ppl-presence', `dot--${user.presence}`)}>
          <span className={cx('dot', `dot--${user.presence}`, user.presence === 'online' && 'dot--pulse')} aria-hidden="true" />
          <div className="grow">
            <div className="ppl-presence__label">
              {PRESENCE_LABEL[user.presence]}
              {showLastActive && <span className="faint"> · active {relativeTime(user.lastActiveAt!, now)}</span>}
            </div>
            {user.statusMessage ? (
              <div className="ppl-presence__msg">“{user.statusMessage}”</div>
            ) : (
              <div className="faint text-sm">No status message</div>
            )}
          </div>
        </div>

        {/* ── Work ── */}
        <section className="ppl-block" aria-labelledby="ppl-work-title">
          <h3 id="ppl-work-title" className="ppl-block__title">
            <MapPin aria-hidden="true" /> Work
          </h3>
          <dl className="ppl-facts">
            <Fact icon={<DeptIcon aria-hidden="true" />} label="Department">
              {user.department}
            </Fact>
            <Fact icon={<MapPin aria-hidden="true" />} label="Location">
              {user.location}
            </Fact>
            <Fact icon={<Clock aria-hidden="true" />} label="Local time">
              <span className="ppl-fact__stack">
                <LocalTime user={user} now={now} viewerOffset={viewerOffset} verbose />
                <span className="faint text-xs mono">
                  {user.timezone.replace(/_/g, ' ')} · {tzLabel(user.timezone, new Date(now))}
                </span>
              </span>
            </Fact>
            <Fact icon={<Mail aria-hidden="true" />} label="Work email">
              <span className="ppl-fact__inline">
                <EmailLink className="ppl-link truncate" to={user.email}>
                  {user.email}
                </EmailLink>
                <button
                  type="button"
                  className="icon-btn ppl-copy"
                  onClick={() => void copy(user.email, 'Email copied')}
                  aria-label={`Copy ${first}’s email`}
                  data-tip="Copy"
                >
                  <Copy />
                </button>
              </span>
            </Fact>
          </dl>
        </section>

        {/* ── Sensitive ── */}
        <section className={cx('ppl-block ppl-secure', !showSensitive && 'is-locked')} aria-labelledby="ppl-secure-title">
          <div className="ppl-block__head">
            <h3 id="ppl-secure-title" className="ppl-block__title">
              <LockKeyhole aria-hidden="true" /> Confidential
            </h3>
            {showSensitive ? (
              <span className="badge badge--success">
                <LockOpen /> {canSensitive ? 'Clearance verified' : 'Your record'}
              </span>
            ) : (
              <span className="badge badge--muted">
                <Lock /> Restricted
              </span>
            )}
          </div>
          <dl className="ppl-facts">
            <Fact icon={<Phone aria-hidden="true" />} label="Phone">
              {showSensitive ? (
                <a className="ppl-link mono" href={`tel:${user.phone.replace(/[^\d+]/g, '')}`}>
                  {user.phone}
                </a>
              ) : (
                <Redacted width={132} />
              )}
            </Fact>
            <Fact icon={<IdCard aria-hidden="true" />} label="Employee ID">
              {showSensitive ? <span className="mono">{user.employeeId}</span> : <Redacted width={86} />}
            </Fact>
            <Fact icon={<CalendarDays aria-hidden="true" />} label="Start date">
              {showSensitive ? (
                <span>
                  {formatStartDate(user.startDate)} <span className="faint">· {tenure(user.startDate, now)}</span>
                </span>
              ) : (
                <Redacted width={112} />
              )}
            </Fact>
            <Fact icon={<Cake aria-hidden="true" />} label="Birthday">
              {showSensitive ? user.birthday ? formatBirthday(user.birthday) : <span className="faint">Not shared</span> : <Redacted width={94} />}
            </Fact>
          </dl>
          {showSensitive ? (
            !canSensitive && <p className="ppl-secure__note">Only you and People Ops can see these details.</p>
          ) : (
            <p className="ppl-secure__note">
              <ShieldAlert aria-hidden="true" />
              <span>
                Hidden by access policy — requires <strong>View sensitive employee data</strong>.
              </span>
            </p>
          )}
        </section>

        {/* ── Access (user managers only) ── */}
        {canManage && (
          <section className="ppl-block ppl-access" aria-labelledby="ppl-access-title">
            <div className="ppl-block__head">
              <h3 id="ppl-access-title" className="ppl-block__title">
                <ShieldCheck aria-hidden="true" /> Access
              </h3>
              <ClearanceBadge level={clearanceOf(user, roles)} label={primary?.name} />
            </div>
            <div className="row row--wrap">
              {userRoles.map((r) => (
                <RoleChip key={r.id} name={r.name} color={r.color} />
              ))}
              {!userRoles.length && <span className="faint text-sm">No roles assigned</span>}
            </div>
            <p className="field-hint">
              {directGrants ? `${directGrants} active direct grant${directGrants === 1 ? '' : 's'}` : 'No direct grants'} · visible to user
              managers only
            </p>
          </section>
        )}

        {/* ── Reporting line ── */}
        <section className="ppl-block" aria-labelledby="ppl-org-title">
          <h3 id="ppl-org-title" className="ppl-block__title">
            <Network aria-hidden="true" /> Reporting line
          </h3>
          {manager ? (
            <button type="button" className="ppl-person-row" onClick={() => onSelect(manager.id)}>
              <Avatar user={manager} size={38} presence />
              <span className="ppl-person-row__text">
                <span className="ppl-person-row__label">Reports to</span>
                <span className="ppl-person-row__name truncate">{manager.name}</span>
                <span className="faint text-xs truncate">{manager.title}</span>
              </span>
              <ChevronRight aria-hidden="true" className="ppl-person-row__chev" />
            </button>
          ) : (
            <p className="faint text-sm">Top of the org chart.</p>
          )}
          {reports.length > 0 && (
            <>
              <div className="ppl-block__sub">
                Direct reports <span className="mono faint">· {reports.length}</span>
              </div>
              <ul className="ppl-reports">
                {reports.map((r) => (
                  <li key={r.id}>
                    <button type="button" className="ppl-pill" onClick={() => onSelect(r.id)} aria-label={`${r.name}, ${r.title}`} title={`${r.name} · ${r.title}`}>
                      <Avatar user={r} size={26} presence />
                      <span>{firstName(r.name)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        {/* ── Skills ── */}
        {user.skills.length > 0 && (
          <section className="ppl-block" aria-labelledby="ppl-skills-title">
            <h3 id="ppl-skills-title" className="ppl-block__title">
              <Sparkles aria-hidden="true" /> Skills
            </h3>
            <ul className="ppl-skills">
              {user.skills.map((s) => (
                <li key={s} className="ppl-skill">
                  {s}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ── Kudos ── */}
        <section className="ppl-block" aria-labelledby="ppl-kudos-title">
          <div className="ppl-block__head">
            <h3 id="ppl-kudos-title" className="ppl-block__title">
              <Award aria-hidden="true" /> Kudos received
            </h3>
            <span className="ppl-count mono">{received.length}</span>
          </div>
          {received.length ? (
            <ul className="ppl-kudos">
              {received.slice(0, 3).map((k) => {
                const from = usersById.get(k.fromId);
                const meta = KUDOS_META[k.value];
                return (
                  <li key={k.id} className="ppl-kudo">
                    {from ? <Avatar user={from} size={32} /> : <span className="ppl-kudo__anon" aria-hidden="true" />}
                    <div className="grow">
                      <div className="ppl-kudo__meta">
                        <strong>{from ? (from.id === me?.id ? 'You' : firstName(from.name)) : 'Someone'}</strong>
                        <span className="badge badge--muted">
                          <span aria-hidden="true">{meta.emoji}</span> {meta.label}
                        </span>
                        <span className="faint text-xs">{relativeTime(k.at, now)}</span>
                      </div>
                      <p className="ppl-kudo__msg">{k.message}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="faint text-sm">
              No kudos yet{canKudos && !isSelf && user.active ? ` — be the first to recognise ${first}’s work.` : '.'}
            </p>
          )}
        </section>
      </div>
    </Sheet>
  );
}
