/**
 * Helix Mail — docked glass composer + undo-send bar.
 *
 * Recipient chips with hub autocomplete, presence and recipients' local time
 * ("after hours there"); Draft with Nova (tone slider, Arabic); `;` snippets;
 * Helix Drive attachments with sensitivity labels; DLP guard with protected
 * links; Internal / Confidential / Encrypted; schedule presets that respect
 * the viewer's Wellbeing quiet hours; a 5-second undo window; autosave.
 */
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import {
  Check,
  ChevronDown,
  Globe2,
  Link2,
  Lock,
  Maximize2,
  Minimize2,
  Moon,
  Paperclip,
  PenSquare,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Sunrise,
  Trash2,
  Undo2,
  Wand2,
  X,
  Languages,
  CalendarClock,
} from 'lucide-react';
import { NeoPopover, NeoSearch, NeoSkeleton, Ring } from '@/components/neo';
import { useNow } from '@/hooks/useNow';
import { loadBridge, type BridgeFile } from '@/lib/appBridge';
import { AR_PERSON_NAMES, useI18n } from '@/lib/i18n';
import { toast } from '@/store/toast';
import {
  DEFAULT_QUIET,
  SNIPPETS,
  UNDO_MS,
  attachmentKindOf,
  dlpCheck,
  formatHM,
  isAfterHoursThere,
  isExternalRecipient,
  isQuietAt,
  isValidEmail,
  nextQuietEnd,
  novaDraft,
  schedulePresets,
  translatePhrases,
  undoRemaining,
  type QuietWindow,
} from '@/mail/engine';
import { useMail } from '@/mail/store';
import type { DraftSensitivity, MailAttachment, MailDraft, NovaTone, ScheduleReason, Sensitivity } from '@/mail/types';
import { AttachmentChip, ContactAvatar, KindIcon, SensitivityChip, firstOf, useFmt, useMailCtx, useMailKeys, type MailCtx } from './parts';
import { useMailUi } from './ui';

const TONES: NovaTone[] = ['concise', 'friendly', 'formal'];
const TONE_LABEL: Record<NovaTone, string> = { concise: 'Concise', friendly: 'Friendly', formal: 'Formal' };
const SENS: { id: DraftSensitivity; label: string; icon: JSX_Icon }[] = [
  { id: 'internal', label: 'Internal', icon: 'shield' },
  { id: 'confidential', label: 'Confidential', icon: 'lock' },
  { id: 'encrypted', label: 'Encrypted', icon: 'key' },
];
type JSX_Icon = 'shield' | 'lock' | 'key';
const MODE_TITLE: Record<MailDraft['mode'], string> = { new: 'New message', reply: 'Reply', replyAll: 'Reply all', forward: 'Forward' };
const SENSITIVITIES: Sensitivity[] = ['public', 'internal', 'confidential', 'restricted'];

/* ==========================================================================
   Dock
   ========================================================================== */

export function ComposerDock() {
  const dock = useMailUi((s) => s.dock);
  const active = useMailUi((s) => s.active);
  const expanded = useMailUi((s) => s.expanded);
  const drafts = useMail((s) => s.drafts);
  const live = dock.filter((id) => drafts.some((d) => d.id === id));
  const stale = dock.filter((id) => !live.includes(id)).join(',');

  // Sent / scheduled drafts leave the dock.
  useEffect(() => {
    if (!stale) return;
    stale.split(',').forEach((id) => useMailUi.getState().closeDraft(id));
  }, [stale]);

  const activeDraft = drafts.find((d) => d.id === active);
  if (!live.length) return null;
  return (
    <div className="ml-dock" data-expanded={(expanded && !!activeDraft) || undefined}>
      {live
        .filter((id) => id !== active)
        .map((id) => {
          const d = drafts.find((x) => x.id === id)!;
          return (
            <div key={id} className="ml-dock__chip neo-plane">
              <button type="button" className="ml-dock__open" onClick={() => useMailUi.getState().openDraft(id)}>
                <PenSquare aria-hidden="true" />
                {d.subject ? (
                  <span className="truncate" data-no-i18n>
                    {d.subject}
                  </span>
                ) : (
                  <span className="truncate">{MODE_TITLE[d.mode]}</span>
                )}
              </button>
              <button type="button" className="neo-iconbtn neo-iconbtn--sm" onClick={() => useMailUi.getState().closeDraft(id)} aria-label="Close draft">
                <X />
              </button>
            </div>
          );
        })}
      {activeDraft && <ComposerPanel key={activeDraft.id} draft={activeDraft} expanded={expanded} />}
    </div>
  );
}

/* ==========================================================================
   Composer panel
   ========================================================================== */

function ComposerPanel({ draft, expanded }: { draft: MailDraft; expanded: boolean }) {
  const ctx = useMailCtx();
  const fmt = useFmt();
  const locale = useI18n((s) => s.locale);
  const prefs = useMail((s) => s.prefs);
  const now = useNow(30_000);
  const { updateDraft, discardDraft, scheduleDraft } = useMail.getState();

  const [to, setTo] = useState(draft.to);
  const [cc, setCc] = useState(draft.cc);
  const [showCc, setShowCc] = useState(draft.cc.length > 0);
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const [attachments, setAttachments] = useState<MailAttachment[]>(draft.attachments);
  const [sensitivity, setSensitivity] = useState<DraftSensitivity>(draft.sensitivity);
  const [saved, setSaved] = useState(false);
  const [novaOpen, setNovaOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [tone, setTone] = useState<NovaTone>('friendly');
  const [nova, setNova] = useState<{ en: string; ar: string } | null>(null);
  const [phraseHits, setPhraseHits] = useState<number | null>(null);
  const [quiet, setQuiet] = useState<QuietWindow>(DEFAULT_QUIET);
  const [schedAnchor, setSchedAnchor] = useState<HTMLElement | null>(null);
  const [custom, setCustom] = useState('');
  const [driveAnchor, setDriveAnchor] = useState<HTMLElement | null>(null);
  const [driveQ, setDriveQ] = useState('');
  const [files, setFiles] = useState<BridgeFile[] | null>(null);
  const [snip, setSnip] = useState<{ q: string; start: number; index: number } | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const first = useRef(true);

  // Autosave (debounced) — drafts persist in the Mail store.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setSaved(false);
    const id = window.setTimeout(() => {
      updateDraft(draft.id, { to, cc, subject, body, attachments, sensitivity });
      setSaved(true);
    }, 450);
    return () => window.clearTimeout(id);
  }, [to, cc, subject, body, attachments, sensitivity, draft.id, updateDraft]);
  const flush = () => updateDraft(draft.id, { to, cc, subject, body, attachments, sensitivity });

  // The viewer's right-to-disconnect window from Wellbeing.
  useEffect(() => {
    if (!ctx.viewer) return;
    let alive = true;
    loadBridge('wellbeing')
      .then((b) => alive && setQuiet(b.quietHours(ctx.viewer!)))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [ctx.viewer]);

  // Drive search
  useEffect(() => {
    if (!driveAnchor || !ctx.viewer) return;
    let alive = true;
    const id = window.setTimeout(() => {
      loadBridge('drive')
        .then((b) => alive && setFiles(b.searchFiles(ctx.viewer!, driveQ, 8)))
        .catch(() => alive && setFiles([]));
    }, 140);
    return () => {
      alive = false;
      window.clearTimeout(id);
    };
  }, [driveAnchor, driveQ, ctx.viewer]);

  const isExt = (k: string) => isExternalRecipient(k, ctx.contactMap);
  const dlp = dlpCheck({ to, cc, attachments, sensitivity }, isExt);
  const recipients = [...to, ...cc];
  const tzs = recipients.map((k) => ctx.resolve(k).timezone);
  const presets = schedulePresets(now, quiet, tzs);
  const inQuiet = isQuietAt(now, quiet);
  const holdForQuiet = inQuiet && prefs.holdLateSends;
  const quietEnd = nextQuietEnd(now, quiet);
  const afterThere = recipients.map((k) => ctx.resolve(k)).filter((c) => c.timezone && isAfterHoursThere(c.timezone, now));

  const close = () => {
    flush();
    useMailUi.getState().closeDraft(draft.id);
  };
  const discard = () => {
    discardDraft(draft.id);
    useMailUi.getState().closeDraft(draft.id);
    toast.info('Draft discarded');
  };
  const schedule = (at: number, reason: ScheduleReason) => {
    flush();
    const r = scheduleDraft(draft.id, at, reason);
    setSchedAnchor(null);
    if (!r.ok) {
      toast.error('Couldn’t schedule', r.error);
      return;
    }
    useMailUi.getState().closeDraft(draft.id);
    toast.success('Scheduled', fmt.full(at));
  };
  const send = (force = false) => {
    if (holdForQuiet && !force) {
      schedule(quietEnd, 'quiet-hours');
      return;
    }
    flush();
    setSchedAnchor(null);
    const r = useMail.getState().queueSend(draft.id);
    if (!r.ok) {
      toast.error('Not sent', r.error);
      return;
    }
    useMailUi.getState().closeDraft(draft.id);
  };

  const runNova = () => {
    const res = novaDraft({
      prompt: prompt.trim() || subject || 'quick update',
      tone,
      toFirstNames: to.map((k) => firstOf(ctx.resolve(k).name)),
      meFirst: firstOf(ctx.me?.name ?? ''),
      subject: subject || undefined,
      arNames: (n) => AR_PERSON_NAMES[n] ?? n,
    });
    setBody(locale === 'ar' ? res.ar : res.en);
    if (!subject) setSubject(res.subject);
    setNova({ en: res.en, ar: res.ar });
    setPhraseHits(null);
  };
  const translate = () => {
    if (nova) {
      setBody(body === nova.ar ? nova.en : nova.ar);
      return;
    }
    const r = translatePhrases(body);
    setBody(r.text);
    setPhraseHits(r.hits);
  };

  const protect = () => {
    const ids = new Set(dlp.issues.filter((i) => i.level === 'block' && i.attachmentId).map((i) => i.attachmentId));
    setAttachments((a) => a.map((x) => (ids.has(x.id) ? { ...x, protectedLink: true } : x)));
    toast.success('Protected link enabled', 'Recipients verify their email · expires in 7 days');
  };

  const attach = (f: BridgeFile) => {
    if (attachments.some((a) => a.driveId === f.id)) return;
    const sensitivityOf = (SENSITIVITIES.includes(f.sensitivity as Sensitivity) ? f.sensitivity : 'internal') as Sensitivity;
    setAttachments((a) => [
      ...a,
      { id: `drv-${f.id}`, name: f.name, kind: attachmentKindOf(f.kind), sizeKb: Math.max(12, Math.round((f.size ?? 240_000) / 1024)), sensitivity: sensitivityOf, driveId: f.id, driveTo: f.to },
    ]);
    setDriveAnchor(null);
  };

  // `;` snippets
  const snippetList = snip ? SNIPPETS.filter((s) => s.id.startsWith(snip.q) || s.title.toLowerCase().includes(snip.q)) : [];
  const onBodyChange = (value: string, caret: number) => {
    setBody(value);
    const m = /(^|\s);([a-z]*)$/i.exec(value.slice(0, caret));
    setSnip(m ? { q: m[2].toLowerCase(), start: caret - m[2].length - 1, index: 0 } : null);
  };
  const insertSnippet = (text: string) => {
    if (!snip) return;
    const el = bodyRef.current;
    const caret = el?.selectionStart ?? body.length;
    const next = body.slice(0, snip.start) + text + body.slice(caret);
    const pos = snip.start + text.length;
    setBody(next);
    setSnip(null);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  };
  const onBodyKey = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      send();
      return;
    }
    if (!snip || !snippetList.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const d = e.key === 'ArrowDown' ? 1 : -1;
      setSnip({ ...snip, index: (snip.index + d + snippetList.length) % snippetList.length });
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      insertSnippet((locale === 'ar' ? snippetList[snip.index]?.bodyAr : snippetList[snip.index]?.body) ?? '');
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setSnip(null);
    }
  };

  const blockingNames = dlp.issues.filter((i) => i.level === 'block').map((i) => i.name).filter(Boolean).join(', ');
  const warn = dlp.level === 'warn' ? dlp.issues[0] : null;

  return (
    <section
      className="ml-comp neo-plane"
      data-expanded={expanded || undefined}
      role="dialog"
      aria-label={MODE_TITLE[draft.mode]}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !snip) {
          e.stopPropagation();
          close();
        }
      }}
    >
      <header className="ml-comp__head">
        <span className="ml-comp__glyph" aria-hidden="true">
          <PenSquare />
        </span>
        <span className="ml-comp__title">
          <span>{MODE_TITLE[draft.mode]}</span>
          {subject && (
            <span className="ml-comp__subj" data-no-i18n>
              {subject}
            </span>
          )}
        </span>
        <button type="button" className="neo-iconbtn neo-iconbtn--sm" onClick={() => useMailUi.getState().minimize()} aria-label="Minimise composer">
          <Minimize2 />
        </button>
        <button type="button" className="neo-iconbtn neo-iconbtn--sm ml-comp__expand" onClick={() => useMailUi.getState().setExpanded(!expanded)} aria-label={expanded ? 'Dock composer' : 'Expand composer'}>
          <Maximize2 />
        </button>
        <button type="button" className="neo-iconbtn neo-iconbtn--sm" onClick={close} aria-label="Close and save draft">
          <X />
        </button>
      </header>

      <div className="ml-comp__fields">
        <RecipientField label="To" ariaLabel="To recipients" value={to} onChange={setTo} ctx={ctx} now={now} autoFocus={!to.length} />
        {showCc ? (
          <RecipientField label="Cc" ariaLabel="Cc recipients" value={cc} onChange={setCc} ctx={ctx} now={now} />
        ) : (
          <button type="button" className="ml-comp__cc" onClick={() => setShowCc(true)}>
            <span>Add Cc</span>
          </button>
        )}
        {afterThere.length > 0 && (
          <p className="ml-comp__hint">
            <Moon aria-hidden="true" />
            <b className="ml-comp__names">
              {afterThere.map((c, i) => (
                <span key={c.key}>
                  {i > 0 && (locale === 'ar' ? '، ' : ', ')}
                  <span>{firstOf(c.name)}</span>
                </span>
              ))}
            </b>{' '}
            <span>is after hours there</span>
            {presets.find((p) => p.id === 'online' && !p.active) && (
              <button type="button" className="ml-linkbtn" onClick={() => schedule(presets.find((p) => p.id === 'online')!.at, 'recipient-online')}>
                <span>Schedule for when they’re online</span>
              </button>
            )}
          </p>
        )}
        <input className="ml-comp__subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" aria-label="Subject" />
      </div>

      {novaOpen && (
        <div className="ml-novabar">
          <div className="ml-novabar__row">
            <Sparkles aria-hidden="true" />
            <input
              className="ml-novabar__input"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  runNova();
                }
              }}
              placeholder="Ask Nova to draft — e.g. follow up about the SOC 2 report"
              aria-label="Nova draft prompt"
            />
            <button type="button" className="neo-btn neo-btn--nova neo-btn--xs" onClick={runNova}>
              <Wand2 /> <span>Draft</span>
            </button>
          </div>
          <div className="ml-novabar__row">
            <label className="ml-tone">
              <span className="neo-hud">Tone</span>
              <input
                type="range"
                min={0}
                max={2}
                step={1}
                value={TONES.indexOf(tone)}
                onChange={(e) => setTone(TONES[Number(e.target.value)] ?? 'friendly')}
                aria-label="Tone"
                aria-valuetext={TONE_LABEL[tone]}
              />
              <span className="ml-tone__stops" aria-hidden="true">
                {TONES.map((t) => (
                  <span key={t} data-on={t === tone || undefined}>
                    {TONE_LABEL[t]}
                  </span>
                ))}
              </span>
            </label>
            <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={translate} disabled={!body.trim()}>
              <Languages /> <span>{nova && body === nova.ar ? 'Back to English' : 'Translate to Arabic'}</span>
            </button>
          </div>
          {phraseHits !== null && (
            <p className="ml-novabar__note" aria-live="polite">
              <span>Nova offline preview — phrase-level translation</span> <b>{fmt.num(phraseHits)}</b>
            </p>
          )}
        </div>
      )}

      <div className="ml-comp__bodywrap">
        <textarea
          ref={bodyRef}
          className="ml-comp__body"
          value={body}
          onChange={(e) => onBodyChange(e.target.value, e.target.selectionStart ?? e.target.value.length)}
          onKeyDown={onBodyKey}
          placeholder="Write your message — type ; for snippets"
          aria-label="Message body"
          dir="auto"
        />
        {snip && snippetList.length > 0 && (
          <ul className="ml-snips" role="listbox" aria-label="Snippets">
            {snippetList.map((s, i) => (
              <li
                key={s.id}
                role="option"
                aria-selected={i === snip.index}
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertSnippet(locale === 'ar' ? s.bodyAr : s.body);
                }}
              >
                <span className="neo-mono">;{s.id}</span>
                <span>{s.title}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {attachments.length > 0 && (
        <div className="ml-comp__atts">
          {attachments.map((a) => (
            <AttachmentChip key={a.id} a={a} onRemove={() => setAttachments((x) => x.filter((y) => y.id !== a.id))} />
          ))}
        </div>
      )}

      {dlp.level === 'block' && (
        <div className="ml-dlp" role="alert" data-level="block">
          <ShieldAlert aria-hidden="true" />
          <div className="ml-dlp__text">
            <b>Confidential file to an external recipient</b>
            <span>
              <span>Nova’s DLP guard is holding</span> <b data-no-i18n>{blockingNames}</b> <span>so it can’t leave Helix unprotected.</span>
            </span>
          </div>
          <button type="button" className="neo-btn neo-btn--soft neo-btn--xs" onClick={protect}>
            <Link2 /> <span>Share as protected link</span>
          </button>
        </div>
      )}
      {warn && (
        <div className="ml-dlp" role="status" data-level="warn">
          <ShieldCheck aria-hidden="true" />
          <span className="ml-dlp__text">
            {warn.code === 'external-internal' ? (
              <span>Internal files are leaving Helix — double-check before sending.</span>
            ) : warn.code === 'external-confidential-encrypted' ? (
              <span>Encrypted: external recipients open it in the secure Helix portal.</span>
            ) : (
              <span>Marked confidential — external recipients see a confidentiality banner.</span>
            )}
          </span>
        </div>
      )}
      {inQuiet && (
        <div className="ml-quiet" role="status">
          <Moon aria-hidden="true" />
          <span>
            <b>You’re in your quiet hours</b> <span className="neo-mono">{`${formatHM(quiet.startHour)}–${formatHM(quiet.endHour)}`}</span>{' '}
            {holdForQuiet ? <span>Nova will send this when they end, so nobody feels they must reply tonight.</span> : <span>Late messages create pressure to reply — consider scheduling.</span>}
          </span>
        </div>
      )}

      <footer className="ml-comp__foot">
        <div className="ml-send">
          <button type="button" className="neo-btn neo-btn--plasma neo-btn--sm" onClick={() => send()} disabled={dlp.level === 'block'} title="Send (⌘Enter)" data-qa="mail-send">
            {holdForQuiet ? (
              <>
                <Moon /> <span>Send at</span> <b>{fmt.time(quietEnd)}</b>
              </>
            ) : (
              <>
                <Send className="ml-flip" /> <span>Send</span>
              </>
            )}
          </button>
          <button type="button" className="neo-btn neo-btn--plasma neo-btn--sm neo-btn--icon" onClick={(e) => setSchedAnchor(e.currentTarget)} aria-label="Schedule send" aria-haspopup="menu" aria-expanded={!!schedAnchor} disabled={dlp.level === 'block'}>
            <ChevronDown />
          </button>
        </div>
        <div role="radiogroup" aria-label="Sensitivity" className="ml-sens">
          {SENS.map((s) => (
            <button key={s.id} type="button" role="radio" aria-checked={sensitivity === s.id} onClick={() => setSensitivity(s.id)} title={s.label}>
              {s.icon === 'shield' ? <ShieldCheck aria-hidden="true" /> : <Lock aria-hidden="true" />}
              <span>{s.label}</span>
            </button>
          ))}
        </div>
        <span className="grow" />
        <button type="button" className="neo-iconbtn" onClick={(e) => setDriveAnchor(e.currentTarget)} aria-label="Attach from Drive" title="Attach from Drive">
          <Paperclip />
        </button>
        <button type="button" className="neo-iconbtn" onClick={() => setNovaOpen((v) => !v)} aria-label="Draft with Nova" aria-pressed={novaOpen} title="Draft with Nova">
          <Sparkles />
        </button>
        <span className="ml-saved" aria-live="polite">
          {saved && (
            <>
              <Check aria-hidden="true" /> <span>Draft saved</span>
            </>
          )}
        </span>
        <button type="button" className="neo-iconbtn" onClick={discard} aria-label="Discard draft" title="Discard draft">
          <Trash2 />
        </button>
      </footer>

      <NeoPopover open={!!schedAnchor} anchor={schedAnchor} onClose={() => setSchedAnchor(null)} placement="top-start" width={300} label="Schedule send">
        <div role="menu" aria-label="Schedule send" className="ml-sched">
          <div className="neo-menu__label">Schedule send</div>
          {presets.map((p) => {
            if (p.id === 'quiet')
              return (
                <button key={p.id} type="button" role="menuitem" className="neo-menu__item" disabled={!p.active} onClick={() => schedule(p.at, 'quiet-hours')}>
                  <Moon />
                  <span className="grow ml-sched__text">
                    <span>Respect quiet hours</span>
                    <small>{p.active ? <span>Sends when your quiet hours end</span> : <span>You’re outside quiet hours</span>}</small>
                  </span>
                  {p.active && <span className="neo-menu__hint">{fmt.time(p.at)}</span>}
                </button>
              );
            if (p.id === 'online')
              return (
                <button key={p.id} type="button" role="menuitem" className="neo-menu__item" disabled={!recipients.length || !!p.active} onClick={() => schedule(p.at, 'recipient-online')}>
                  <Globe2 />
                  <span className="grow ml-sched__text">
                    <span>When they’re online</span>
                    <small>{!recipients.length ? <span>Add recipients first</span> : p.active ? <span>They’re online now</span> : <span>Their working hours</span>}</small>
                  </span>
                  {!p.active && recipients.length > 0 && <span className="neo-menu__hint">{fmt.dayTime(p.at)}</span>}
                </button>
              );
            return (
              <button key={p.id} type="button" role="menuitem" className="neo-menu__item" onClick={() => schedule(p.at, p.reason)}>
                {p.id === 'tomorrow' ? <Sunrise /> : <CalendarClock />}
                <span className="grow">{p.label}</span>
                <span className="neo-menu__hint">{fmt.dayTime(p.at)}</span>
              </button>
            );
          })}
          {holdForQuiet && (
            <button type="button" role="menuitem" className="neo-menu__item" onClick={() => send(true)}>
              <Send className="ml-flip" />
              <span className="grow">Send now anyway</span>
            </button>
          )}
          <div className="neo-menu__sep" role="separator" />
          <div className="ml-sched__custom">
            <input type="datetime-local" className="neo-input neo-input--sm" value={custom} onChange={(e) => setCustom(e.target.value)} aria-label="Custom send time" />
            <button type="button" className="neo-btn neo-btn--soft neo-btn--xs" disabled={!custom} onClick={() => schedule(new Date(custom).getTime(), 'manual')}>
              <span>Schedule</span>
            </button>
          </div>
        </div>
      </NeoPopover>

      <NeoPopover open={!!driveAnchor} anchor={driveAnchor} onClose={() => setDriveAnchor(null)} placement="top-end" width={340} label="Attach from Drive">
        <div className="ml-drive">
          <div className="neo-pop__search">
            <NeoSearch value={driveQ} onChange={setDriveQ} placeholder="Search Helix Drive…" size="sm" autoFocus />
          </div>
          <div role="menu" aria-label="Drive files">
            {files === null ? (
              <NeoSkeleton rows={3} />
            ) : files.length ? (
              files.map((f) => (
                <button key={f.id} type="button" role="menuitem" className="neo-menu__item" onClick={() => attach(f)}>
                  <KindIcon kind={attachmentKindOf(f.kind)} />
                  <span className="grow truncate" data-no-i18n>
                    {f.name}
                  </span>
                  <SensitivityChip s={(SENSITIVITIES.includes(f.sensitivity as Sensitivity) ? f.sensitivity : 'internal') as Sensitivity} />
                </button>
              ))
            ) : (
              <div className="neo-menu__label">No files match</div>
            )}
          </div>
        </div>
      </NeoPopover>
    </section>
  );
}

/* ==========================================================================
   Recipients
   ========================================================================== */

function RecipientField({
  label,
  ariaLabel,
  value,
  onChange,
  ctx,
  now,
  autoFocus,
}: {
  label: string;
  ariaLabel: string;
  value: string[];
  onChange: (v: string[]) => void;
  ctx: MailCtx;
  now: number;
  autoFocus?: boolean;
}) {
  const fmt = useFmt();
  const listId = useId();
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const [focused, setFocused] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus) input.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  const suggestions = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    const hub = ctx.users
      .filter((u) => u.active && u.id !== ctx.ownerId && !value.includes(u.id) && `${u.name} ${u.email} ${u.title} ${u.department}`.toLowerCase().includes(s))
      .slice(0, 6)
      .map((u) => u.id);
    const ext = ctx.contacts
      .filter(
        (c) =>
          ['customer', 'vendor', 'partner', 'person', 'internal'].includes(c.kind) &&
          !value.includes(c.id) &&
          (!c.screener || c.screener === 'allowed') &&
          `${c.name} ${c.email} ${c.org}`.toLowerCase().includes(s),
      )
      .slice(0, 4)
      .map((c) => c.id);
    return [...hub, ...ext];
  }, [q, ctx, value]);

  const add = (key: string) => {
    if (!value.includes(key)) onChange([...value, key]);
    setQ('');
    setHi(0);
  };
  const commit = () => {
    const s = q.trim().replace(/[,;]$/, '');
    if (!s) return false;
    if (suggestions[hi]) {
      add(suggestions[hi]);
      return true;
    }
    if (isValidEmail(s)) {
      add(s.toLowerCase());
      return true;
    }
    return false;
  };
  const onKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && suggestions.length) {
      e.preventDefault();
      setHi((h) => (h + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp' && suggestions.length) {
      e.preventDefault();
      setHi((h) => (h - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Enter' || e.key === ',' || e.key === ';' || (e.key === 'Tab' && q.trim())) {
      if (commit()) e.preventDefault();
    } else if (e.key === 'Backspace' && !q && value.length) {
      onChange(value.slice(0, -1));
    }
  };
  const open = focused && suggestions.length > 0;

  return (
    <div className="ml-rcpt" onClick={() => input.current?.focus()}>
      <span className="ml-rcpt__label">{label}</span>
      <div className="ml-rcpt__chips">
        {value.map((k) => {
          const c = ctx.resolve(k);
          const after = c.timezone ? isAfterHoursThere(c.timezone, now) : false;
          return (
            <span key={k} className="ml-chip" data-external={c.external || undefined} data-after={after || undefined} title={c.email}>
              <ContactAvatar c={c} size={20} presence />
              <span className="ml-chip__name">{c.name}</span>
              {c.timezone && (
                <span className="ml-chip__tz" title="Their local time">
                  {after && <Moon aria-label="After hours there" />}
                  {fmt.timeIn(now, c.timezone)}
                </span>
              )}
              {c.external && <span className="ml-chip__ext">External</span>}
              <button
                type="button"
                className="ml-chip__x"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(value.filter((x) => x !== k));
                }}
                aria-label="Remove recipient"
              >
                <X />
              </button>
            </span>
          );
        })}
        <input
          ref={input}
          className="ml-rcpt__input"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setHi(0);
          }}
          onKeyDown={onKey}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            commit();
          }}
          placeholder={value.length ? '' : 'Name or email'}
          aria-label={ariaLabel}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open ? `${listId}-${hi}` : undefined}
        />
      </div>
      {open && (
        <ul className="ml-rcpt__list" role="listbox" id={listId} aria-label="Suggestions">
          {suggestions.map((k, i) => {
            const c = ctx.resolve(k);
            return (
              <li
                key={k}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === hi}
                onMouseDown={(e) => {
                  e.preventDefault();
                  add(k);
                }}
              >
                <ContactAvatar c={c} size={26} presence />
                <span className="ml-rcpt__who">
                  <b>{c.name}</b>
                  <span data-no-i18n>{c.email}</span>
                </span>
                {c.timezone && <span className="ml-rcpt__tz">{fmt.timeIn(now, c.timezone)}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ==========================================================================
   Undo send
   ========================================================================== */

export function UndoBar() {
  const pending = useMail((s) => s.pending);
  const ctx = useMailCtx();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!pending) return;
    const tick = window.setInterval(() => setNow(Date.now()), 100);
    const commit = window.setTimeout(
      () => {
        const id = useMail.getState().commitSend();
        if (id) toast.success('Sent', pending.draft.subject || '(no subject)');
      },
      Math.max(0, pending.commitAt - Date.now()),
    );
    return () => {
      window.clearInterval(tick);
      window.clearTimeout(commit);
    };
  }, [pending]);

  const undo = () => {
    const id = useMail.getState().undoSend();
    if (id) {
      useMailUi.getState().openDraft(id);
      toast.info('Send cancelled', 'Back in your drafts');
    }
  };
  useMailKeys({ z: undo }, !!pending);

  if (!pending) return null;
  const left = undoRemaining(pending, now);
  const names = pending.draft.to.map((k) => firstOf(ctx.resolve(k).name)).join(', ');
  return (
    <div className="ml-undo neo-plane" role="status" aria-live="polite">
      <Ring value={left / UNDO_MS} size={36} stroke={4} label="Undo window">
        {Math.ceil(left / 1000)}
      </Ring>
      <div className="ml-undo__text">
        <b>Sending</b>
        {pending.draft.subject ? (
          <span className="ml-undo__subj" data-no-i18n>
            {pending.draft.subject}
          </span>
        ) : (
          <span className="ml-undo__subj">(no subject)</span>
        )}
        <span className="ml-undo__to">
          <span>to</span> {names}
        </span>
      </div>
      <button type="button" className="neo-btn neo-btn--soft neo-btn--sm" onClick={undo} title="Undo (Z)">
        <Undo2 /> <span>Undo</span>
      </button>
    </div>
  );
}
