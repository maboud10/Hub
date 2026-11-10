/**
 * Access requests — review (approve with level + expiry, or decline with a note; DLP-checked),
 * my requests (status, cancel), and decision history.
 */
import { useMemo, useState, type CSSProperties } from 'react';
import { Link } from 'react-router';
import { Check, Clock3, KeyRound, ShieldAlert, X } from 'lucide-react';
import { Avatar } from '@/components/ui/primitives';
import { Chip, NeoEmpty, NeoHead, NeoStage, NeoTabs } from '@/components/neo';
import { cx } from '@/lib/cx';
import { formatDateTime, relativeTime } from '@/lib/format';
import { toast } from '@/store/toast';
import type { AccessRequest, Level } from '@/drive/types';
import { useDrive } from '@/drive/store';
import { DAY, LEVEL_LABEL, RANK, expiryLabel } from '@/drive/meta';
import { checkGrant, locationOf } from '@/drive/access';
import { useDriveUI } from './ctx';
import { ExpirySelect, KindTile, LabelChip, LevelSelect } from './bits';

function ReviewCard({ r, i }: { r: AccessRequest; i: number }) {
  const ui = useDriveUI();
  const { ctx, me } = ui.engine;
  const item = ctx.item.get(r.itemId);
  const requester = ctx.user.get(r.requesterId);
  const maxDays = item ? ctx.policy.rules[item.label].maxShareDays : null;
  const [level, setLevel] = useState<Level>(r.level);
  const [expiresAt, setExpiresAt] = useState<number | null>(maxDays ? Date.now() + maxDays * DAY : null);
  const [denying, setDenying] = useState(false);
  const [note, setNote] = useState('');
  if (!item || !requester) return null;
  const myLevel = ui.engine.access(item).level;
  const levels = (['viewer', 'commenter', 'editor', 'manager'] as Level[]).filter((l) => RANK[l] <= RANK[myLevel === 'owner' ? 'manager' : myLevel]);
  const chk = checkGrant(ctx, item, { type: 'user', id: r.requesterId }, expiresAt);
  const approve = () => toast.result(useDrive.getState().decideRequest(r.id, 'approve', { level, expiresAt }));
  const deny = () => toast.result(useDrive.getState().decideRequest(r.id, 'deny', { note }));
  const viaAdmin = ui.engine.access(item).primary?.source === 'admin';
  return (
    <article className="dv-reqcard neo-card" style={{ '--i': i } as CSSProperties} data-qa="request-card">
      <div className="dv-reqcard__who">
        <Avatar user={requester} size={40} presence />
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="text-sm">
            <strong>{requester.name}</strong> wants <strong className="neo-tint">{LEVEL_LABEL[r.level].toLowerCase()}</strong> access
          </div>
          <div className="neo-faint text-xs truncate">
            {requester.title} · {requester.department}
            {requester.roleIds.includes('contractor') ? ' · contractor' : ''} · {relativeTime(r.at)}
          </div>
        </div>
        {viaAdmin && (
          <Chip size="sm" tone="orange">
            Via governance
          </Chip>
        )}
      </div>
      <Link to={`/drive/file/${item.id}`} className="dv-reqcard__file">
        <KindTile item={item} size={34} />
        <span className="grow" style={{ minWidth: 0 }}>
          <span className="truncate dv-sugg__name">{item.name}</span>
          <span className="truncate neo-faint text-xs">{locationOf(ctx, item, me.id)}</span>
        </span>
        <LabelChip label={item.label} />
      </Link>
      <blockquote className="dv-reqcard__reason">“{r.reason}”</blockquote>
      {!chk.ok && (
        <div className="dv-dlp" role="alert">
          <ShieldAlert />
          <span className="grow">
            <strong>{chk.reason}</strong> {chk.fix}
          </span>
          {chk.clampDays && (
            <button type="button" className="neo-btn neo-btn--xs" onClick={() => setExpiresAt(Date.now() + (chk.clampDays as number) * DAY)}>
              Set {chk.clampDays} days
            </button>
          )}
        </div>
      )}
      {denying ? (
        <div className="dv-reqcard__deny">
          <input className="neo-input neo-input--sm" autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note for the requester" aria-label="Decline note" onKeyDown={(e) => e.key === 'Enter' && deny()} />
          <button type="button" className="neo-btn neo-btn--ghost neo-btn--sm" onClick={() => setDenying(false)}>
            Back
          </button>
          <button type="button" className="neo-btn neo-btn--danger neo-btn--sm" onClick={deny} data-qa="deny-confirm">
            <X /> Decline
          </button>
        </div>
      ) : (
        <div className="dv-reqcard__actions">
          <LevelSelect value={level} levels={levels} onChange={setLevel} label="Grant level" />
          <ExpirySelect value={expiresAt} onChange={setExpiresAt} maxDays={maxDays} label="Grant expiry" />
          <span className="grow" />
          <button type="button" className="neo-btn neo-btn--ghost neo-btn--sm" onClick={() => setDenying(true)}>
            Decline
          </button>
          <button type="button" className="neo-btn neo-btn--success neo-btn--sm" disabled={!chk.ok} onClick={approve} data-qa="approve-request">
            <Check /> Approve
          </button>
        </div>
      )}
    </article>
  );
}

const STATUS_TONE = { pending: 'amber', approved: 'success', denied: 'danger', cancelled: 'slate' } as const;

function RequestRow({ r, perspective }: { r: AccessRequest; perspective: 'mine' | 'decided' }) {
  const ui = useDriveUI();
  const { ctx, me } = ui.engine;
  const item = ctx.item.get(r.itemId);
  const other = ctx.user.get(perspective === 'mine' ? (r.decidedBy ?? item?.ownerId ?? '') : r.requesterId);
  return (
    <li className="dv-reqrow">
      {item ? <KindTile item={item} size={34} /> : <span className="dv-kindtile" />}
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="truncate text-sm">
          {perspective === 'decided' && other ? (
            <>
              <strong>{other.name}</strong> · {item?.name ?? 'Deleted file'}
            </>
          ) : item && ui.engine.access(item).level !== 'none' ? (
            <Link to={`/drive/file/${item.id}`} className="dv-link">
              {item.name}
            </Link>
          ) : (
            <span>{item ? (RANK[ui.engine.access(item).level] > 0 ? item.name : `A ${item.label} file`) : 'Deleted file'}</span>
          )}
        </div>
        <div className="neo-faint text-xs truncate">
          {LEVEL_LABEL[r.grantedLevel ?? r.level]} · asked {relativeTime(r.at)}
          {r.decidedAt ? ` · decided ${relativeTime(r.decidedAt)}${r.decidedBy && r.decidedBy !== me.id && perspective === 'mine' ? ` by ${ctx.user.get(r.decidedBy)?.name.split(' ')[0]}` : ''}` : ''}
          {r.status === 'approved' && r.expiresAt ? ` · ${expiryLabel(r.expiresAt).toLowerCase()}` : ''}
          {r.note ? ` · “${r.note}”` : ''}
        </div>
      </div>
      <Chip size="sm" tone={STATUS_TONE[r.status]}>
        {r.status[0].toUpperCase() + r.status.slice(1)}
      </Chip>
      {perspective === 'mine' && r.status === 'pending' && (
        <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={() => toast.result(useDrive.getState().cancelRequest(r.id))} title={formatDateTime(r.at)}>
          Cancel
        </button>
      )}
    </li>
  );
}

export function RequestsView() {
  const ui = useDriveUI();
  const { ctx, me } = ui.engine;
  const requests = useDrive((s) => s.requests);
  const toReview = useMemo(
    () =>
      requests
        .filter((r) => {
          if (r.status !== 'pending' || r.requesterId === me.id) return false;
          const it = ctx.item.get(r.itemId);
          return !!it && RANK[ui.engine.access(it).level] >= RANK.manager;
        })
        .sort((a, b) => b.at - a.at),
    [requests, ctx, me.id, ui.engine],
  );
  const mine = useMemo(() => requests.filter((r) => r.requesterId === me.id).sort((a, b) => b.at - a.at), [requests, me.id]);
  const decided = useMemo(() => requests.filter((r) => r.decidedBy === me.id && r.requesterId !== me.id).sort((a, b) => (b.decidedAt ?? 0) - (a.decidedAt ?? 0)), [requests, me.id]);
  const [tab, setTab] = useState<'review' | 'mine' | 'history'>(toReview.length || !mine.length ? 'review' : 'mine');
  return (
    <NeoStage label="Access requests">
      <NeoHead icon={<KeyRound />} eyebrow="Helix Drive" title="Access requests" sub="Approve with a level and an expiry — or decline with a note." onToggleSide={ui.toggleSide} />
      <div className="neo-toolbar">
        <NeoTabs
          label="Requests"
          value={tab}
          onChange={setTab}
          items={[
            { value: 'review', label: 'To review', count: toReview.length },
            { value: 'mine', label: 'My requests', count: mine.filter((r) => r.status === 'pending').length || null },
            { value: 'history', label: 'Decided by me' },
          ]}
        />
      </div>
      <div className="neo-body neo-pad">
        {tab === 'review' &&
          (toReview.length ? (
            <div className="dv-reqgrid neo-stagger">
              {toReview.map((r, i) => (
                <ReviewCard key={r.id} r={r} i={i} />
              ))}
            </div>
          ) : (
            <NeoEmpty icon={<Check />} title="You’re all caught up">
              When someone asks for access to a file you manage, it lands here — and in your notifications.
            </NeoEmpty>
          ))}
        {tab === 'mine' &&
          (mine.length ? (
            <ul className="dv-reqlist neo-card">
              {mine.map((r) => (
                <RequestRow key={r.id} r={r} perspective="mine" />
              ))}
            </ul>
          ) : (
            <NeoEmpty icon={<Clock3 />} title="No requests yet">
              Open a link you can’t access and you’ll be able to ask the owner in one click.
            </NeoEmpty>
          ))}
        {tab === 'history' &&
          (decided.length ? (
            <ul className={cx('dv-reqlist neo-card')}>
              {decided.map((r) => (
                <RequestRow key={r.id} r={r} perspective="decided" />
              ))}
            </ul>
          ) : (
            <NeoEmpty icon={<Clock3 />} title="No decisions yet">
              Requests you approve or decline are kept here for reference.
            </NeoEmpty>
          ))}
      </div>
    </NeoStage>
  );
}
