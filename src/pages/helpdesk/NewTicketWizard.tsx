/**
 * New Ticket flow — a friendly 4-step wizard:
 * 1 Category → 2 Device → 3 Details (auto priority + SLA preview + Nova
 * "Try this first") → 4 Review → success. Accepts `category`, `device`,
 * `subject` URL params and a description/impact/urgency draft.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ArrowLeft, ArrowRight, Ban, Check, ImagePlus, Paperclip, PartyPopper, Send, Sparkles, Ticket as TicketIcon, Wand2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { NovaChip } from '@/components/neo';
import { burstConfetti } from '@/lib/confetti';
import { cx } from '@/lib/cx';
import { toast } from '@/store/toast';
import { useHelpdesk } from '@/helpdesk/store';
import type { Attachment, Impact, TicketCategory, Urgency } from '@/helpdesk/types';
import { CATEGORIES, CATEGORY_LABEL, DEVICE_STATUS_LABEL, IMPACTS, KIND_LABEL, officeOf, URGENCIES, PRIORITY_LABEL } from '@/helpdesk/meta';
import { priorityFor, slaPreview } from '@/helpdesk/sla';
import { triage, detectImpact, detectUrgency } from '@/helpdesk/triage';
import { activeIncidents } from '@/helpdesk/queries';
import { PLAYBOOKS, type PlaybookPlan } from '@/helpdesk/playbooks';
import { deviceHealth } from '@/helpdesk/fleet';
import { DeviceGlyph } from './glyphs';
import { AttachmentList, readAttachment } from './Conversation';
import { PlaybookTerminal, usePlanFor } from './playbook';
import { CATEGORY_ICON, HealthRing, PriorityPill, useTicketDraft, useViewer } from './ui';

const STEPS = ['Category', 'Device', 'Details', 'Review'] as const;
const VALID = new Set(CATEGORIES.map((c) => c.id));

export function NewTicketWizard({ onClose }: { onClose: () => void }) {
  const viewer = useViewer();
  const devices = useHelpdesk((s) => s.devices);
  const incidents = useHelpdesk((s) => s.incidents);
  const [sp] = useSearchParams();
  const draft = useTicketDraft((s) => s.draft);
  const planFor = usePlanFor();
  const me = viewer?.user.id ?? '';
  const mine = useMemo(() => devices.filter((d) => d.assigneeId === me && d.status !== 'retired'), [devices, me]);

  const pCat = sp.get('category');
  const pDev = sp.get('device');
  const pSubj = sp.get('subject');
  const initialCategory = pCat && VALID.has(pCat as TicketCategory) ? (pCat as TicketCategory) : null;
  const initialDevice = pDev && mine.some((d) => d.assetTag === pDev) ? pDev : null;

  const [step, setStep] = useState(() => (initialCategory ? (initialDevice || pSubj || draft.description ? 2 : 1) : 0));
  const [category, setCategory] = useState<TicketCategory | null>(initialCategory);
  const [device, setDevice] = useState<string | 'none' | null>(initialDevice ?? (initialCategory && (pSubj || draft.description) ? 'none' : null));
  const [subject, setSubject] = useState(pSubj ?? '');
  const [description, setDescription] = useState(draft.description ?? '');
  const [impact, setImpact] = useState<Impact>(draft.impact ?? 'me');
  const [urgency, setUrgency] = useState<Urgency>(draft.urgency ?? 'normal');
  const [touched, setTouched] = useState({ impact: !!draft.impact, urgency: !!draft.urgency });
  const [files, setFiles] = useState<Attachment[]>([]);
  const [created, setCreated] = useState<string | null>(null);
  const [fix, setFix] = useState<{ plan: PlaybookPlan; deviceTag?: string } | null>(null);
  const [fixDone, setFixDone] = useState<PlaybookPlan | null>(null);
  const subjectRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => useTicketDraft.getState().clear(), []);
  useEffect(() => {
    if (step === 2) requestAnimationFrame(() => subjectRef.current?.focus());
  }, [step]);

  // Suggest impact/urgency from the words used (until the person picks).
  useEffect(() => {
    const text = `${subject} ${description}`;
    if (!touched.impact) setImpact(detectImpact(text));
    if (!touched.urgency) setUrgency(detectUrgency(text));
  }, [subject, description, touched]);

  const cat = category ?? 'other';
  const priority = priorityFor(impact, urgency, cat);
  const devTag = device && device !== 'none' ? device : undefined;

  // Nova "Try this first"
  const [nova, setNova] = useState<ReturnType<typeof triage> | null>(null);
  useEffect(() => {
    const text = `${subject}. ${description}`.trim();
    if (text.length < 8) {
      setNova(null);
      return;
    }
    const t = window.setTimeout(() => {
      const r = triage(text, { now: Date.now(), office: officeOf(viewer?.user.location), devices: mine, incidents: activeIncidents(incidents) });
      setNova(r.intent && r.playbookId && r.confidence >= 0.55 ? r : null);
    }, 450);
    return () => window.clearTimeout(t);
  }, [subject, description, mine, incidents, viewer?.user.location]);

  const canNext = step === 0 ? !!category : step === 1 ? !!device : step === 2 ? subject.trim().length >= 4 : true;

  const pickCategory = (c: TicketCategory) => {
    setCategory(c);
    setStep(1);
  };
  const pickDevice = (d: string | 'none') => {
    setDevice(d);
    setStep(2);
  };

  const submit = (e?: { clientX: number; clientY: number }) => {
    const r = useHelpdesk.getState().createTicket({ subject, description, category: cat, impact, urgency, deviceTag: devTag, attachments: files });
    if (!r.ok) return toast.error(r.error);
    setCreated(r.ticket.id);
    burstConfetti(e ? { x: e.clientX, y: e.clientY } : undefined);
  };

  const onFiles = async (list: FileList | null) => {
    if (!list) return;
    const atts = await Promise.all([...list].slice(0, 4).filter((f) => f.size <= 10 * 1024 * 1024).map(readAttachment));
    setFiles((prev) => [...prev, ...atts].slice(0, 6));
  };

  const title = created ? 'Ticket created' : 'New ticket';
  const subtitle = created ? 'We’re on it' : ['What’s it about?', 'Which device?', 'Tell us what’s happening', 'Check and send'][step];

  const footer = created ? (
    <>
      <button type="button" className="neo-btn neo-btn--ghost" onClick={onClose}>
        Done
      </button>
      <Link to={`/helpdesk/tickets/${created}`} className="neo-btn neo-btn--plasma" onClick={onClose} data-qa="wiz-view">
        View ticket <ArrowRight />
      </Link>
    </>
  ) : (
    <>
      {step > 0 && (
        <button type="button" className="neo-btn neo-btn--ghost" onClick={() => setStep((s) => s - 1)} data-qa="wiz-back">
          <ArrowLeft /> Back
        </button>
      )}
      <span className="grow hd-wiz__footprio">
        {step >= 2 && (
          <>
            <PriorityPill priority={priority} full /> <span className="neo-faint text-sm">{slaPreview(priority)}</span>
          </>
        )}
      </span>
      {step < 3 ? (
        <button type="button" className="neo-btn neo-btn--plasma" disabled={!canNext} onClick={() => setStep((s) => s + 1)} data-qa="wiz-next">
          Next <ArrowRight />
        </button>
      ) : (
        <button type="button" className="neo-btn neo-btn--plasma" onClick={(e) => submit(e)} data-qa="wiz-submit">
          <Send /> Submit ticket
        </button>
      )}
    </>
  );

  return (
    <Modal
      open
      onClose={onClose}
      width={780}
      className="neo-portal hd-wiz"
      icon={
        <span className="hd-fixmodal__icon">
          <TicketIcon />
        </span>
      }
      title={title}
      subtitle={subtitle}
      footer={footer}
    >
      {!created && (
        <ol className="hd-steps" aria-label="Progress">
          {STEPS.map((label, i) => (
            <li key={label} data-state={i < step ? 'done' : i === step ? 'current' : 'todo'}>
              <button type="button" disabled={i > step} onClick={() => i < step && setStep(i)}>
                <span className="hd-steps__n">{i < step ? <Check /> : i + 1}</span>
                <span className="hd-steps__l">{label}</span>
              </button>
            </li>
          ))}
        </ol>
      )}

      {created ? (
        <div className="hd-wizdone neo-rise">
          <span className="hd-wizdone__icon">
            <PartyPopper />
          </span>
          <h3>
            <span className="neo-mono">{created}</span> is on its way
          </h3>
          <p>{slaPreview(priority)}. A specialist will pick it up shortly — you’ll get updates here, in the bell and in Pulse Chat.</p>
          <div className="hd-wizdone__chips">
            <PriorityPill priority={priority} full />
            <span className="hd-chip-soft">{CATEGORY_LABEL[cat]}</span>
            {devTag && <span className="hd-chip-soft neo-mono">{devTag}</span>}
          </div>
        </div>
      ) : step === 0 ? (
        <div className="hd-cats" role="listbox" aria-label="Category">
          {CATEGORIES.map((c) => {
            const Icon = CATEGORY_ICON[c.id];
            return (
              <button key={c.id} type="button" role="option" aria-selected={category === c.id} className="hd-catcard neo-spot" data-tone={c.tone} onClick={() => pickCategory(c.id)} data-qa={`cat-${c.id}`}>
                <span className="hd-catcard__icon">
                  <Icon />
                </span>
                <span className="hd-catcard__label">{c.label}</span>
                <span className="hd-catcard__hint">{c.hint}</span>
              </button>
            );
          })}
        </div>
      ) : step === 1 ? (
        <div className="hd-devpick" role="listbox" aria-label="Device">
          {mine.map((d) => (
            <button key={d.assetTag} type="button" role="option" aria-selected={device === d.assetTag} className="hd-devopt neo-spot" onClick={() => pickDevice(d.assetTag)} data-qa={`dev-${d.assetTag}`}>
              <DeviceGlyph kind={d.kind} size={74} />
              <span className="hd-devopt__text">
                <b>{d.model}</b>
                <span className="neo-mono">{d.assetTag}</span>
                <span className="neo-faint">{d.status === 'in_use' ? KIND_LABEL[d.kind] : DEVICE_STATUS_LABEL[d.status]}</span>
              </span>
              <HealthRing score={deviceHealth(d, Date.now())} size={34} />
            </button>
          ))}
          <button type="button" role="option" aria-selected={device === 'none'} className="hd-devopt hd-devopt--none" onClick={() => pickDevice('none')} data-qa="dev-none">
            <span className="hd-devopt__none">
              <Ban />
            </span>
            <span className="hd-devopt__text">
              <b>Not device-related</b>
              <span className="neo-faint">Accounts, access, a shared printer…</span>
            </span>
          </button>
        </div>
      ) : step === 2 ? (
        <div className="hd-details">
          <div className="neo-field">
            <label className="neo-label" htmlFor="hd-subj">
              Subject
            </label>
            <input id="hd-subj" ref={subjectRef} className="neo-input" value={subject} maxLength={140} onChange={(e) => setSubject(e.target.value)} placeholder="One line, e.g. “VPN drops every few minutes”" data-qa="wiz-subject" />
          </div>
          <div className="neo-field">
            <label className="neo-label" htmlFor="hd-desc">
              What’s happening?
            </label>
            <textarea id="hd-desc" className="neo-textarea" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What were you doing, what did you expect, and what happened instead? Error messages help a lot." data-qa="wiz-desc" />
          </div>
          <div
            className="hd-drop neo-drop"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void onFiles(e.dataTransfer.files);
            }}
          >
            <ImagePlus />
            <span>
              Drop a screenshot here or{' '}
              <button type="button" className="neo-tint" onClick={() => fileRef.current?.click()}>
                browse
              </button>
            </span>
            <input ref={fileRef} type="file" hidden multiple accept="image/*,.pdf,.txt,.log,.har" onChange={(e) => void onFiles(e.target.files).then(() => (e.target.value = ''))} />
          </div>
          <AttachmentList items={files} onRemove={(id) => setFiles((f) => f.filter((x) => x.id !== id))} />

          <div className="hd-matrix">
            <div className="neo-field">
              <span className="neo-label">Who’s affected?</span>
              <div className="hd-chipset" role="radiogroup" aria-label="Impact">
                {IMPACTS.map((x) => (
                  <button key={x.id} type="button" role="radio" aria-checked={impact === x.id} className="hd-choice" title={x.hint} onClick={() => (setImpact(x.id), setTouched((t) => ({ ...t, impact: true })))}>
                    {x.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="neo-field">
              <span className="neo-label">How urgent?</span>
              <div className="hd-chipset" role="radiogroup" aria-label="Urgency">
                {URGENCIES.map((x) => (
                  <button key={x.id} type="button" role="radio" aria-checked={urgency === x.id} className="hd-choice" title={x.hint} onClick={() => (setUrgency(x.id), setTouched((t) => ({ ...t, urgency: true })))}>
                    {x.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="hd-sla-preview" data-p={priority}>
            <PriorityPill priority={priority} full />
            <span>
              <b>Auto priority</b> · {slaPreview(priority)}
            </span>
          </div>

          {nova && !fixDone && (
            <div className="hd-tryfirst neo-rise">
              <div className="hd-tryfirst__head">
                <NovaChip>Try this first</NovaChip>
                <span className="neo-faint text-sm">{Math.round(nova.confidence * 100)}% match · {nova.title}</span>
              </div>
              {!fix ? (
                <div className="hd-tryfirst__body">
                  <p>{nova.cause}</p>
                  <button type="button" className="neo-btn neo-btn--nova neo-btn--sm" onClick={() => setFix(planFor(nova.playbookId!, `${subject} ${description}`))} data-qa="wiz-tryfix">
                    <Wand2 /> {PLAYBOOKS[nova.playbookId!].verb} now
                  </button>
                </div>
              ) : (
                <PlaybookTerminal
                  plan={fix.plan}
                  onDone={(plan) => {
                    setFixDone(plan);
                    const r = useHelpdesk.getState().recordFix({ plan, deviceTag: fix.deviceTag });
                    if (r.ok && r.ticketId) toast.success('Saved to your history', r.ticketId);
                  }}
                />
              )}
            </div>
          )}
          {fixDone && (
            <div className="hd-tryfirst hd-tryfirst--done">
              <Sparkles />
              <p>
                {fixDone.outcome === 'success' ? 'Nova fixed it — you can close this, or still send the ticket if something’s off.' : 'Nova only partly fixed it — send the ticket and IT will take it from here.'}
              </p>
              {fixDone.outcome === 'success' && (
                <button type="button" className="neo-btn neo-btn--success neo-btn--sm" onClick={onClose}>
                  <Check /> It’s fixed
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="hd-review">
          <dl className="neo-kv">
            <dt>Category</dt>
            <dd>
              {CATEGORY_LABEL[cat]}{' '}
              <button type="button" className="hd-edit" onClick={() => setStep(0)}>
                Change
              </button>
            </dd>
            <dt>Device</dt>
            <dd>
              {devTag ? `${mine.find((d) => d.assetTag === devTag)?.model} · ${devTag}` : 'Not device-related'}{' '}
              <button type="button" className="hd-edit" onClick={() => setStep(1)}>
                Change
              </button>
            </dd>
            <dt>Subject</dt>
            <dd>
              <b>{subject}</b>
            </dd>
            <dt>Details</dt>
            <dd className="hd-review__desc">{description || <span className="neo-faint">No description</span>}</dd>
            {files.length > 0 && (
              <>
                <dt>Attachments</dt>
                <dd>
                  <span className="row" style={{ gap: 6 }}>
                    <Paperclip size={14} /> {files.length} file{files.length > 1 ? 's' : ''}
                  </span>
                </dd>
              </>
            )}
            <dt>Priority</dt>
            <dd>
              <span className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <PriorityPill priority={priority} full />
                <span className="neo-faint text-sm">
                  {IMPACTS.find((x) => x.id === impact)?.label} · {URGENCIES.find((x) => x.id === urgency)?.label} → {PRIORITY_LABEL[priority].toLowerCase()}
                </span>
              </span>
            </dd>
          </dl>
          <p className={cx('hd-review__sla')}>{slaPreview(priority)}. You’ll get updates in the bell and a message from the IT bot in Pulse Chat.</p>
        </div>
      )}
    </Modal>
  );
}
