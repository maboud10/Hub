/**
 * Share dialog for files and folders: people & group principals gated live by
 * DLP, role + expiry + note, current shares (explicit and inherited), link
 * settings limited by the sensitivity label, and — for managers — the label
 * itself plus retention.
 */
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Link } from 'react-router';
import { Check, Gavel, Link2, Lock, Shield, UserPlus, Users, X } from 'lucide-react';
import type { User } from '@/types';
import { useHub } from '@/store/hub';
import { toast } from '@/store/toast';
import { Modal } from '@/components/ui/Modal';
import { cx } from '@/lib/cx';
import { clearanceOf } from '@/lib/rbac';
import * as access from '@/drive/access';
import { LINK_ACCESS_META, RETENTION_META, ROLE_META, SENSITIVITY_META } from '@/drive/constants';
import { useDrive } from '@/drive/store';
import { useDriveCaps, useDriveContext, useItem } from '@/drive/selectors';
import type { DriveRole, LinkAccess, Principal, RetentionPolicy, Sensitivity } from '@/drive/types';
import { PeoplePicker, PrincipalPicker } from './pickers';
import { ExpiryBadge, KindTile, PRINCIPAL_TYPE_LABEL, PrincipalAvatar, RolePill, SensitivityPill, UserChip, collectEffectiveShares, copyItemLink, usePrincipalLabel } from './shared';

type Expiry = 'none' | '7' | '30' | '90' | 'custom';
const SENSITIVITIES = Object.keys(SENSITIVITY_META) as Sensitivity[];
const LINKS = Object.keys(LINK_ACCESS_META) as LinkAccess[];
const RETENTIONS = Object.keys(RETENTION_META) as RetentionPolicy[];

export function ShareDialog({ itemId, open, onClose }: { itemId: string | null; open: boolean; onClose: () => void }) {
  const data = useItem(itemId ?? undefined);
  const caps = useDriveCaps();
  const ctx = useDriveContext();
  const users = useHub((s) => s.users);
  const roles = useHub((s) => s.roles);
  const label = usePrincipalLabel();
  const shareItem = useDrive((s) => s.shareItem);
  const removeShare = useDrive((s) => s.removeShare);
  const setLinkAccess = useDrive((s) => s.setLinkAccess);
  const setSensitivity = useDrive((s) => s.setSensitivity);
  const setRetention = useDrive((s) => s.setRetention);

  const [mode, setMode] = useState<'people' | 'group'>('people');
  const [picked, setPicked] = useState<string[]>([]);
  const [group, setGroup] = useState<Principal | null>({ type: 'department', id: 'Engineering' });
  const [role, setRole] = useState<DriveRole>('viewer');
  const [expiry, setExpiry] = useState<Expiry>('none');
  const [customDays, setCustomDays] = useState(14);
  const [note, setNote] = useState('');
  const [pendingLabel, setPendingLabel] = useState<Sensitivity | null>(null);

  useEffect(() => {
    if (!open) return;
    setMode('people');
    setPicked([]);
    setRole('viewer');
    setExpiry('none');
    setNote('');
    setPendingLabel(null);
  }, [open, itemId]);

  const item = data?.item;
  const effective = useMemo(() => (item ? collectEffectiveShares(item, ctx) : []), [item, ctx]);
  if (!data || !item) return null;
  const { canShare, canManage, allowedLinks, drive } = data;

  const gateFor = (p: Principal) => {
    const u = p.type === 'user' ? users.find((x) => x.id === p.id) : undefined;
    return access.checkShareAllowed(item, p, u, u ? clearanceOf(u, roles) : 0);
  };
  const peopleGate = (u: User, clearance: number) => access.checkShareAllowed(item, { type: 'user', id: u.id }, u, clearance);
  const groupGate = group ? gateFor(group) : { ok: false as const, reason: 'Pick a group.' };
  const expiresInDays = expiry === 'none' ? undefined : expiry === 'custom' ? Math.max(1, Math.round(customDays)) : Number(expiry);
  const roleOptions: DriveRole[] = canManage ? ['viewer', 'commenter', 'editor', 'manager'] : ['viewer', 'commenter', 'editor'];
  const explicit = effective.filter((e) => !e.inherited);
  const inherited = effective.filter((e) => e.inherited);
  const sens = SENSITIVITY_META[item.sensitivity];

  const submit = () => {
    const principals: Principal[] = mode === 'people' ? picked.map((id) => ({ type: 'user', id })) : group ? [group] : [];
    if (!principals.length) return;
    let ok = 0;
    for (const p of principals) {
      const r = shareItem(item.id, p, role, { expiresInDays, note });
      if (r.ok) ok += 1;
      else toast.error(r.error);
    }
    if (ok) {
      toast.success(ok === 1 ? `Shared with ${label(principals[0])} as ${ROLE_META[role].label.toLowerCase()}.` : `Shared with ${ok} people.`, expiresInDays ? `Access expires in ${expiresInDays} days.` : undefined);
      setPicked([]);
      setNote('');
    }
  };

  const labelImpact = (next: Sensitivity) => {
    const raising = SENSITIVITY_META[next].rank > sens.rank;
    const out: string[] = [];
    const nested: number = (() => {
      let n = 0;
      const stack = [item.id];
      const seen = new Set<string>();
      while (stack.length) {
        const cur = stack.pop()!;
        for (const child of ctx.items.values()) if (child.parentId === cur && !seen.has(child.id)) {
          seen.add(child.id);
          n += 1;
          stack.push(child.id);
        }
      }
      return n;
    })();
    if (next === 'confidential' || next === 'restricted') {
      const dropped = item.shares.filter((s) => s.principal.type === 'company' || (s.principal.type === 'role' && s.principal.id === 'contractor') || (next === 'restricted' && s.principal.type !== 'user')).length;
      if (dropped) out.push(`${dropped} broad share${dropped === 1 ? '' : 's'} removed (${next === 'restricted' ? 'only named people keep access' : 'everyone-at-Helix and contractor-role shares'})`);
      out.push(next === 'restricted' ? 'Only clearance L3+ named people can open it; viewers can’t download; no links' : 'Contractors lose inherited access; external links blocked; downloads watermarked');
    }
    if (!access.allowedLinkAccess(next).includes(item.linkAccess)) out.push(`Link sharing reset to “Restricted” (currently “${LINK_ACCESS_META[item.linkAccess].label}”)`);
    if (!raising) out.push('Lowering a label never re-adds removed shares');
    if (nested) out.push(`Applies to ${nested} nested item${nested === 1 ? '' : 's'}`);
    return out;
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={680}
      className="dr-share"
      icon={<KindTile kind={item.kind} size={40} />}
      title={`Share “${item.name}”`}
      subtitle={
        <span className="row row--wrap" style={{ gap: 8 }}>
          <SensitivityPill sensitivity={item.sensitivity} compact />
          <RolePill role={data.role} />
          {drive && (
            <span className="text-xs muted">
              in {drive.icon} {drive.name}
            </span>
          )}
        </span>
      }
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Done
          </button>
          <button type="button" className="btn" onClick={() => copyItemLink(item)}>
            <Link2 /> Copy link
          </button>
        </>
      }
    >
      <div className="dr-dlp" style={{ '--sens': sens.color } as CSSProperties}>
        <Shield />
        <div>
          <b>{sens.label}</b> — {sens.description}
          {!canShare && <span className="block muted"> You can view who has access but can’t change it{data.role === 'editor' ? ' — Confidential and Restricted files need a manager.' : '.'}</span>}
        </div>
      </div>

      {canShare && (
        <section className="dr-share__section">
          <h3>
            <UserPlus /> Add people & groups
          </h3>
          <div className="dr-seg" role="group" aria-label="Share with">
            <button type="button" aria-pressed={mode === 'people'} onClick={() => setMode('people')}>
              <UserPlus /> People
            </button>
            <button type="button" aria-pressed={mode === 'group'} onClick={() => setMode('group')}>
              <Users /> Department · Role · Permission · Everyone
            </button>
          </div>
          {mode === 'people' ? <PeoplePicker picked={picked} onChange={setPicked} gate={peopleGate} autoFocus /> : <PrincipalPicker value={group} onChange={setGroup} gate={gateFor} />}

          <div className="dr-share__opts">
            <label className="field">
              <span className="field-label">Role</span>
              <select className="select" value={role} onChange={(e) => setRole(e.target.value as DriveRole)}>
                {roleOptions.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_META[r].label} — {ROLE_META[r].description}
                  </option>
                ))}
              </select>
            </label>
            <div className="field">
              <span className="field-label">Expiry</span>
              <div className="row row--wrap" style={{ gap: 6 }}>
                <div className="dr-seg dr-seg--mini" role="group" aria-label="Expiry">
                  {(['none', '7', '30', '90', 'custom'] as Expiry[]).map((e) => (
                    <button key={e} type="button" aria-pressed={expiry === e} onClick={() => setExpiry(e)}>
                      {e === 'none' ? 'Never' : e === 'custom' ? 'Custom' : `${e}d`}
                    </button>
                  ))}
                </div>
                {expiry === 'custom' && <input type="number" min={1} max={365} className="input dr-input-days" value={customDays} onChange={(e) => setCustomDays(Number(e.target.value) || 1)} aria-label="Days until expiry" />}
              </div>
            </div>
          </div>
          <label className="field">
            <span className="field-label">Note (optional)</span>
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why they need access, e.g. “Token migration until mid-December”" />
          </label>
          <div className="row row--between row--wrap" style={{ gap: 8 }}>
            <span className="text-xs muted">
              {mode === 'people' ? (picked.length ? `${picked.length} selected` : 'Pick at least one person') : group ? `${PRINCIPAL_TYPE_LABEL[group.type]}: ${label(group)}` : ''}
              {expiresInDays ? ` · expires in ${expiresInDays}d` : ' · no expiry'}
            </span>
            <button type="button" className="btn dr-btn-amber" disabled={mode === 'people' ? picked.length === 0 : !groupGate.ok} onClick={submit} title={mode === 'group' && !groupGate.ok ? groupGate.reason : undefined}>
              <Check /> Share as {ROLE_META[role].label.toLowerCase()}
            </button>
          </div>
        </section>
      )}

      <section className="dr-share__section">
        <h3>
          <Users /> Who has access
          <span className="count">{explicit.length + inherited.length + (drive?.managerIds.length ?? 0)}</span>
        </h3>
        <div className="dr-share-rows">
          <div className="dr-share-row dr-share-row--owner">
            <UserChip userId={item.ownerId} size={28} />
            <span className="grow text-xs muted">Owner</span>
            <RolePill role="manager" />
          </div>
          {drive?.managerIds
            .filter((id) => id !== item.ownerId)
            .map((id) => (
              <div key={id} className="dr-share-row">
                <UserChip userId={id} size={28} />
                <span className="grow text-xs muted">{drive.kind === 'personal' ? 'Drive owner' : 'Drive manager'}</span>
                <RolePill role="manager" />
              </div>
            ))}
          {explicit.map(({ share }) => (
            <div key={share.id} className="dr-share-row">
              <PrincipalAvatar principal={share.principal} size={28} />
              <span className="grow" style={{ minWidth: 0 }}>
                <span className="truncate block">{label(share.principal)}</span>
                <span className="text-xs muted truncate block">
                  {PRINCIPAL_TYPE_LABEL[share.principal.type]}
                  {share.note ? ` · ${share.note}` : ''}
                </span>
              </span>
              <ExpiryBadge expiresAt={share.expiresAt} />
              <RolePill role={share.role} />
              {canShare && (
                <button
                  type="button"
                  className="icon-btn icon-btn--sm"
                  aria-label={`Remove access for ${label(share.principal)}`}
                  onClick={() => toast.result(removeShare(item.id, share.id))}
                >
                  <X />
                </button>
              )}
            </div>
          ))}
          {inherited.map(({ share, from, fromHref }) => (
            <div key={`${share.id}-${from}`} className="dr-share-row is-inherited">
              <PrincipalAvatar principal={share.principal} size={28} />
              <span className="grow" style={{ minWidth: 0 }}>
                <span className="truncate block">{label(share.principal)}</span>
                <span className="text-xs muted truncate block">
                  Inherited from {fromHref ? <Link to={fromHref} onClick={onClose}>{from}</Link> : from}
                </span>
              </span>
              <ExpiryBadge expiresAt={share.expiresAt} />
              <RolePill role={share.role} />
            </div>
          ))}
          {explicit.length + inherited.length === 0 && <div className="text-sm muted">Only the owner{drive?.managerIds.length ? ' and drive managers' : ''} can open this.</div>}
        </div>
      </section>

      <section className="dr-share__section">
        <h3>
          <Link2 /> Link settings
        </h3>
        <div className="dr-link-opts">
          {LINKS.map((l) => {
            const allowed = allowedLinks.includes(l);
            const active = item.linkAccess === l;
            return (
              <button
                key={l}
                type="button"
                className={cx('dr-link-opt', active && 'is-active', !allowed && 'is-blocked')}
                disabled={!canShare || !allowed}
                aria-pressed={active}
                title={!allowed ? `${sens.label} files can’t use “${LINK_ACCESS_META[l].label}” links.` : undefined}
                onClick={() => toast.result(setLinkAccess(item.id, l))}
              >
                <span className="dr-link-opt__title">
                  {l === 'restricted' ? <Lock /> : l === 'company' ? <Users /> : <Link2 />}
                  {LINK_ACCESS_META[l].label}
                </span>
                <span className="dr-link-opt__desc">{allowed ? LINK_ACCESS_META[l].description : `Not allowed for ${sens.label} files.`}</span>
              </button>
            );
          })}
        </div>
        {item.linkAccess !== 'restricted' && (
          <div className="row row--wrap" style={{ gap: 10, marginTop: 10 }}>
            <span className="text-sm muted">People with the link can</span>
            <select className="select select--sm" style={{ width: 'auto' }} value={item.linkRole} disabled={!canShare} onChange={(e) => toast.result(setLinkAccess(item.id, item.linkAccess, e.target.value as 'viewer' | 'commenter' | 'editor'))} aria-label="Link role">
              <option value="viewer">view</option>
              <option value="commenter">comment</option>
              <option value="editor">edit</option>
            </select>
          </div>
        )}
      </section>

      {canManage && (
        <section className="dr-share__section">
          <h3>
            <Shield /> Sensitivity label
          </h3>
          <div className="dr-sens-opts">
            {SENSITIVITIES.map((s) => {
              const m = SENSITIVITY_META[s];
              const active = item.sensitivity === s;
              return (
                <button key={s} type="button" className={cx('dr-sens-opt', (pendingLabel ? pendingLabel === s : active) && 'is-active')} style={{ '--sens': m.color } as CSSProperties} aria-pressed={active} onClick={() => setPendingLabel(active ? null : s)}>
                  <span className="dr-sens-opt__title">
                    <i />
                    {m.label}
                    {active && <span className="tag">current</span>}
                  </span>
                  <span className="dr-sens-opt__desc">{m.description}</span>
                </button>
              );
            })}
          </div>
          {pendingLabel && pendingLabel !== item.sensitivity && (
            <div className="dr-impact">
              <div className="dr-impact__title">
                Changing to <SensitivityPill sensitivity={pendingLabel} compact /> will:
              </div>
              <ul>
                {labelImpact(pendingLabel).map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
              <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn--sm btn--ghost" onClick={() => setPendingLabel(null)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn--sm dr-btn-amber"
                  onClick={() => {
                    if (toast.result(setSensitivity(item.id, pendingLabel))) setPendingLabel(null);
                  }}
                >
                  Apply label
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {canManage && (
        <section className="dr-share__section">
          <h3>
            <Gavel /> Retention
          </h3>
          <div className="row row--wrap" style={{ gap: 10 }}>
            <select
              className="select"
              style={{ maxWidth: 320 }}
              value={item.retention}
              disabled={item.retention === 'legal_hold' && !caps.canGovern}
              onChange={(e) => toast.result(setRetention(item.id, e.target.value as RetentionPolicy))}
              aria-label="Retention policy"
            >
              {RETENTIONS.map((r) => (
                <option key={r} value={r} disabled={r === 'legal_hold' && !caps.canGovern}>
                  {RETENTION_META[r].label} — {RETENTION_META[r].description}
                  {r === 'legal_hold' && !caps.canGovern ? ' (Drive governance only)' : ''}
                </option>
              ))}
            </select>
            <span className="text-xs muted">{item.retention === 'legal_hold' && !caps.canGovern ? 'Legal holds are managed by Drive governance.' : 'Retention blocks permanent deletion (and moves under legal hold).'}</span>
          </div>
        </section>
      )}
    </Modal>
  );
}

export const ShareModal = ShareDialog;

