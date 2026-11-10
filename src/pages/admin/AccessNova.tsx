/**
 * Control deck · "Ask about access" — the kit's NeoNovaPrompt wired to the
 * deterministic engine in ./novaEngine. Answers render inline: a short
 * "thinking" beat, a streamed summary, entity rows, quick facts, deep links
 * into the right tab and follow-up questions. Answers stay live — approve a
 * request elsewhere and the open answer updates.
 * `?ask=…` pre-runs a question (deep links from search or the palette).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  AppWindow,
  ArrowRight,
  Ban,
  Crown,
  Hourglass,
  Inbox,
  KeyRound,
  LockKeyhole,
  ScrollText,
  ShieldAlert,
  ShieldHalf,
  Sparkles,
  UserRound,
  UserX,
  X,
} from 'lucide-react';
import { NeoNovaPrompt, Typing, useTypewriter } from '@/components/neo';
import { AppIcon, Avatar } from '@/components/ui/primitives';
import { useHub } from '@/store/hub';
import { useNow } from '@/hooks/useNow';
import type { PermissionSet } from '@/lib/rbac';
import { answerAccessQuestion, novaSuggestions, type NovaAnswer, type NovaIntent, type NovaRow, type NovaScope } from './novaEngine';

const THINK_MS = 460;

const INTENT_ICON: Record<NovaIntent, ReactNode> = {
  check: <KeyRound />,
  'app-access': <AppWindow />,
  'person-requests': <Inbox />,
  'person-activity': <ScrollText />,
  person: <UserRound />,
  denied: <ShieldAlert />,
  'denied-requests': <Ban />,
  expiring: <Hourglass />,
  pending: <Inbox />,
  admins: <Crown />,
  permanent: <KeyRound />,
  inactive: <UserX />,
  role: <ShieldHalf />,
  locked: <LockKeyhole />,
  help: <Sparkles />,
};

export function AccessNova({ can, myPerms, meId }: { can: NovaScope; myPerms: PermissionSet; meId?: string }) {
  const users = useHub((s) => s.users);
  const roles = useHub((s) => s.roles);
  const apps = useHub((s) => s.apps);
  const requests = useHub((s) => s.requests);
  const audit = useHub((s) => s.audit);
  const now = useNow(60_000);
  const [sp] = useSearchParams();
  const [asked, setAsked] = useState<{ q: string; n: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const ctx = useMemo(() => ({ users, roles, apps, requests, audit, now, meId, myPerms, can }), [users, roles, apps, requests, audit, now, meId, myPerms, can]);
  const answer = useMemo(() => (asked ? answerAccessQuestion(asked.q, ctx) : null), [asked, ctx]);
  const suggestions = useMemo(() => novaSuggestions(can), [can]);

  const ask = useCallback((q: string) => {
    window.clearTimeout(timer.current);
    setBusy(true);
    timer.current = window.setTimeout(() => {
      setAsked((prev) => ({ q, n: (prev?.n ?? 0) + 1 }));
      setBusy(false);
    }, THINK_MS);
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  // Deep link: /admin/overview?ask=Who%20can%20open%20Payroll
  const initial = useRef(sp.get('ask'));
  useEffect(() => {
    if (initial.current) ask(initial.current);
  }, [ask]);

  return (
    <NeoNovaPrompt
      hud="Nova · access intelligence"
      title="Ask about access"
      badge="Live policy · no guesswork"
      placeholder="e.g. Who can open Payroll? What did Alex request? Which grants expire this week?"
      suggestions={suggestions}
      onSubmit={ask}
      busy={busy}
      submitLabel="Ask"
      label="Ask about access"
      className="adm-novaprompt"
    >
      {(busy || (answer && asked)) && (
        <div className="adm-nova" aria-live="polite">
          {busy ? (
            <div className="adm-nova__thinking">
              <Typing label="Nova is checking access" />
              <span>Cross-checking roles, grants, requests and the audit trail…</span>
            </div>
          ) : (
            answer && asked && <Answer key={asked.n} q={asked.q} a={answer} onAsk={ask} onClear={() => setAsked(null)} />
          )}
        </div>
      )}
    </NeoNovaPrompt>
  );
}

function Answer({ q, a, onAsk, onClear }: { q: string; a: NovaAnswer; onAsk: (q: string) => void; onClear: () => void }) {
  const [typed, done] = useTypewriter(a.summary, 150);
  return (
    <article className="adm-nova__answer neo-rise" data-tone={a.tone}>
      <header className="adm-nova__head">
        <span className="adm-nova__icon" aria-hidden="true">
          {INTENT_ICON[a.intent]}
        </span>
        <div className="adm-nova__titles">
          <div className="neo-hud adm-nova__asked">
            You asked · <q>{q}</q>
          </div>
          <h3 className="adm-nova__title">{a.title}</h3>
        </div>
        <button type="button" className="neo-iconbtn adm-nova__close" onClick={onClear} aria-label="Clear answer">
          <X />
        </button>
      </header>

      <p className="adm-nova__summary">
        <span className="sr-only">{a.summary}</span>
        <span aria-hidden="true">
          {typed}
          {!done && <span className="adm-nova__caret" />}
        </span>
      </p>

      {a.facts.length > 0 && (
        <div className="adm-nova__facts">
          {a.facts.map((f) => (
            <span key={f.label} className="adm-nova__fact">
              <b className="neo-num">{f.value}</b>
              <span className="neo-hud">{f.label}</span>
            </span>
          ))}
        </div>
      )}

      {a.rows.length > 0 && (
        <ul className="adm-nova__rows neo-stagger">
          {a.rows.map((r, i) => (
            <AnswerRow key={r.key} r={r} i={i} />
          ))}
          {a.more > 0 && <li className="adm-nova__more">+{a.more} more</li>}
        </ul>
      )}

      {(a.links.length > 0 || a.followUps.length > 0) && (
        <footer className="adm-nova__foot">
          {a.links.map((l) => (
            <Link key={l.to + l.label} to={l.to} className="neo-btn neo-btn--soft neo-btn--xs">
              {l.label} <ArrowRight />
            </Link>
          ))}
          {a.followUps.map((f) => (
            <button key={f} type="button" className="neo-suggest" onClick={() => onAsk(f)}>
              {f}
            </button>
          ))}
        </footer>
      )}
    </article>
  );
}

function AnswerRow({ r, i }: { r: NovaRow; i: number }) {
  return (
    <li className="adm-nova__row" style={{ '--i': i } as CSSProperties}>
      {r.user ? (
        <Avatar user={r.user} size={30} />
      ) : r.app ? (
        <AppIcon app={r.app} size={30} />
      ) : (
        <span className="adm-nova__glyph" data-glyph={r.glyph} aria-hidden="true">
          {r.glyph === 'denied' ? <Ban /> : r.glyph === 'role' ? <ShieldHalf /> : <ScrollText />}
        </span>
      )}
      <span className="adm-nova__rowtext">
        <b>{r.title}</b>
        <span>{r.meta}</span>
      </span>
      {r.chip && (
        <span className="neo-chip neo-chip--sm" data-tone={r.chip.tone}>
          {r.chip.label}
        </span>
      )}
    </li>
  );
}
