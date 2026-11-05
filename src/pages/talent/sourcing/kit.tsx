/**
 * Outreach + LinkedIn building blocks shared by the AI Sourcing studio and the
 * outreach / import modals: channel & tone pickers, the live character meter,
 * personalisation-hook chips, a syntax-highlighted Boolean / X-ray query, a
 * HUD checkbox, an inline "pick a requisition" strip and small helpers that
 * turn candidates / prospects into outreach inputs.
 */
import { useId, useMemo, useState, type ReactNode } from 'react';
import { Activity, Briefcase, Check, Linkedin, Mail, MapPin, Sparkles, TriangleAlert, UserPlus, X, type LucideIcon } from 'lucide-react';
import type { Candidate, OutreachChannel, OutreachTone, Requisition } from '@/talent/types';
import { CHANNEL_META, TONE_META } from '@/talent/constants';
import type { OutreachPerson } from '@/talent/ai/engine';
import { useSessionUser } from '@/store/selectors';
import { Segmented } from '@/components/ui/primitives';
import { cx } from '@/lib/cx';

export const CHANNELS: OutreachChannel[] = ['linkedin-connect', 'linkedin-inmail', 'email'];
export const TONES: OutreachTone[] = ['warm', 'concise', 'visionary', 'technical'];

export const CHANNEL_ICON: Record<OutreachChannel, LucideIcon> = {
  'linkedin-connect': UserPlus,
  'linkedin-inmail': Linkedin,
  email: Mail,
};

const DAY = 86_400_000;

// ───────────────────────── pickers ─────────────────────────
const compactLimit = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n % 1000 ? 1 : 0)}k` : String(n));

/** LinkedIn connection note (300) · InMail · Email, with the character budget on each option. */
export function ChannelPicker({ value, onChange }: { value: OutreachChannel; onChange: (c: OutreachChannel) => void }) {
  return (
    <div className="tl-out-channels">
      <Segmented
        label="Channel"
        value={value}
        onChange={onChange}
        options={CHANNELS.map((c) => {
          const Icon = CHANNEL_ICON[c];
          const m = CHANNEL_META[c];
          return {
            value: c,
            icon: <Icon aria-hidden="true" />,
            title: `${m.label}. ${m.hint}`,
            label: (
              <>
                <span className="tl-out-channels__label">{m.short}</span>
                <span className="tl-out-channels__limit">{compactLimit(m.limit)}</span>
              </>
            ),
          };
        })}
      />
    </div>
  );
}

export function TonePicker({ value, onChange }: { value: OutreachTone; onChange: (t: OutreachTone) => void }) {
  return (
    <div className="tl-out-tones" role="radiogroup" aria-label="Tone">
      {TONES.map((t) => (
        <button
          key={t}
          type="button"
          role="radio"
          aria-checked={value === t}
          className={cx('chip', value === t && 'is-active')}
          title={TONE_META[t].description}
          onClick={() => onChange(t)}
        >
          {TONE_META[t].label}
        </button>
      ))}
    </div>
  );
}

// ───────────────────────── message feedback ─────────────────────────
/** Live character counter vs. the channel limit; the bar turns amber near and red over the limit. */
export function CharMeter({ count, limit, label = 'Body' }: { count: number; limit: number; label?: string }) {
  const pct = Math.min(100, (count / Math.max(1, limit)) * 100);
  const over = count > limit;
  const tone = over ? 'over' : count > limit * 0.9 ? 'near' : 'ok';
  return (
    <div className={cx('tl-out-meter', `is-${tone}`)}>
      <span className="tl-out-meter__label">{label}</span>
      <span className="tl-out-meter__bar" aria-hidden="true">
        <span style={{ width: `${pct}%` }} />
      </span>
      <span className="tl-out-meter__count">
        {count.toLocaleString()} / {limit.toLocaleString()}
      </span>
      {over && (
        <span className="tl-out-meter__over" aria-live="polite">
          {(count - limit).toLocaleString()} over the limit
        </span>
      )}
    </div>
  );
}

const HOOK_ICON: [RegExp, LucideIcon][] = [
  [/^shared skills/i, Sparkles],
  [/^current role/i, Briefcase],
  [/^recent activity/i, Activity],
  [/^same city/i, MapPin],
];

/** The personalisation hooks the writer used, so the recruiter can verify them. */
export function HookChips({ hooks, label = 'Personalised with' }: { hooks: string[]; label?: string }) {
  if (!hooks.length) return null;
  return (
    <div className="tl-out-hooks">
      <span className="tl-out-hooks__label">{label}</span>
      {hooks.map((h) => {
        const Icon = HOOK_ICON.find(([re]) => re.test(h))?.[1] ?? Sparkles;
        const [k, ...rest] = h.split(': ');
        return (
          <span key={h} className="tl-out-hook" title={h}>
            <Icon aria-hidden="true" />
            <b>{k}</b>
            {rest.length > 0 && <span className="truncate">{rest.join(': ')}</span>}
          </span>
        );
      })}
    </div>
  );
}

export function FallbackNotice({ reason, what = 'draft' }: { reason?: string; what?: string }) {
  if (!reason) return null;
  return (
    <div className="tl-out-fallback" role="note">
      <TriangleAlert aria-hidden="true" />
      <span>
        Gemini was unavailable ({reason}), so the offline engine wrote this {what}. Review it as usual.
      </span>
    </div>
  );
}

// ───────────────────────── Boolean / X-ray ─────────────────────────
type TokKind = 'op' | 'not' | 'str' | 'paren' | 'field' | 'neg' | 'term' | 'ws';

function tokenize(q: string): { kind: TokKind; text: string }[] {
  const out: { kind: TokKind; text: string }[] = [];
  for (const m of q.matchAll(/"[^"]*"|\(|\)|\s+|[^\s()"]+/g)) {
    const t = m[0];
    if (/^\s+$/.test(t)) out.push({ kind: 'ws', text: t });
    else if (t.startsWith('"')) out.push({ kind: 'str', text: t });
    else if (t === '(' || t === ')') out.push({ kind: 'paren', text: t });
    else if (t === 'AND' || t === 'OR') out.push({ kind: 'op', text: t });
    else if (t === 'NOT') out.push({ kind: 'not', text: t });
    else if (/^-?[a-z]+:/i.test(t)) out.push({ kind: 'field', text: t });
    else if (t.startsWith('-')) out.push({ kind: 'neg', text: t });
    else out.push({ kind: 'term', text: t });
  }
  return out;
}

/** A search string with AND / OR / NOT, quoted phrases and operators highlighted. */
export function QueryCode({ query, label }: { query: string; label: string }) {
  const parts = useMemo(() => tokenize(query), [query]);
  return (
    <code className="tl-bq" aria-label={label}>
      {parts.map((p, i) =>
        p.kind === 'ws' ? (
          p.text
        ) : (
          <span key={i} className={`tl-bq-${p.kind}`}>
            {p.text}
          </span>
        ),
      )}
    </code>
  );
}

// ───────────────────────── people ─────────────────────────
type PersonLike = Pick<Candidate, 'name' | 'currentTitle' | 'currentCompany' | 'location' | 'skills' | 'recentActivity' | 'yearsExperience'>;

/** Candidates and prospects share the fields the outreach writer needs. */
export function toOutreachPerson(p: PersonLike): OutreachPerson {
  return {
    name: p.name,
    currentTitle: p.currentTitle,
    currentCompany: p.currentCompany,
    location: p.location,
    skills: p.skills,
    recentActivity: p.recentActivity,
    yearsExperience: p.yearsExperience,
  };
}

/** The signed-in recruiter as the outreach sender. */
export function useSender() {
  const me = useSessionUser();
  const name = me?.name ?? 'The NEXUS team';
  const title = me?.title ?? 'Talent Partner';
  return useMemo(() => ({ name, title }), [name, title]);
}

export const DEGREE_LABEL: Record<1 | 2 | 3, string> = { 1: '1st', 2: '2nd', 3: '3rd' };

export function DegreeBadge({ degree }: { degree: 1 | 2 | 3 }) {
  return (
    <span className={cx('tl-src-degree', `tl-src-degree--${degree}`)} title={`${DEGREE_LABEL[degree]}-degree connection`}>
      {DEGREE_LABEL[degree]}
    </span>
  );
}

export const STEP_LABEL: Record<1 | 2 | 3, string> = { 1: 'First touch', 2: 'Follow-up #1', 3: 'Follow-up #2' };

export function daysAgo(ts: number, now = Date.now()) {
  const d = Math.floor((now - ts) / DAY);
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d}d ago`;
}

export const mailtoHref = (to: string, subject: string, body: string) =>
  `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

// ───────────────────────── controls ─────────────────────────
/** Card header: numbered step badge or icon, title, sub-line and optional right slot. */
export function PanelHead({ n, icon: Icon, title, sub, right }: { n?: string; icon?: LucideIcon; title: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <header className="tl-src-phead">
      {n ? (
        <span className="tl-src-phead__n" aria-hidden="true">
          {n}
        </span>
      ) : Icon ? (
        <span className="tl-src-phead__icon" aria-hidden="true">
          <Icon />
        </span>
      ) : null}
      <div className="grow">
        <h3 className="tl-src-phead__title">{title}</h3>
        {sub && <p className="tl-src-phead__sub">{sub}</p>}
      </div>
      {right}
    </header>
  );
}

/** HUD-style checkbox (native input underneath for keyboard + screen readers). */
export function CheckToggle({ checked, onChange, label, className }: { checked: boolean; onChange: (v: boolean) => void; label: string; className?: string }) {
  return (
    <label className={cx('tl-src-check', checked && 'is-on', className)} title={label}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
      <span aria-hidden="true">
        <Check />
      </span>
    </label>
  );
}

/** Inline "add to which requisition?" strip shown when the studio has no target yet. */
export function ReqInlinePicker({
  requisitions,
  who,
  onPick,
  onCancel,
  note,
}: {
  requisitions: Requisition[];
  who: string;
  onPick: (reqId: string) => void;
  onCancel: () => void;
  note?: ReactNode;
}) {
  const id = useId();
  const open = requisitions.filter((r) => r.status === 'open');
  const [value, setValue] = useState(open[0]?.id ?? '');
  return (
    <div className="tl-src-reqpick" role="group" aria-labelledby={id}>
      <span id={id} className="tl-src-reqpick__label">
        Add {who} to
      </span>
      {open.length ? (
        <>
          <select className="select" value={value} onChange={(e) => setValue(e.target.value)} aria-label="Open requisition">
            {open.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title} · {r.location}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn--sm btn--primary" disabled={!value} onClick={() => onPick(value)}>
            Add
          </button>
        </>
      ) : (
        <span className="faint text-sm">No open requisitions yet.</span>
      )}
      <button type="button" className="icon-btn icon-btn--sm" onClick={onCancel} aria-label="Cancel">
        <X />
      </button>
      {note && <span className="tl-src-reqpick__note">{note}</span>}
    </div>
  );
}
