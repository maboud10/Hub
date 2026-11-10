import { Award, Ban, Mail, MapPin, MessagesSquare, Moon, PenLine, Sun, Sunrise, Sunset } from 'lucide-react';
import type { User } from '@/types';
import { Avatar, PRESENCE_LABEL } from '@/components/ui/primitives';
import { firstName, formatTime } from '@/lib/format';
import { cx } from '@/lib/cx';
import {
  DAY_PHASE_LABEL,
  DEPARTMENT_ICON,
  dayPhase,
  localHour,
  offsetLabel,
  offsetSentence,
  tzOffsetMinutes,
} from './peopleUtils';

export interface PersonHandlers {
  onOpen(id: string): void;
  onMessage(user: User): void;
  onKudos(user: User): void;
  onEditSelf(): void;
}

interface PersonCardProps extends PersonHandlers {
  user: User;
  variant: 'grid' | 'list';
  now: number;
  /** Viewer's UTC offset in minutes (for the "+3h" hint). */
  viewerOffset: number;
  isSelf: boolean;
  canKudos: boolean;
}

/** Live local time with a day/night glyph and the offset relative to the viewer. */
export function LocalTime({
  user,
  now,
  viewerOffset,
  verbose = false,
}: {
  user: Pick<User, 'timezone'>;
  now: number;
  viewerOffset: number;
  verbose?: boolean;
}) {
  const hour = localHour(user.timezone, now);
  const phase = dayPhase(hour);
  const diff = tzOffsetMinutes(user.timezone, now) - viewerOffset;
  const PhaseIcon = phase === 'work' ? Sun : phase === 'night' ? Moon : hour < 12 ? Sunrise : Sunset;
  return (
    <span className={cx('ppl-time', `ppl-time--${phase}`)}>
      <PhaseIcon aria-hidden="true" />
      <span className="mono ppl-time__clock">{formatTime(now, user.timezone)}</span>
      <span className="ppl-time__offset mono">{verbose ? offsetSentence(diff) : offsetLabel(diff)}</span>
      <span className="sr-only">
        {' '}
        local time · {DAY_PHASE_LABEL[phase]}
        {verbose ? '' : ` · ${offsetSentence(diff)}`}
      </span>
    </span>
  );
}

function Actions({
  user,
  isSelf,
  canKudos,
  compact,
  onMessage,
  onKudos,
  onEditSelf,
}: Pick<PersonCardProps, 'user' | 'isSelf' | 'canKudos' | 'onMessage' | 'onKudos' | 'onEditSelf'> & { compact: boolean }) {
  const first = firstName(user.name);
  if (isSelf) {
    return compact ? (
      <button type="button" className="icon-btn ppl-icon-btn" onClick={onEditSelf} aria-label="Update your status" data-tip="Update status">
        <PenLine />
      </button>
    ) : (
      <button type="button" className="neo-btn neo-btn--soft neo-btn--block ppl-action-main" onClick={onEditSelf}>
        <PenLine /> Update my status
      </button>
    );
  }
  return (
    <>
      {user.active &&
        (compact ? (
          <button type="button" className="icon-btn ppl-icon-btn" onClick={() => onMessage(user)} aria-label={`Message ${first}`} data-tip="Message">
            <MessagesSquare />
          </button>
        ) : (
          <button type="button" className="neo-btn neo-btn--soft ppl-action-main" onClick={() => onMessage(user)}>
            <MessagesSquare /> Message
          </button>
        ))}
      <a
        className={cx('icon-btn ppl-icon-btn', compact && 'ppl-hide-xs')}
        href={`mailto:${user.email}`}
        aria-label={`Email ${first}`}
        data-tip="Email"
      >
        <Mail />
      </a>
      {canKudos && user.active && (
        <button
          type="button"
          className={cx('icon-btn ppl-icon-btn ppl-icon-btn--kudos', compact && 'ppl-hide-xs')}
          onClick={() => onKudos(user)}
          aria-label={`Give ${first} kudos`}
          data-tip="Give kudos"
        >
          <Award />
        </button>
      )}
    </>
  );
}

/** Directory entry — grid card or list row. The name is a stretched button that opens the profile. */
export function PersonCard(props: PersonCardProps) {
  const { user, variant, now, viewerOffset, isSelf, onOpen } = props;
  const DeptIcon = DEPARTMENT_ICON[user.department];
  const open = (
    <button type="button" className="ppl-open" onClick={() => onOpen(user.id)}>
      <span className="truncate">{user.name}</span>
      <span className="sr-only">, open profile</span>
    </button>
  );
  const badges = (
    <>
      {isSelf && <span className="badge badge--solid">You</span>}
      {!user.active && (
        <span className="badge badge--danger">
          <Ban /> Deactivated
        </span>
      )}
    </>
  );

  if (variant === 'list') {
    return (
      <article className={cx('ppl-row neo-spot', !user.active && 'is-inactive', isSelf && 'is-self')}>
        <Avatar user={user} size={44} presence />
        <div className="ppl-row__id">
          <div className="ppl-row__name">
            {open}
            {user.pronouns && <span className="ppl-pronouns">{user.pronouns}</span>}
            {badges}
          </div>
          <div className="ppl-row__title truncate">
            {user.title} <span className="faint">· {user.department}</span>
          </div>
        </div>
        <div className="ppl-row__status">
          <span className={`dot dot--${user.presence}`} aria-hidden="true" />
          <span className="truncate">
            {PRESENCE_LABEL[user.presence]}
            {user.statusMessage && <span className="faint"> · {user.statusMessage}</span>}
          </span>
        </div>
        <div className="ppl-row__place">
          <span className="ppl-meta truncate">
            <MapPin aria-hidden="true" /> {user.location}
          </span>
          <LocalTime user={user} now={now} viewerOffset={viewerOffset} />
        </div>
        <div className="ppl-row__actions">
          <Actions {...props} compact />
        </div>
      </article>
    );
  }

  const extraSkills = user.skills.length - 3;
  return (
    <article className={cx('ppl-card card neo-spot', !user.active && 'is-inactive', isSelf && 'is-self')}>
      <div className="ppl-card__head">
        <Avatar user={user} size={56} presence className="ppl-card__avatar" />
        <div className="ppl-card__id">
          <h3 className="ppl-card__name">
            {open}
            {user.pronouns && <span className="ppl-pronouns">{user.pronouns}</span>}
          </h3>
          <div className="ppl-card__title truncate">{user.title}</div>
          <div className="ppl-card__badges">
            <span className="tag">
              <DeptIcon aria-hidden="true" /> {user.department}
            </span>
            {badges}
          </div>
        </div>
      </div>

      <div className="ppl-card__meta">
        <span className="ppl-meta">
          <MapPin aria-hidden="true" /> <span className="truncate">{user.location}</span>
        </span>
        <LocalTime user={user} now={now} viewerOffset={viewerOffset} />
      </div>

      <p className="ppl-card__status">
        <span className={`dot dot--${user.presence}`} aria-hidden="true" />
        <span className="ppl-card__status-text">
          <strong>{PRESENCE_LABEL[user.presence]}</strong>
          {user.statusMessage && <span className="muted"> · “{user.statusMessage}”</span>}
        </span>
      </p>

      {user.skills.length > 0 && (
        <ul className="ppl-skills" aria-label="Top skills">
          {user.skills.slice(0, 3).map((s) => (
            <li key={s} className="ppl-skill">
              {s}
            </li>
          ))}
          {extraSkills > 0 && <li className="ppl-skill ppl-skill--more">+{extraSkills}</li>}
        </ul>
      )}

      <div className="ppl-card__actions">
        <Actions {...props} compact={false} />
      </div>
    </article>
  );
}
