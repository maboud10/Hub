/**
 * Fix-it playbooks UI: an animated terminal that streams a playbook plan,
 * plus the Quick-fix modal that runs it end-to-end and records the outcome.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { AlertTriangle, CheckCircle2, CircleX, Loader2, Play, ShieldAlert, Sparkles, TicketPlus } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { NovaChip } from '@/components/neo';
import { toast } from '@/store/toast';
import { useHelpdesk } from '@/helpdesk/store';
import { PLAYBOOKS, planPlaybook, type PlaybookPlan } from '@/helpdesk/playbooks';
import { primaryDevice } from '@/helpdesk/fleet';
import { activeIncidents } from '@/helpdesk/queries';
import { officeOf } from '@/helpdesk/meta';
import type { PlaybookId } from '@/helpdesk/types';
import { useOpenTicket, useViewer } from './ui';
import { PLAYBOOK_ICON } from './icons';

const reduced = () => typeof window !== 'undefined' && (document.documentElement.dataset.motion === 'reduced' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

/** Build a plan for the signed-in person (primary device, office, live incidents). */
export function usePlanFor() {
  const viewer = useViewer();
  const devices = useHelpdesk((s) => s.devices);
  const incidents = useHelpdesk((s) => s.incidents);
  return useCallback(
    (id: PlaybookId, input?: string): { plan: PlaybookPlan; deviceTag?: string } => {
      const uid = viewer?.user.id ?? '';
      const mine = devices.filter((d) => d.assigneeId === uid && (d.status === 'in_use' || d.status === 'loaner'));
      const device = PLAYBOOKS[id].needsDevice ? primaryDevice(devices, uid) : undefined;
      const plan = planPlaybook(id, {
        now: Date.now(),
        email: viewer?.user.email,
        office: officeOf(viewer?.user.location),
        device,
        peripherals: mine.filter((d) => d.assetTag !== device?.assetTag),
        incidents: activeIncidents(incidents),
        input,
      });
      return { plan, deviceTag: device?.assetTag };
    },
    [viewer, devices, incidents],
  );
}

export function PlaybookTerminal({ plan, onDone, title }: { plan: PlaybookPlan; onDone?: (plan: PlaybookPlan) => void; title?: string }) {
  const [step, setStep] = useState(0);
  const [lines, setLines] = useState<number[]>(() => plan.steps.map(() => 0));
  const [done, setDone] = useState(false);
  const body = useRef<HTMLDivElement>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    setStep(0);
    setLines(plan.steps.map(() => 0));
    setDone(false);
    const speed = reduced() ? 0.12 : 1;
    const timers: number[] = [];
    let t = 220 * speed;
    plan.steps.forEach((s, i) => {
      timers.push(window.setTimeout(() => setStep(i), t));
      const gap = s.ms / (s.lines.length + 1);
      s.lines.forEach((_, j) => {
        timers.push(window.setTimeout(() => setLines((prev) => prev.map((n, k) => (k === i ? Math.max(n, j + 1) : n))), t + gap * (j + 1) * speed));
      });
      t += s.ms * speed;
    });
    timers.push(
      window.setTimeout(() => {
        setStep(plan.steps.length);
        setDone(true);
        doneRef.current?.(plan);
      }, t + 120 * speed),
    );
    return () => timers.forEach((x) => window.clearTimeout(x));
  }, [plan]);

  useEffect(() => {
    const el = body.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [step, lines, done]);

  const total = plan.steps.reduce((a, s) => a + s.lines.length + 1, 0);
  const shown = lines.reduce((a, n) => a + n, 0) + Math.min(step, plan.steps.length);
  const pct = done ? 100 : Math.round((shown / total) * 100);

  return (
    <div className="hd-term" data-done={done || undefined} data-outcome={done ? plan.outcome : undefined}>
      <div className="hd-term__bar">
        <span className="hd-term__dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className="hd-term__title">nova@helix — {title ?? PLAYBOOKS[plan.playbookId].title.toLowerCase()}</span>
        <span className="hd-term__pct neo-mono">{pct}%</span>
      </div>
      <div className="hd-term__progress" aria-hidden="true">
        <i style={{ width: `${pct}%` }} />
      </div>
      <div className="hd-term__body" ref={body} role="log" aria-live="polite">
        {plan.steps.map((s, i) => {
          if (i > step) return null;
          const state = i < step || done ? s.status : 'run';
          return (
            <div key={s.label} className="hd-term__step" data-status={state}>
              <div className="hd-term__head">
                <span className="hd-term__glyph">{state === 'run' ? <Loader2 className="hd-spin" /> : state === 'ok' ? '✓' : state === 'warn' ? '!' : '×'}</span>
                {s.label}
              </div>
              {s.lines.slice(0, lines[i]).map((l, j) => (
                <div key={j} className="hd-term__line">
                  {l}
                </div>
              ))}
            </div>
          );
        })}
        {!done && <span className="hd-term__cursor" aria-hidden="true" />}
      </div>
      {done && <Outcome plan={plan} />}
    </div>
  );
}

export function Outcome({ plan }: { plan: PlaybookPlan }) {
  const Icon = plan.outcome === 'success' ? CheckCircle2 : plan.outcome === 'partial' ? AlertTriangle : CircleX;
  const label = plan.outcome === 'success' ? 'Fixed' : plan.outcome === 'partial' ? 'Partly fixed' : 'Couldn’t fix it';
  return (
    <div className="hd-outcome" data-outcome={plan.outcome}>
      <Icon />
      <div>
        <strong>{label}</strong>
        <p>{plan.summary}</p>
      </div>
    </div>
  );
}

/** Quick fix runner in a modal: (optional input) → animated run → recorded outcome. */
export function PlaybookModal({ playbookId, onClose }: { playbookId: PlaybookId | null; onClose: () => void }) {
  const planFor = usePlanFor();
  const openTicket = useOpenTicket();
  const [phase, setPhase] = useState<'input' | 'run' | 'done'>('run');
  const [input, setInput] = useState('');
  const [run, setRun] = useState<{ plan: PlaybookPlan; deviceTag?: string } | null>(null);
  const [ticketId, setTicketId] = useState<string | undefined>();
  const book = playbookId ? PLAYBOOKS[playbookId] : null;

  useEffect(() => {
    setTicketId(undefined);
    setInput('');
    if (!playbookId) return;
    if (playbookId === 'report-phishing') {
      setPhase('input');
      setRun(null);
    } else {
      setPhase('run');
      setRun(planFor(playbookId));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playbookId]);

  const finish = useCallback(
    (plan: PlaybookPlan) => {
      setPhase('done');
      const r = useHelpdesk.getState().recordFix({ plan, deviceTag: run?.deviceTag });
      if (r.ok && r.ticketId) {
        setTicketId(r.ticketId);
        toast.success(plan.outcome === 'success' ? `${PLAYBOOKS[plan.playbookId].title} — done` : 'Partly fixed', `Saved to your history as ${r.ticketId}`);
      }
    },
    [run],
  );

  const Icon = playbookId ? PLAYBOOK_ICON[playbookId] : Sparkles;
  const start = () => {
    if (!playbookId) return;
    setRun(planFor(playbookId, input));
    setPhase('run');
  };

  const footer = useMemo(() => {
    if (!book) return null;
    if (phase === 'input')
      return (
        <>
          <button type="button" className="neo-btn neo-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="neo-btn neo-btn--plasma" onClick={start} disabled={input.trim().length < 8} data-qa="phish-analyse">
            <Play /> Analyse &amp; report
          </button>
        </>
      );
    if (phase !== 'done') return <span className="neo-faint text-sm">Running on your device — you can keep working.</span>;
    return (
      <>
        {ticketId && (
          <Link to={`/helpdesk/tickets/${ticketId}`} className="neo-btn neo-btn--ghost" onClick={onClose}>
            View in history
          </Link>
        )}
        {run && run.plan.outcome !== 'success' && (
          <button
            type="button"
            className="neo-btn neo-btn--soft"
            onClick={() => {
              onClose();
              openTicket({ category: book.category, device: run.deviceTag, subject: `${book.title} didn’t fully fix it`, description: `${run.plan.summary}\n\nNova log:\n${run.plan.steps.map((s) => `• ${s.label}`).join('\n')}` });
            }}
          >
            <TicketPlus /> Create a ticket
          </button>
        )}
        <button type="button" className="neo-btn neo-btn--plasma" onClick={onClose} data-qa="fix-close">
          Done
        </button>
      </>
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book, phase, input, ticketId, run]);

  return (
    <Modal
      open={!!playbookId}
      onClose={onClose}
      width={640}
      className="neo-portal hd-fixmodal"
      icon={
        <span className="hd-fixmodal__icon">
          <Icon />
        </span>
      }
      title={book?.title ?? ''}
      subtitle={book?.blurb}
      footer={footer}
    >
      {phase === 'input' && (
        <div className="hd-phish">
          <div className="hd-phish__tip">
            <ShieldAlert />
            <p>Paste the email or describe it (sender, subject, what it asked for). Nova analyses it, purges every copy and blocks the sender.</p>
          </div>
          <textarea className="neo-textarea" rows={5} autoFocus value={input} onChange={(e) => setInput(e.target.value)} placeholder="From: DocuSign <noreply@docusign-helix.com> — “Please sign the Q4 vendor agreement”, link asks for my Helix password…" />
          <div className="row" style={{ gap: 8 }}>
            <NovaChip>Clicked or entered your password? Say so — it becomes a P1.</NovaChip>
          </div>
        </div>
      )}
      {phase !== 'input' && run && <PlaybookTerminal plan={run.plan} onDone={finish} />}
    </Modal>
  );
}
