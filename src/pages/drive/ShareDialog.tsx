/**
 * Share dialog — unified picker (people, roles, departments, everyone), per-principal level +
 * expiry with live DLP checks, notify + optional Pulse DM, inherited access with "restrict
 * inheritance", link settings with DLP guard, and the Access X-Ray radial diagram.
 */
import { useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { Ban, Building2, Check, Clock3, Copy, Globe, Link2, Lock, Radar, Scissors, Send, Share2, Shield, ShieldAlert, Sparkles, UserPlus, Users, X } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Avatar } from '@/components/ui/primitives';
import { Chip, NeoTabs, NovaChip, Typing, useTypewriter } from '@/components/neo';
import { cx } from '@/lib/cx';
import { relativeTime } from '@/lib/format';
import { toast } from '@/store/toast';
import { currentViewer, loadBridge } from '@/lib/appBridge';
import type { Department } from '@/types';
import type { Item, Level, LinkLevel, LinkScope, Principal } from '@/drive/types';
import { itemRoute, useDrive, type ShareInput } from '@/drive/store';
import { DAY, KIND_SHORT, LABEL_NAME, LEVEL_LABEL, LINK_NAME, RANK, expiryLabel } from '@/drive/meta';
import { audience, checkGrant, checkLink, levelOptionsFor, principalKey, principalMembers, principalName, xray, type XNode } from '@/drive/access';
import { draftShareMessage, explainAccess, suggestPeople } from '@/drive/nova';
import { useDriveUI } from './ctx';
import { ExpirySelect, KindIcon, KindTile, LabelChip, LevelSelect, PrincipalGlyph } from './bits';

const LV_COLOR: Record<string, string> = { owner: '#fbbf24', manager: '#f97316', editor: '#a3e635', commenter: '#2dd4bf', viewer: '#60a5fa', none: '#94a3b8' };

/* ---------------- principal picker ---------------- */

interface Option {
  key: string;
  p: Principal;
  title: string;
  sub: string;
  group: 'People' | 'Roles' | 'Departments' | 'Everyone';
}

export function PrincipalPicker({ onPick, exclude }: { onPick: (p: Principal) => void; exclude: Set<string> }) {
  const ui = useDriveUI();
  const { ctx } = ui.engine;
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const options = useMemo<Option[]>(() => {
    const s = q.trim().toLowerCase();
    const out: Option[] = [];
    for (const u of ctx.users) {
      if (!u.active) continue;
      if (s && !`${u.name} ${u.title} ${u.department} ${u.email}`.toLowerCase().includes(s)) continue;
      out.push({ key: `user:${u.id}`, p: { type: 'user', id: u.id }, title: u.name, sub: `${u.title}${u.roleIds.includes('contractor') ? ' · contractor' : ''}`, group: 'People' });
    }
    for (const r of ctx.roles) {
      if (s && !`${r.name} role`.toLowerCase().includes(s)) continue;
      out.push({ key: `role:${r.id}`, p: { type: 'role', id: r.id }, title: `${r.name} role`, sub: `${principalMembers(ctx, { type: 'role', id: r.id }).length} people`, group: 'Roles' });
    }
    const depts = [...new Set(ctx.users.filter((u) => u.active).map((u) => u.department))].sort() as Department[];
    for (const d of depts) {
      if (s && !`${d} department`.toLowerCase().includes(s)) continue;
      out.push({ key: `dept:${d}`, p: { type: 'dept', id: d }, title: `${d} department`, sub: `${principalMembers(ctx, { type: 'dept', id: d }).length} people`, group: 'Departments' });
    }
    if (!s || 'everyone at helix org organization company all'.includes(s)) out.push({ key: 'org', p: { type: 'org' }, title: 'Everyone at Helix', sub: `${ctx.viewers.length} people`, group: 'Everyone' });
    return out.filter((o) => !exclude.has(o.key)).slice(0, s ? 30 : 14);
  }, [q, ctx, exclude]);
  const pick = (o: Option) => {
    onPick(o.p);
    setQ('');
    setHi(0);
  };
  const onKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setHi((h) => Math.min(options.length - 1, h + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHi((h) => Math.max(0, h - 1));
    } else if (e.key === 'Enter' && open && options[hi]) {
      e.preventDefault();
      pick(options[hi]);
    } else if (e.key === 'Escape' && open) {
      e.stopPropagation();
      setOpen(false);
    }
  };
  let lastGroup = '';
  return (
    <div className="dv-picker">
      <div className="dv-picker__field">
        <UserPlus />
        <input
          className="neo-input"
          value={q}
          placeholder="Add people, roles, departments or everyone…"
          aria-label="Add people or groups"
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
            setHi(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKey}
          data-qa="share-picker"
        />
      </div>
      {open && options.length > 0 && (
        <div className="dv-picker__menu" role="listbox" aria-label="People and groups">
          {options.map((o, i) => {
            const head = o.group !== lastGroup ? o.group : null;
            lastGroup = o.group;
            const user = o.p.type === 'user' ? ctx.user.get(o.p.id) : undefined;
            const role = o.p.type === 'role' ? ctx.roles.find((r) => r.id === (o.p as { id: string }).id) : undefined;
            return (
              <div key={o.key}>
                {head && <div className="neo-menu__label">{head}</div>}
                <button type="button" role="option" aria-selected={i === hi} className={cx('neo-menu__item', i === hi && 'is-focus')} onMouseDown={(e) => (e.preventDefault(), pick(o))} onMouseEnter={() => setHi(i)}>
                  <PrincipalGlyph p={o.p} user={user} roleColor={role?.color} size={26} />
                  <span className="grow" style={{ minWidth: 0 }}>
                    <span className="truncate" style={{ display: 'block', color: 'var(--text)', fontWeight: 600 }}>
                      {o.title}
                    </span>
                    <span className="truncate" style={{ display: 'block', fontSize: 11.5, color: 'var(--text-3)' }}>
                      {o.sub}
                    </span>
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------------- Access X-Ray ---------------- */

function XRayDiagram({ item, nodes, selected, onSelect }: { item: Item; nodes: XNode[]; selected: string | null; onSelect: (k: string | null) => void }) {
  const ui = useDriveUI();
  const { ctx } = ui.engine;
  const rings = {
    inner: nodes.filter((n) => n.ring === 'owner' || n.ring === 'direct'),
    mid: nodes.filter((n) => n.ring === 'inherited'),
    outer: nodes.filter((n) => n.ring === 'link'),
  };
  const R = { inner: 23, mid: 36, outer: 46.5 };
  const place = (list: XNode[], r: number, offset: number) =>
    list.map((n, i) => {
      const a = offset + (i * Math.PI * 2) / Math.max(1, list.length);
      return { n, x: 50 + r * Math.cos(a), y: 50 + r * Math.sin(a) };
    });
  const placed = [...place(rings.inner, R.inner, -Math.PI / 2), ...place(rings.mid, R.mid, -Math.PI / 2 + Math.PI / Math.max(2, rings.mid.length)), ...place(rings.outer, R.outer, Math.PI / 4)];
  return (
    <div className="dv-xray" role="group" aria-label="Access X-Ray diagram">
      <div className="dv-xray__sweep" aria-hidden="true" />
      <svg className="dv-xray__svg" viewBox="0 0 100 100" aria-hidden="true">
        <defs>
          <radialGradient id="xr-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--app-c1)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--app-c1)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="50" cy="50" r="18" fill="url(#xr-core)" />
        {(['inner', 'mid', 'outer'] as const).map((k) => (
          <circle key={k} cx="50" cy="50" r={R[k]} className={cx('dv-xray__ring', `is-${k}`)} />
        ))}
        {placed.map(({ n, x, y }) => (
          <line key={n.key} x1="50" y1="50" x2={x} y2={y} className={cx('dv-xray__line', `is-${n.status}`, selected === n.key && 'is-sel')} style={{ '--lv': LV_COLOR[n.level] } as CSSProperties} />
        ))}
      </svg>
      {(['inner', 'mid', 'outer'] as const).map((k) => (
        <span key={k} className="dv-xray__ringlabel neo-hud" style={{ top: `${50 - R[k] - 3.2}%` }}>
          {k === 'inner' ? 'Direct' : k === 'mid' ? 'Inherited' : 'Link'}
        </span>
      ))}
      <div className="dv-xray__core" data-label={item.label}>
        <KindIcon kind={item.kind} />
        <span className="neo-mono">{KIND_SHORT[item.kind]}</span>
      </div>
      {placed.map(({ n, x, y }, i) => {
        const user = n.principal?.type === 'user' ? ctx.user.get(n.principal.id) : undefined;
        const role = n.principal?.type === 'role' ? ctx.roles.find((r) => r.id === (n.principal as { id: string }).id) : undefined;
        const glyph = n.key === 'admin' ? ({ type: 'gov' } as const) : n.scope ? ({ type: 'link', scope: n.scope === 'anyone' ? 'anyone' : 'org' } as const) : (n.principal ?? ({ type: 'org' } as const));
        return (
          <button
            key={n.key}
            type="button"
            className={cx('dv-xnode', `is-${n.status}`, selected === n.key && 'is-sel', n.ring === 'owner' && 'is-owner')}
            style={{ left: `${x}%`, top: `${y}%`, '--lv': LV_COLOR[n.level], '--i': i } as CSSProperties}
            data-tip={n.text}
            aria-label={n.text}
            onClick={() => onSelect(selected === n.key ? null : n.key)}
          >
            <PrincipalGlyph p={glyph} user={user} roleColor={role?.color} size={30} />
            {n.status === 'blocked' && (
              <span className="dv-xnode__badge is-blocked">
                <Ban />
              </span>
            )}
            {n.status === 'expired' && (
              <span className="dv-xnode__badge is-expired">
                <Clock3 />
              </span>
            )}
            {n.status === 'cut' && (
              <span className="dv-xnode__badge is-cut">
                <Scissors />
              </span>
            )}
            {n.members > 1 && n.status === 'active' && <span className="dv-xnode__count">{n.members}</span>}
          </button>
        );
      })}
    </div>
  );
}

function XRayPane({ item }: { item: Item }) {
  const ui = useDriveUI();
  const { ctx } = ui.engine;
  const nodes = useMemo(() => xray(ctx, item), [ctx, item]);
  const aud = useMemo(() => audience(ctx, item), [ctx, item]);
  const [selected, setSelected] = useState<string | null>(null);
  const [explain, setExplain] = useState<'idle' | 'thinking' | 'done'>('idle');
  const text = explain === 'done' ? explainAccess(ctx, item) : '';
  const [shown, done] = useTypewriter(text, 160);
  const groups: { label: string; ring: XNode['ring'][] }[] = [
    { label: 'Owner & direct', ring: ['owner', 'direct'] },
    { label: 'Inherited', ring: ['inherited'] },
    { label: 'Link', ring: ['link'] },
  ];
  const blocked = nodes.filter((n) => n.status === 'blocked').length;
  return (
    <div className="dv-xraypane">
      <div className="dv-xraypane__viz">
        <XRayDiagram item={item} nodes={nodes} selected={selected} onSelect={setSelected} />
        <div className="dv-xray__legend">
          {(['owner', 'manager', 'editor', 'commenter', 'viewer'] as const).map((l) => (
            <span key={l}>
              <i style={{ background: LV_COLOR[l] }} /> {LEVEL_LABEL[l]}
            </span>
          ))}
          <span>
            <i className="is-blocked" /> Blocked
          </span>
          <span>
            <i className="is-expired" /> Expired
          </span>
        </div>
      </div>
      <div className="dv-xraypane__side">
        <div className="dv-xstats">
          <div>
            <span className="neo-num">{aud.people.length}</span>
            <span className="neo-faint text-xs">can open</span>
          </div>
          <div>
            <span className="neo-num">{aud.editors}</span>
            <span className="neo-faint text-xs">can edit</span>
          </div>
          <div>
            <span className={cx('neo-num', blocked && 'dv-danger')}>{blocked}</span>
            <span className="neo-faint text-xs">blocked</span>
          </div>
          <div>
            <span className="neo-num">{aud.link === 'restricted' ? 'Off' : aud.link === 'org' ? 'Org' : 'Public'}</span>
            <span className="neo-faint text-xs">link</span>
          </div>
        </div>
        {explain === 'idle' ? (
          <button type="button" className="neo-btn neo-btn--nova neo-btn--sm neo-btn--block" onClick={() => (setExplain('thinking'), window.setTimeout(() => setExplain('done'), 600))}>
            <Sparkles /> Explain this access
          </button>
        ) : (
          <div className="neo-nova dv-nova">
            <div className="neo-nova__glow" />
            <div className="row" style={{ gap: 8, marginBottom: 6 }}>
              <NovaChip>Nova</NovaChip>
              {explain === 'thinking' && <Typing label="Nova is analysing" />}
            </div>
            <p className="text-sm" style={{ margin: 0, lineHeight: 1.55 }}>
              {shown}
              {explain === 'done' && !done && <span className="dv-caret" />}
            </p>
          </div>
        )}
        <div className="dv-xlist">
          {groups.map((g) => {
            const rows = nodes.filter((n) => g.ring.includes(n.ring));
            if (!rows.length) return null;
            return (
              <section key={g.label}>
                <div className="neo-hud">{g.label}</div>
                {rows.map((n) => (
                  <button key={n.key} type="button" className={cx('dv-xrow', `is-${n.status}`, selected === n.key && 'is-sel')} onClick={() => setSelected(selected === n.key ? null : n.key)}>
                    <i className="dv-xrow__lv" style={{ background: LV_COLOR[n.level] }} />
                    <span className="grow" style={{ minWidth: 0 }}>
                      <span className="truncate dv-xrow__name">
                        {n.name}
                        {n.members > 1 ? <span className="neo-faint"> · {n.members}</span> : null}
                      </span>
                      <span className="truncate dv-xrow__sub">
                        {LEVEL_LABEL[n.level]} via {n.host}
                        {n.status !== 'active' ? ` · ${n.status === 'cut' ? 'cut' : n.status}${n.note ? `: ${n.note}` : ''}` : n.excluded ? ` · ${n.excluded} contractor${n.excluded > 1 ? 's' : ''} excluded` : ''}
                        {n.expiresAt && n.status === 'active' ? ` · ${expiryLabel(n.expiresAt).toLowerCase()}` : ''}
                      </span>
                    </span>
                  </button>
                ))}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ---------------- share pane ---------------- */

interface Staged {
  key: string;
  p: Principal;
  level: Level;
  expiresAt: number | null;
}

function LinkCard({ item, canEdit }: { item: Item; canEdit: boolean }) {
  const ui = useDriveUI();
  const { ctx } = ui.engine;
  const scopes: { v: LinkScope; label: string; icon: ReactNode }[] = [
    { v: 'restricted', label: 'Restricted', icon: <Lock /> },
    { v: 'org', label: 'Anyone at Helix', icon: <Building2 /> },
    { v: 'anyone', label: 'Anyone with link', icon: <Globe /> },
  ];
  const set = (scope: LinkScope, level: LinkLevel = item.link.level) => {
    const r = useDrive.getState().setLink(item.id, { scope, level });
    if (!r.ok) toast.error('Link not changed', r.error);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${itemRoute(item)}`);
      toast.success('Link copied');
    } catch {
      toast.info('Copy this link', `${window.location.origin}${itemRoute(item)}`);
    }
  };
  return (
    <div className="dv-linkcard">
      <div className={cx('dv-linkcard__icon', `is-${item.link.scope}`)}>{item.link.scope === 'anyone' ? <Globe /> : item.link.scope === 'org' ? <Building2 /> : <Lock />}</div>
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="neo-label">Link access</div>
        <div className="dv-seg" role="radiogroup" aria-label="Link access">
          {scopes.map((s) => {
            const chk = checkLink(ctx, item, s.v);
            return (
              <button
                key={s.v}
                type="button"
                role="radio"
                aria-checked={item.link.scope === s.v}
                className={cx('dv-seg__opt', item.link.scope === s.v && 'is-on')}
                disabled={!canEdit || !chk.ok}
                data-tip={!chk.ok ? `${chk.reason} ${chk.fix}` : undefined}
                onClick={() => set(s.v)}
              >
                {s.icon}
                <span>{s.label}</span>
                {!chk.ok && <ShieldAlert className="dv-seg__block" />}
              </button>
            );
          })}
        </div>
        <div className="neo-hint" style={{ marginTop: 6 }}>
          {item.link.scope === 'restricted' ? 'Only people and groups with access can open the link.' : `${LINK_NAME[item.link.scope]} can ${item.link.level === 'viewer' ? 'view' : item.link.level === 'commenter' ? 'comment' : 'edit'}${item.link.at ? ` · on since ${relativeTime(item.link.at)}` : ''}.`}
        </div>
      </div>
      {item.link.scope !== 'restricted' && (
        <select className="neo-select neo-select--sm dv-levelsel" value={item.link.level} disabled={!canEdit} onChange={(e) => set(item.link.scope, e.target.value as LinkLevel)} aria-label="Link level">
          <option value="viewer">Viewer</option>
          <option value="commenter">Commenter</option>
          <option value="editor">Editor</option>
        </select>
      )}
      <button type="button" className="neo-btn neo-btn--sm" onClick={() => void copy()} data-qa="copy-link">
        <Copy /> Copy link
      </button>
    </div>
  );
}

function AccessRows({ item, canEdit }: { item: Item; canEdit: boolean }) {
  const ui = useDriveUI();
  const { ctx, me } = ui.engine;
  const nodes = useMemo(() => xray(ctx, item), [ctx, item]);
  const myLevel = ui.engine.access(item).level;
  const levels = levelOptionsFor(myLevel === 'owner' ? 'manager' : myLevel);
  const maxDays = ctx.policy.rules[item.label].maxShareDays;
  const direct = nodes.filter((n) => n.ring === 'owner' || n.ring === 'direct');
  const inherited = nodes.filter((n) => n.ring === 'inherited');
  const row = (n: XNode, editable: boolean) => {
    const user = n.principal?.type === 'user' ? ctx.user.get(n.principal.id) : undefined;
    const role = n.principal?.type === 'role' ? ctx.roles.find((r) => r.id === (n.principal as { id: string }).id) : undefined;
    const glyph = n.key === 'admin' ? ({ type: 'gov' } as const) : (n.principal ?? ({ type: 'org' } as const));
    return (
      <div key={n.key} className={cx('dv-arow', `is-${n.status}`)}>
        <PrincipalGlyph p={glyph} user={user} roleColor={role?.color} size={30} />
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="truncate dv-arow__name">
            {user?.id === me.id ? `${n.name} (you)` : n.name}
            {n.members > 1 && <span className="neo-faint"> · {n.members} people</span>}
          </div>
          <div className="truncate dv-arow__sub">
            {n.ring === 'owner' ? 'Owner' : n.ring === 'direct' ? 'Shared directly' : `Inherited from ${n.host}`}
            {n.status === 'blocked' && <span className="dv-danger"> · blocked: {n.note}</span>}
            {n.status === 'cut' && <span> · cut by restricted inheritance</span>}
            {n.status === 'expired' && <span className="dv-danger"> · expired</span>}
            {n.status === 'active' && n.excluded > 0 && <span> · {n.excluded} contractor{n.excluded > 1 ? 's' : ''} excluded by DLP</span>}
          </div>
        </div>
        {n.ring === 'owner' ? (
          <Chip size="sm" tone="app">
            Owner
          </Chip>
        ) : editable && n.shareId && n.status !== 'cut' ? (
          <>
            {n.status !== 'expired' && <ExpirySelect value={n.expiresAt ?? null} maxDays={maxDays} onChange={(ts) => toast.result(useDrive.getState().updateShare(n.hostId, n.shareId as string, { expiresAt: ts }), 'Expiry updated')} />}
            <LevelSelect value={n.level as Level} levels={levels} onChange={(l) => toast.result(useDrive.getState().updateShare(n.hostId, n.shareId as string, { level: l }), 'Access updated')} label={`Access for ${n.name}`} />
            <button type="button" className="neo-iconbtn neo-iconbtn--sm" aria-label={`Remove ${n.name}`} data-tip="Remove" onClick={() => toast.result(useDrive.getState().removeShare(n.hostId, n.shareId as string))}>
              <X />
            </button>
          </>
        ) : (
          <span className="dv-arow__lvl">{LEVEL_LABEL[n.level]}</span>
        )}
      </div>
    );
  };
  const caps = ui.engine.caps(item);
  return (
    <div className="dv-arows">
      <div className="neo-hud">People & groups with access</div>
      {direct.map((n) => row(n, canEdit && n.ring === 'direct'))}
      {inherited.length > 0 && (
        <div className="dv-arows__inh">
          <div className="row" style={{ gap: 10 }}>
            <div className="neo-hud grow">Inherited</div>
            {caps.share && (
              <label className="dv-switch" data-tip={item.inherit ? 'Only direct shares and drive managers will keep access' : 'Restore access from the folder and drive'}>
                <input
                  type="checkbox"
                  checked={!item.inherit}
                  onChange={(e) => {
                    const r = useDrive.getState().setInherit(item.id, !e.target.checked);
                    if (!r.ok) toast.error('Can’t change inheritance', r.error);
                    else toast.success(r.message ?? 'Updated');
                  }}
                />
                <span className="dv-switch__track" />
                <span className="text-xs">Restrict inherited access</span>
              </label>
            )}
          </div>
          {inherited.map((n) => row(n, false))}
        </div>
      )}
    </div>
  );
}

function SharePane({ item, onDone }: { item: Item; onDone: () => void }) {
  const ui = useDriveUI();
  const { ctx, me, user } = ui.engine;
  const caps = ui.engine.caps(item);
  const myLevel = ui.engine.access(item).level;
  const levels = levelOptionsFor(myLevel === 'owner' ? 'manager' : myLevel);
  const maxDays = ctx.policy.rules[item.label].maxShareDays;
  const [staged, setStaged] = useState<Staged[]>([]);
  const [notify, setNotify] = useState(true);
  const [pulse, setPulse] = useState(false);
  const [message, setMessage] = useState('');
  const msgRef = useRef<HTMLTextAreaElement>(null);
  const existing = useMemo(() => new Set([`user:${item.ownerId}`, ...item.shares.map((s) => principalKey(s.principal)), ...staged.map((s) => s.key)]), [item, staged]);
  const suggestions = useMemo(() => suggestPeople(ctx, item, me.id).filter((s) => !existing.has(`user:${s.userId}`)), [ctx, item, me.id, existing]);
  const add = (p: Principal) => {
    const key = principalKey(p);
    if (existing.has(key)) return;
    setStaged((s) => [...s, { key, p, level: p.type === 'user' ? (RANK.editor <= RANK[myLevel === 'owner' ? 'manager' : myLevel] ? 'editor' : 'viewer') : 'viewer', expiresAt: maxDays ? Date.now() + maxDays * DAY : null }]);
  };
  const checks = staged.map((s) => checkGrant(ctx, item, s.p, s.expiresAt));
  const blocked = checks.some((c) => !c.ok);
  const submit = () => {
    const entries: ShareInput[] = staged.map((s) => ({ principal: s.p, level: s.level, expiresAt: s.expiresAt }));
    const r = useDrive.getState().share(item.id, entries, { notify, message });
    if (!r.ok) return toast.error('Not shared', r.error);
    toast.success(r.message ?? 'Shared');
    const users = staged.filter((s) => s.p.type === 'user').map((s) => (s.p as { id: string }).id);
    if (pulse && users.length) {
      const viewer = currentViewer();
      if (viewer)
        loadBridge('chat')
          .then((api) => {
            let sent = 0;
            for (const id of users) {
              const res = api.sendDirect(viewer, {
                toUserId: id,
                text: message.trim() || `Shared “${item.name}” with you.`,
                card: { app: 'drive', title: item.name, subtitle: `${KIND_SHORT[item.kind]} · ${LABEL_NAME[item.label]}`, to: itemRoute(item), status: 'Shared' },
              });
              if (res.ok) sent++;
            }
            if (sent) toast.success(`Sent in Pulse to ${sent} ${sent === 1 ? 'person' : 'people'}`);
            else toast.info('Pulse Chat is busy', 'Your share worked — the DM couldn’t be delivered right now.');
          })
          .catch(() => toast.info('Pulse Chat is unavailable', 'Your share worked — try the DM again in a moment.'));
    }
    setStaged([]);
    setMessage('');
  };
  const draft = () => {
    const names = staged.filter((s) => s.p.type === 'user').map((s) => principalName(ctx, s.p));
    setMessage(draftShareMessage(item, names, staged[0]?.level ?? 'viewer', user.name));
    requestAnimationFrame(() => msgRef.current?.focus());
  };

  if (!caps.share)
    return (
      <div className="dv-sharepane">
        <div className="dv-banner">
          <Shield />
          <span>
            Only managers can change sharing — you’re {RANK[myLevel] >= RANK.editor ? 'an' : 'a'} {LEVEL_LABEL[myLevel].toLowerCase()}. Use <strong>Access X-Ray</strong> to see exactly who can open it.
          </span>
        </div>
        <AccessRows item={item} canEdit={false} />
      </div>
    );

  return (
    <div className="dv-sharepane">
      <PrincipalPicker onPick={add} exclude={existing} />
      {staged.length === 0 && suggestions.length > 0 && (
        <div className="dv-suggest">
          <NovaChip>Suggested</NovaChip>
          {suggestions.map((s) => {
            const u = ctx.user.get(s.userId);
            if (!u) return null;
            return (
              <button key={s.userId} type="button" className="dv-suggest__chip" onClick={() => add({ type: 'user', id: s.userId })} data-tip={s.reason}>
                <Avatar user={u} size={20} />
                <span>{u.name.split(' ')[0]}</span>
                <span className="neo-faint text-xs dv-hide-sm">{s.reason}</span>
              </button>
            );
          })}
        </div>
      )}
      {staged.length > 0 && (
        <div className="dv-staged neo-rise">
          {staged.map((s, i) => {
            const user = s.p.type === 'user' ? ctx.user.get(s.p.id) : undefined;
            const role = s.p.type === 'role' ? ctx.roles.find((r) => r.id === (s.p as { id: string }).id) : undefined;
            const chk = checks[i];
            const members = principalMembers(ctx, s.p);
            const contractors = s.p.type !== 'user' && !ctx.policy.rules[item.label].contractors ? members.filter((m) => m.contractor).length : 0;
            return (
              <div key={s.key} className={cx('dv-stagedrow', !chk.ok && 'is-blocked')}>
                <div className="dv-stagedrow__main">
                  <PrincipalGlyph p={s.p} user={user} roleColor={role?.color} size={30} />
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="truncate dv-arow__name">{principalName(ctx, s.p)}</div>
                    <div className="truncate dv-arow__sub">{s.p.type === 'user' ? user?.title : `${members.length} people${contractors ? ` · ${contractors} contractor${contractors > 1 ? 's' : ''} excluded by DLP` : ''}`}</div>
                  </div>
                  <ExpirySelect value={s.expiresAt} maxDays={maxDays} onChange={(ts) => setStaged((all) => all.map((x) => (x.key === s.key ? { ...x, expiresAt: ts } : x)))} />
                  <LevelSelect value={s.level} levels={levels} onChange={(l) => setStaged((all) => all.map((x) => (x.key === s.key ? { ...x, level: l } : x)))} />
                  <button type="button" className="neo-iconbtn neo-iconbtn--sm" aria-label={`Remove ${principalName(ctx, s.p)}`} onClick={() => setStaged((all) => all.filter((x) => x.key !== s.key))}>
                    <X />
                  </button>
                </div>
                {!chk.ok && (
                  <div className="dv-dlp" role="alert">
                    <ShieldAlert />
                    <span className="grow">
                      <strong>{chk.reason}</strong> {chk.fix}
                    </span>
                    {chk.clampDays && (
                      <button type="button" className="neo-btn neo-btn--xs" onClick={() => setStaged((all) => all.map((x) => (x.key === s.key ? { ...x, expiresAt: Date.now() + (chk.clampDays as number) * DAY } : x)))}>
                        Set {chk.clampDays} days
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          <div className="dv-notify">
            <label className="row" style={{ gap: 8 }}>
              <input type="checkbox" className="neo-check" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
              <span className="text-sm">Notify people</span>
            </label>
            <label className="row" style={{ gap: 8 }}>
              <input type="checkbox" className="neo-check" checked={pulse} onChange={(e) => setPulse(e.target.checked)} />
              <span className="text-sm">Also send as a Pulse DM</span>
            </label>
            <span className="grow" />
            <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={draft}>
              <Sparkles /> Draft with Nova
            </button>
          </div>
          {(notify || pulse) && <textarea ref={msgRef} className="neo-textarea dv-msg" rows={2} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Add a message (optional)" aria-label="Message" />}
          <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" className="neo-btn neo-btn--ghost neo-btn--sm" onClick={() => setStaged([])}>
              Cancel
            </button>
            <button type="button" className="neo-btn neo-btn--plasma neo-btn--sm" disabled={blocked} onClick={submit} data-qa="share-submit">
              <Send /> Share{staged.length > 1 ? ` with ${staged.length}` : ''}
            </button>
          </div>
        </div>
      )}
      {staged.length === 0 && (
        <>
          <AccessRows item={item} canEdit />
          <LinkCard item={item} canEdit />
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="neo-btn neo-btn--sm" onClick={onDone}>
              <Check /> Done
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------- dialog ---------------- */

export function ShareDialog({ itemId, tab: initial, onClose }: { itemId: string; tab?: 'share' | 'xray'; onClose: () => void }) {
  const ui = useDriveUI();
  const item = ui.engine.ctx.item.get(itemId);
  const [tab, setTab] = useState<'share' | 'xray'>(initial ?? 'share');
  if (!item) return null;
  const caps = ui.engine.caps(item);
  return (
    <Modal
      open
      onClose={onClose}
      width={880}
      className="neo-portal dv-sharemodal"
      icon={<KindTile item={item} size={38} />}
      title={`${caps.share ? 'Share' : 'Access to'} “${item.name}”`}
      subtitle={
        <span className="row" style={{ gap: 8 }}>
          <LabelChip label={item.label} />
          <span className="truncate">{ctxLocation(ui, item)}</span>
        </span>
      }
    >
      <div className="dv-sharetabs">
        <NeoTabs
          label="Share dialog"
          value={tab}
          onChange={setTab}
          items={[
            { value: 'share', label: caps.share ? 'Share' : 'People', icon: caps.share ? <Share2 /> : <Users /> },
            { value: 'xray', label: 'Access X-Ray', icon: <Radar /> },
          ]}
        />
        {item.link.scope !== 'restricted' && (
          <Chip size="sm" tone={item.link.scope === 'anyone' ? 'rose' : 'cyan'} icon={<Link2 />}>
            {LINK_NAME[item.link.scope]}
          </Chip>
        )}
      </div>
      {tab === 'share' ? <SharePane item={item} onDone={onClose} /> : <XRayPane item={item} />}
    </Modal>
  );
}

function ctxLocation(ui: ReturnType<typeof useDriveUI>, item: Item) {
  const { ctx, me } = ui.engine;
  const d = ctx.drive.get(item.driveId);
  const parent = item.parentId ? ctx.item.get(item.parentId) : null;
  return `${d ? (d.kind === 'personal' ? (d.ownerId === me.id ? 'My Drive' : 'Personal drive') : d.name) : ''}${parent ? ` / ${parent.name}` : ''}`;
}

