/**
 * Governance console (drive.manage): Overview (storage, labels donut, exposure), Risk radar
 * (sweeping radar + one-click fixes), DLP rules matrix, Retention & legal holds, Shared drives,
 * and the Drive audit log (hub audit trail + security-relevant item activity).
 */
import { useMemo, useState, type CSSProperties } from 'react';
import { Link } from 'react-router';
import { Activity as ActivityIcon, Download, Gavel, Globe, Link2, Lock, Plus, Radar, ShieldAlert, ShieldCheck, Sparkles, Timer, Trash2, Users, Wand2 } from 'lucide-react';
import { Avatar } from '@/components/ui/primitives';
import { Bar, Chip, CountUp, NeoEmpty, NeoHead, NeoSearch, NeoStage, NeoTabs, Ring } from '@/components/neo';
import { useHub } from '@/store/hub';
import { cx } from '@/lib/cx';
import { downloadCsv } from '@/lib/csv';
import { formatDateTime, relativeTime } from '@/lib/format';
import { toast } from '@/store/toast';
import type { LabelRule, Sensitivity } from '@/drive/types';
import { useDrive } from '@/drive/store';
import { DAY, LABELS, LABEL_NAME, formatBytes, hashStr } from '@/drive/meta';
import { driveUsage, isTrashed, principalMembers } from '@/drive/access';
import { FINDING_NAME, findRisks, type Finding, type FindingKind } from '@/drive/risk';
import { useDriveUI } from './ctx';
import { DriveGlyph, KindTile, LabelChip } from './bits';

type Tab = 'overview' | 'radar' | 'dlp' | 'retention' | 'drives' | 'audit';

const LABEL_HEX: Record<Sensitivity, string> = { public: '#34d399', internal: '#60a5fa', confidential: '#a78bfa', restricted: '#fb7185' };
const KINDS: FindingKind[] = ['org-wide-confidential', 'restricted-long', 'restricted-stale', 'stale-public-link', 'contractor-confidential'];

function fix(f: Finding) {
  const r = useDrive.getState().fixFinding(f.fix);
  if (r.ok) toast.success('Fixed', `${f.title} — ${f.fixLabel.toLowerCase()}`);
  else toast.error('Not fixed', r.error);
}

/* ---------------- radar ---------------- */

function RiskRadar({ findings, selected, onSelect }: { findings: Finding[]; selected: string | null; onSelect: (id: string) => void }) {
  const sector = (360 / KINDS.length) * (Math.PI / 180);
  const blips = findings.map((f) => {
    const k = Math.max(0, KINDS.indexOf(f.kind));
    const h = hashStr(f.id);
    const a = -Math.PI / 2 + k * sector + sector * (0.18 + ((h % 1000) / 1000) * 0.64);
    const band = f.severity === 'high' ? [16, 34] : f.severity === 'medium' ? [40, 58] : [63, 80];
    const r = band[0] + ((h >> 10) % 100) / 100 * (band[1] - band[0]);
    return { f, x: 100 + r * Math.cos(a), y: 100 + r * Math.sin(a) };
  });
  return (
    <div className="dv-radar" role="img" aria-label={`Risk radar: ${findings.length} findings`}>
      <div className="dv-radar__sweep" aria-hidden="true" />
      <svg viewBox="0 0 200 200" className="dv-radar__svg">
        {[84, 61, 37].map((r) => (
          <circle key={r} cx="100" cy="100" r={r} className="dv-radar__ring" />
        ))}
        {KINDS.map((k, i) => {
          const a = -Math.PI / 2 + i * sector;
          return <line key={k} x1="100" y1="100" x2={100 + 86 * Math.cos(a)} y2={100 + 86 * Math.sin(a)} className="dv-radar__spoke" />;
        })}
        {KINDS.map((k, i) => {
          const a = -Math.PI / 2 + (i + 0.5) * sector;
          const x = 100 + 94 * Math.cos(a);
          const y = 100 + 94 * Math.sin(a);
          return (
            <text key={k} x={x} y={y} className="dv-radar__label" textAnchor={Math.cos(a) > 0.3 ? 'start' : Math.cos(a) < -0.3 ? 'end' : 'middle'} dominantBaseline="middle">
              {['Org-wide', 'Over limit', 'Expired', 'Old links', 'Contractors'][i]}
            </text>
          );
        })}
        <text x="100" y="64" className="dv-radar__band">HIGH</text>
        <text x="100" y="41" className="dv-radar__band">MEDIUM</text>
        <text x="100" y="18" className="dv-radar__band">LOW</text>
        <circle cx="100" cy="100" r="3" className="dv-radar__core" />
      </svg>
      {blips.map(({ f, x, y }, i) => (
        <button
          key={f.id}
          type="button"
          className={cx('dv-blip', `is-${f.severity}`, `is-${f.state}`, selected === f.id && 'is-sel')}
          style={{ left: `${x / 2}%`, top: `${y / 2}%`, '--i': i } as CSSProperties}
          onClick={() => onSelect(f.id)}
          aria-label={`${FINDING_NAME[f.kind]}: ${f.title}`}
          data-tip={`${f.title} — ${FINDING_NAME[f.kind]}`}
        />
      ))}
    </div>
  );
}

function FindingCard({ f, selected }: { f: Finding; selected: boolean }) {
  const ui = useDriveUI();
  const item = ui.engine.ctx.item.get(f.itemId);
  return (
    <article id={`finding-${f.id}`} className={cx('dv-finding', `is-${f.severity}`, selected && 'is-sel')}>
      <span className="dv-finding__sev" aria-hidden="true" />
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <Chip size="sm" tone={f.severity === 'high' ? 'danger' : f.severity === 'medium' ? 'warning' : 'slate'}>
            {f.severity}
          </Chip>
          <span className="neo-hud">{FINDING_NAME[f.kind]}</span>
          {f.state === 'dormant' && (
            <Chip size="sm" tone="slate" title="Already blocked by policy, but the grant is still on record">
              Dormant
            </Chip>
          )}
        </div>
        <div className="dv-finding__title">
          {item && <KindTile item={item} size={22} />}
          {item ? (
            <Link to={item.kind === 'folder' ? `/drive/d/${item.driveId}/${item.id}` : `/drive/file/${item.id}`} className="truncate">
              {f.title}
            </Link>
          ) : (
            <span className="truncate">{f.title}</span>
          )}
          {item && <LabelChip label={item.label} />}
        </div>
        <p className="dv-finding__detail">{f.detail}</p>
      </div>
      <button type="button" className="neo-btn neo-btn--success neo-btn--sm" onClick={() => fix(f)} data-qa="fix">
        <Wand2 /> {f.fixLabel}
      </button>
    </article>
  );
}

/* ---------------- donut ---------------- */

function Donut({ parts, size = 150 }: { parts: { label: string; value: number; color: string }[]; size?: number }) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  const r = 15.9155;
  let acc = 0;
  return (
    <div className="dv-donut" style={{ width: size, height: size }}>
      <svg viewBox="0 0 42 42" aria-hidden="true">
        <circle cx="21" cy="21" r={r} fill="none" stroke="var(--track)" strokeWidth="5" />
        {parts.map((p) => {
          const len = (p.value / total) * 100;
          const el = <circle key={p.label} cx="21" cy="21" r={r} fill="none" stroke={p.color} strokeWidth="5" strokeDasharray={`${Math.max(0, len - 0.8)} ${100 - Math.max(0, len - 0.8)}`} strokeDashoffset={25 - acc} className="dv-donut__seg" />;
          acc += len;
          return el;
        })}
      </svg>
      <div className="dv-donut__center">
        <span className="neo-num">
          <CountUp value={total} />
        </span>
        <span className="neo-faint text-xs">files</span>
      </div>
    </div>
  );
}

/* ---------------- tabs ---------------- */

function Overview({ findings, goRadar }: { findings: Finding[]; goRadar: () => void }) {
  const ui = useDriveUI();
  const { ctx } = ui.engine;
  const live = ctx.items.filter((i) => !isTrashed(ctx, i));
  const files = live.filter((i) => i.kind !== 'folder');
  const shared = ctx.drives.filter((d) => d.kind === 'shared');
  const used = ctx.items.reduce((s, i) => s + (i.kind === 'folder' ? 0 : i.size), 0);
  const quota = shared.reduce((s, d) => s + d.quota, 0) + ctx.drives.filter((d) => d.kind === 'personal').reduce((s, d) => s + d.quota, 0);
  const byLabel = LABELS.map((l) => ({ label: LABEL_NAME[l], value: files.filter((f) => f.label === l).length, color: LABEL_HEX[l] }));
  const anyone = live.filter((i) => i.link.scope === 'anyone').length;
  const org = live.filter((i) => i.link.scope === 'org').length;
  const expiring = live.reduce((n, i) => n + i.shares.filter((s) => s.expiresAt !== null && s.expiresAt > ctx.now && s.expiresAt < ctx.now + 14 * DAY).length, 0);
  const holds = ctx.items.filter((i) => i.hold).length + ctx.drives.filter((d) => d.hold).length;
  const pending = useDrive((s) => s.requests.filter((r) => r.status === 'pending').length);
  const tiles = [
    { label: 'Public links', value: anyone, icon: <Globe />, tone: 'rose' },
    { label: 'Org-wide links', value: org, icon: <Link2 />, tone: 'cyan' },
    { label: 'Restricted items', value: files.filter((f) => f.label === 'restricted').length, icon: <Lock />, tone: 'violet' },
    { label: 'Shares expiring ≤ 14d', value: expiring, icon: <Timer />, tone: 'amber' },
    { label: 'Pending requests', value: pending, icon: <Users />, tone: 'blue' },
    { label: 'Legal holds', value: holds, icon: <Gavel />, tone: 'orange' },
  ] as const;
  return (
    <div className="dv-gov-grid neo-stagger">
      <section className="neo-card dv-gov-card" style={{ '--i': 0 } as CSSProperties}>
        <div className="neo-section-head">
          <span className="neo-hud">Storage</span>
        </div>
        <div className="dv-storage">
          <Ring value={used / quota} size={104} stroke={10} label="Storage used">
            <span className="dv-storage__pct">{((used / quota) * 100).toFixed(1)}%</span>
          </Ring>
          <div className="grow">
            <div className="neo-num dv-storage__used">{formatBytes(used)}</div>
            <div className="neo-faint text-xs">of {formatBytes(quota)} provisioned</div>
            <div className="neo-faint text-xs">
              {files.length} files · {shared.length} shared drives
            </div>
          </div>
        </div>
        <div className="dv-drivebars">
          {shared
            .map((d) => ({ d, u: driveUsage(ctx, d.id) }))
            .sort((a, b) => b.u - a.u)
            .map(({ d, u }) => (
              <div key={d.id} className="dv-drivebars__row">
                <DriveGlyph drive={d} size={20} />
                <span className="truncate grow">{d.name}</span>
                <span className="neo-mono neo-faint text-xs">{formatBytes(u)}</span>
                <Bar value={u / Math.max(1, used)} fill={d.color} label={`${d.name} storage`} />
              </div>
            ))}
        </div>
      </section>
      <section className="neo-card dv-gov-card" style={{ '--i': 1 } as CSSProperties}>
        <div className="neo-section-head">
          <span className="neo-hud">Files by label</span>
        </div>
        <div className="dv-labelviz">
          <Donut parts={byLabel} />
          <ul className="dv-legend">
            {byLabel.map((p) => (
              <li key={p.label}>
                <i style={{ background: p.color }} />
                <span className="grow">{p.label}</span>
                <span className="neo-num">{p.value}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
      <section className="neo-card dv-gov-card dv-gov-card--wide" style={{ '--i': 2 } as CSSProperties}>
        <div className="neo-section-head">
          <span className="neo-hud">Exposure</span>
        </div>
        <div className="dv-expo">
          {tiles.map((t) => (
            <div key={t.label} className="dv-expo__tile" data-tone={t.tone}>
              {t.icon}
              <span className="neo-num">
                <CountUp value={t.value} />
              </span>
              <span className="neo-faint text-xs">{t.label}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="neo-card dv-gov-card dv-gov-card--wide" style={{ '--i': 3 } as CSSProperties}>
        <div className="neo-section-head">
          <span className="neo-hud">Top risks</span>
          <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={goRadar}>
            <Radar /> Open risk radar
          </button>
        </div>
        {findings.length ? (
          <div className="dv-findings">
            {findings.slice(0, 3).map((f) => (
              <FindingCard key={f.id} f={f} selected={false} />
            ))}
          </div>
        ) : (
          <NeoEmpty compact icon={<ShieldCheck />} title="No oversharing found">
            Every label and share is within policy.
          </NeoEmpty>
        )}
      </section>
    </div>
  );
}

const RULES: { key: keyof LabelRule; label: string; hint: string; strict?: boolean }[] = [
  { key: 'anyoneLink', label: 'Anyone-with-link sharing', hint: 'Public links that work outside Helix' },
  { key: 'orgLink', label: 'Organization links', hint: 'Links anyone at Helix can open' },
  { key: 'orgWide', label: 'Share with everyone at Helix', hint: 'The org-wide principal' },
  { key: 'contractors', label: 'Contractor access', hint: 'People holding the Contractor role' },
  { key: 'namedOnly', label: 'Named people only', hint: 'Blocks roles, departments, org and links', strict: true },
  { key: 'download', label: 'Download, copy & print', hint: 'For everyone except the owner' },
  { key: 'watermark', label: 'Watermark previews', hint: 'Viewer name + time over the preview', strict: true },
];

function DlpRules() {
  const ui = useDriveUI();
  const policy = ui.engine.ctx.policy;
  const set = (l: Sensitivity, patch: Partial<LabelRule>) => {
    const r = useDrive.getState().setRule(l, patch);
    if (!r.ok) toast.error(r.error);
    else toast.success(r.message ?? 'Updated', 'Takes effect immediately for every file with this label.');
  };
  return (
    <div className="neo-table-wrap dv-dlp-table">
      <table className="neo-table">
        <thead>
          <tr>
            <th>Rule</th>
            {LABELS.map((l) => (
              <th key={l} className="dv-dlp-col">
                <LabelChip label={l} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {RULES.map((r) => (
            <tr key={r.key}>
              <td>
                <div className="dv-rule">{r.label}</div>
                <div className="neo-faint text-xs">{r.hint}</div>
              </td>
              {LABELS.map((l) => {
                const on = policy.rules[l][r.key] as boolean;
                return (
                  <td key={l} className="dv-dlp-col">
                    <label className={cx('dv-switch', r.strict && 'is-strict')} aria-label={`${r.label} for ${LABEL_NAME[l]}`}>
                      <input type="checkbox" checked={on} onChange={(e) => set(l, { [r.key]: e.target.checked } as Partial<LabelRule>)} />
                      <span className="dv-switch__track" />
                    </label>
                  </td>
                );
              })}
            </tr>
          ))}
          <tr>
            <td>
              <div className="dv-rule">Maximum share length</div>
              <div className="neo-faint text-xs">New and updated shares must expire within this window</div>
            </td>
            {LABELS.map((l) => (
              <td key={l} className="dv-dlp-col">
                <select className="neo-select neo-select--sm" value={policy.rules[l].maxShareDays ?? 0} onChange={(e) => set(l, { maxShareDays: Number(e.target.value) || null })} aria-label={`Maximum share length for ${LABEL_NAME[l]}`}>
                  <option value={0}>No limit</option>
                  {[7, 14, 30, 60, 90].map((d) => (
                    <option key={d} value={d}>
                      {d} days
                    </option>
                  ))}
                </select>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function Retention() {
  const ui = useDriveUI();
  const { ctx, me } = ui.engine;
  const [target, setTarget] = useState('');
  const [reason, setReason] = useState('');
  const trashed = ctx.items.filter((i) => i.trashed);
  const soon = trashed.filter((i) => i.trashed && ctx.now - i.trashed.at > (ctx.policy.trashDays - 7) * DAY).length;
  const holds = [...ctx.drives.filter((d) => d.hold).map((d) => ({ key: `d:${d.id}`, name: d.name, hold: d.hold!, drive: d, item: null })), ...ctx.items.filter((i) => i.hold).map((i) => ({ key: `i:${i.id}`, name: i.name, hold: i.hold!, drive: null, item: i }))];
  const options = [...ctx.drives.filter((d) => d.kind === 'shared' && !d.hold).map((d) => ({ value: `d:${d.id}`, label: `Drive · ${d.name}` })), ...ctx.items.filter((i) => i.kind === 'folder' && !i.hold && !isTrashed(ctx, i)).map((i) => ({ value: `i:${i.id}`, label: `Folder · ${ctx.drive.get(i.driveId)?.name} / ${i.name}` }))];
  const place = () => {
    if (!target) return toast.error('Pick a drive or folder');
    const [k, id] = target.split(':');
    const r = useDrive.getState().setHold(k === 'd' ? { driveId: id } : { itemId: id }, true, reason);
    if (!r.ok) return toast.error(r.error);
    toast.success(r.message ?? 'Hold placed');
    setTarget('');
    setReason('');
  };
  return (
    <div className="dv-gov-grid">
      <section className="neo-card dv-gov-card">
        <div className="neo-section-head">
          <span className="neo-hud">Trash retention</span>
        </div>
        <p className="neo-muted text-sm">Items in trash are deleted forever after this many days. Legal holds always win.</p>
        <NeoTabs
          label="Retention days"
          value={String(ctx.policy.trashDays)}
          onChange={(v) => toast.result(useDrive.getState().setRetention(Number(v)))}
          items={[7, 14, 30, 60, 90].map((d) => ({ value: String(d), label: `${d}d` }))}
        />
        <div className="dv-expo" style={{ marginTop: 14 }}>
          <div className="dv-expo__tile" data-tone="slate">
            <Trash2 />
            <span className="neo-num">{trashed.length}</span>
            <span className="neo-faint text-xs">items in trash</span>
          </div>
          <div className="dv-expo__tile" data-tone="rose">
            <Timer />
            <span className="neo-num">{soon}</span>
            <span className="neo-faint text-xs">purge within 7 days</span>
          </div>
        </div>
        <button type="button" className="neo-btn neo-btn--sm" style={{ marginTop: 12 }} onClick={() => toast.info(`Retention run: ${useDrive.getState().sweepTrash()} items purged`)}>
          <ActivityIcon /> Run retention now
        </button>
      </section>
      <section className="neo-card dv-gov-card">
        <div className="neo-section-head">
          <span className="neo-hud">Legal holds</span>
          <span className="neo-faint text-xs">{holds.length} active</span>
        </div>
        {holds.length ? (
          <ul className="dv-holds">
            {holds.map((h) => (
              <li key={h.key}>
                {h.drive ? <DriveGlyph drive={h.drive} size={28} /> : h.item ? <KindTile item={h.item} size={28} /> : null}
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="truncate text-sm">
                    <strong>{h.name}</strong>
                  </div>
                  <div className="neo-faint text-xs truncate">
                    {h.hold.reason} · by {ctx.user.get(h.hold.by)?.name ?? 'admin'} {relativeTime(h.hold.at)}
                  </div>
                </div>
                <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={() => toast.result(useDrive.getState().setHold(h.drive ? { driveId: h.drive.id } : { itemId: h.item?.id }, false))}>
                  Release
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="neo-faint text-sm">No legal holds.</p>
        )}
        <div className="dv-form" style={{ marginTop: 12 }}>
          <select className="neo-select neo-select--sm" value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Hold target">
            <option value="">Place a hold on…</option>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <div className="row" style={{ gap: 8 }}>
            <input className="neo-input neo-input--sm" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Matter or case number" aria-label="Hold reason" />
            <button type="button" className="neo-btn neo-btn--soft neo-btn--sm" onClick={place} disabled={!target || reason.trim().length < 5}>
              <Gavel /> Place hold
            </button>
          </div>
          <span className="neo-hint">Holds block trash, delete-forever and retention purges. {me.name.split(' ')[0]}, holds are logged as critical events.</span>
        </div>
      </section>
    </div>
  );
}

function Drives() {
  const ui = useDriveUI();
  const { ctx } = ui.engine;
  const shared = ctx.drives.filter((d) => d.kind === 'shared');
  return (
    <div className="neo-table-wrap">
      <table className="neo-table dv-drivetable">
        <thead>
          <tr>
            <th>Drive</th>
            <th className="dv-hide-sm">Department</th>
            <th>Members</th>
            <th className="dv-hide-sm">Storage</th>
            <th>Default label</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {shared.map((d) => {
            const people = new Set(d.members.flatMap((m) => principalMembers(ctx, m.principal).map((v) => v.id))).size;
            const u = driveUsage(ctx, d.id);
            return (
              <tr key={d.id}>
                <td>
                  <Link to={`/drive/d/${d.id}`} className="row" style={{ gap: 10, minWidth: 0 }}>
                    <DriveGlyph drive={d} size={30} />
                    <span style={{ minWidth: 0 }}>
                      <span className="truncate" style={{ display: 'block', fontWeight: 600 }}>
                        {d.name}
                        {d.hold && (
                          <span className="dv-mini-tag" style={{ marginLeft: 8 }}>
                            <Gavel /> Hold
                          </span>
                        )}
                      </span>
                      <span className="truncate neo-faint text-xs" style={{ display: 'block' }}>
                        {d.description}
                      </span>
                    </span>
                  </Link>
                </td>
                <td className="dv-hide-sm">{d.department ?? '—'}</td>
                <td>
                  <span className="neo-num">{people}</span> <span className="neo-faint text-xs">· {d.members.length} grants</span>
                </td>
                <td className="dv-hide-sm" style={{ minWidth: 140 }}>
                  <div className="neo-faint text-xs">
                    {formatBytes(u)} / {formatBytes(d.quota)}
                  </div>
                  <Bar value={u / d.quota} fill={d.color} label={`${d.name} storage`} />
                </td>
                <td>
                  <LabelChip label={d.defaultLabel} />
                </td>
                <td>
                  <button type="button" className="neo-btn neo-btn--sm" onClick={() => ui.open({ type: 'members', driveId: d.id })}>
                    <Users /> Manage
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

interface AuditRow {
  id: string;
  at: number;
  actorId: string;
  action: string;
  target: string;
  detail?: string;
  outcome: 'success' | 'denied';
  severity: 'info' | 'warning' | 'critical';
  source: 'Audit' | 'Activity';
}

function AuditLog() {
  const ui = useDriveUI();
  const { ctx } = ui.engine;
  const hubAudit = useHub((s) => s.audit);
  const [filter, setFilter] = useState<'all' | 'warn' | 'denied'>('all');
  const [q, setQ] = useState('');
  const rows = useMemo(() => {
    const out: AuditRow[] = hubAudit.filter((a) => a.action.startsWith('drive.')).map((a) => ({ ...a, source: 'Audit' as const }));
    const verbs: Record<string, string> = { shared: 'drive.share', unshared: 'drive.share.remove', link: 'drive.link', labelled: 'drive.label.change', inheritance: 'drive.inheritance', approved: 'drive.access.approve', denied: 'drive.access.deny', trashed: 'drive.item.trash', restored: 'drive.item.restore' };
    for (const i of ctx.items)
      for (const a of i.activity) {
        const action = verbs[a.verb];
        if (!action) continue;
        if (out.some((o) => o.source === 'Audit' && o.target === i.name && Math.abs(o.at - a.at) < 5000)) continue;
        const sensitive = i.label === 'confidential' || i.label === 'restricted';
        out.push({ id: `${i.id}:${a.id}`, at: a.at, actorId: a.by, action, target: i.name, detail: a.detail, outcome: 'success', severity: a.verb === 'link' && /Anyone with/.test(a.detail ?? '') ? 'warning' : sensitive && (a.verb === 'shared' || a.verb === 'labelled') ? 'warning' : 'info', source: 'Activity' });
      }
    const s = q.trim().toLowerCase();
    return out
      .filter((r) => (filter === 'all' ? true : filter === 'denied' ? r.outcome === 'denied' : r.severity !== 'info'))
      .filter((r) => !s || `${r.action} ${r.target} ${r.detail ?? ''} ${ctx.user.get(r.actorId)?.name ?? ''}`.toLowerCase().includes(s))
      .sort((a, b) => b.at - a.at)
      .slice(0, 200);
  }, [hubAudit, ctx, filter, q]);
  return (
    <div className="dv-audit">
      <div className="row row--wrap" style={{ gap: 8, marginBottom: 12 }}>
        <NeoTabs
          label="Audit filter"
          value={filter}
          onChange={setFilter}
          items={[
            { value: 'all', label: 'All' },
            { value: 'warn', label: 'Warnings' },
            { value: 'denied', label: 'Denied' },
          ]}
        />
        <NeoSearch value={q} onChange={setQ} placeholder="Search the trail…" size="sm" className="dv-audit__search" />
        <span className="grow" />
        <button
          type="button"
          className="neo-btn neo-btn--sm"
          onClick={() => downloadCsv('drive-audit.csv', rows.map((r) => ({ time: new Date(r.at).toISOString(), actor: ctx.user.get(r.actorId)?.name ?? r.actorId, action: r.action, target: r.target, detail: r.detail ?? '', outcome: r.outcome, severity: r.severity, source: r.source })))}
        >
          <Download /> Export CSV
        </button>
      </div>
      {rows.length ? (
        <div className="neo-table-wrap">
          <table className="neo-table dv-audittable">
            <thead>
              <tr>
                <th>When</th>
                <th>Who</th>
                <th>Action</th>
                <th>Target</th>
                <th className="dv-hide-sm">Detail</th>
                <th>Outcome</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const u = ctx.user.get(r.actorId);
                return (
                  <tr key={r.id} className={cx(r.severity !== 'info' && `is-${r.severity}`)}>
                    <td className="neo-faint text-xs" title={formatDateTime(r.at)}>
                      {relativeTime(r.at)}
                    </td>
                    <td>
                      <span className="row" style={{ gap: 6 }}>
                        {u && <Avatar user={u} size={20} />}
                        <span className="truncate">{u?.name ?? 'System'}</span>
                      </span>
                    </td>
                    <td>
                      <span className="neo-mono dv-action">{r.action}</span>
                    </td>
                    <td className="truncate" style={{ maxWidth: 220 }}>
                      {r.target}
                    </td>
                    <td className="neo-faint text-xs dv-hide-sm truncate" style={{ maxWidth: 280 }}>
                      {r.detail}
                    </td>
                    <td>
                      <Chip size="sm" tone={r.outcome === 'denied' ? 'danger' : r.severity === 'critical' ? 'danger' : r.severity === 'warning' ? 'warning' : 'success'}>
                        {r.outcome === 'denied' ? 'Denied' : r.severity === 'info' ? 'OK' : r.severity}
                      </Chip>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <NeoEmpty compact icon={<ShieldCheck />} title="Nothing matches">
          Try a different filter.
        </NeoEmpty>
      )}
    </div>
  );
}

/* ---------------- page ---------------- */

export function GovernanceView() {
  const ui = useDriveUI();
  const { ctx } = ui.engine;
  const [tab, setTab] = useState<Tab>('overview');
  const [selected, setSelected] = useState<string | null>(null);
  const findings = useMemo(() => findRisks(ctx), [ctx]);
  if (!ui.engine.isAdmin)
    return (
      <NeoStage label="Governance">
        <NeoHead icon={<ShieldCheck />} eyebrow="Helix Drive" title="Governance" onToggleSide={ui.toggleSide} />
        <div className="neo-body">
          <NeoEmpty icon={<Lock />} title="Governance is for Drive admins" action={<Link to="/drive" className="neo-btn neo-btn--sm">Back to Drive</Link>}>
            It needs the <code>drive.manage</code> permission. You can still see who has access to any file you manage with Access X-Ray.
          </NeoEmpty>
        </div>
      </NeoStage>
    );
  const exposed = findings.filter((f) => f.state === 'exposed').length;
  const select = (id: string) => {
    setSelected(id);
    requestAnimationFrame(() => document.getElementById(`finding-${id}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  };
  return (
    <NeoStage label="Governance">
      <NeoHead
        icon={<ShieldCheck />}
        eyebrow="Drive governance"
        title="Holo Vault control"
        sub={`${findings.length} findings · ${exposed} exposed · DLP rules on ${LABELS.length} labels`}
        onToggleSide={ui.toggleSide}
        actions={
          <button type="button" className="neo-btn neo-btn--plasma" onClick={() => ui.open({ type: 'newDrive' })} data-qa="new-drive">
            <Plus /> <span className="neo-btn__label">New shared drive</span>
          </button>
        }
      />
      <div className="neo-toolbar">
        <NeoTabs
          variant="underline"
          label="Governance sections"
          value={tab}
          onChange={setTab}
          items={[
            { value: 'overview', label: 'Overview' },
            { value: 'radar', label: 'Risk radar', count: findings.length || null },
            { value: 'dlp', label: 'DLP rules' },
            { value: 'retention', label: 'Retention & holds' },
            { value: 'drives', label: 'Shared drives' },
            { value: 'audit', label: 'Audit log' },
          ]}
        />
      </div>
      <div className="neo-body neo-pad">
        {tab === 'overview' && <Overview findings={findings} goRadar={() => setTab('radar')} />}
        {tab === 'radar' && (
          <div className="dv-radarlayout">
            <div className="dv-radarlayout__viz neo-card">
              <RiskRadar findings={findings} selected={selected} onSelect={select} />
              <div className="dv-radar__legend">
                <span>
                  <i className="is-exposed" /> Exposed
                </span>
                <span>
                  <i className="is-dormant" /> Dormant (blocked by DLP)
                </span>
                <span className="neo-faint">Closer to the centre = more urgent</span>
              </div>
            </div>
            <div className="dv-findings">
              <div className="row" style={{ gap: 8 }}>
                <Sparkles className="neo-tint" style={{ width: 16 }} />
                <span className="text-sm grow">
                  <strong>{findings.length}</strong> oversharing findings — each with a one-click fix.
                </span>
              </div>
              {findings.length ? (
                findings.map((f) => <FindingCard key={f.id} f={f} selected={selected === f.id} />)
              ) : (
                <NeoEmpty icon={<ShieldCheck />} title="Radar is clear">
                  No oversharing patterns right now.
                </NeoEmpty>
              )}
            </div>
          </div>
        )}
        {tab === 'dlp' && (
          <>
            <div className="dv-banner" style={{ marginBottom: 12 }}>
              <ShieldAlert />
              <span>Rules apply instantly to every file with that label — existing shares that break a rule stop working and show as blocked.</span>
            </div>
            <DlpRules />
          </>
        )}
        {tab === 'retention' && <Retention />}
        {tab === 'drives' && <Drives />}
        {tab === 'audit' && <AuditLog />}
      </div>
    </NeoStage>
  );
}

