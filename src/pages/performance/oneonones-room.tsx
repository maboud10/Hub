/**
 * 1:1s — the live meeting room panels: shared agenda (add · toggle · remove
 * with undo · drag / Alt+↑↓ reorder · Nova talking points), shared + private
 * notes with debounced autosave, and action items with owner + due date.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type DragEvent, type FormEvent, type KeyboardEvent } from 'react';
import { ArrowDown, ArrowUp, Check, ChevronDown, GripVertical, ListChecks, Lock, NotebookPen, Plus, Repeat, SquareCheckBig, Trash2, Users, X } from 'lucide-react';
import { Chip, NeoEmpty, NeoPanel } from '@/components/neo';
import { cx } from '@/lib/cx';
import { usePerf } from '@/performance/store';
import type { ActionItem, OneOnOneSeries, PerfResult } from '@/performance/types';
import { toast } from '@/store/toast';
import { report, shortDate, useUndo, withUndo, type PerfCtx } from './hooks';
import { DueChip, Face, NovaBox, Seg } from './ui';
import { partnerOf, SOURCE_META, toDateInput, useTalkingPoints } from './oneonones-shared';

const st = () => usePerf.getState();

/* ═════════════════════ Agenda ═════════════════════ */

export function AgendaPanel({ ctx, s, now }: { ctx: PerfCtx; s: OneOnOneSeries; now: number }) {
  const me = ctx.me.id;
  const partner = ctx.first(partnerOf(s, me));
  const [text, setText] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const refocus = useRef<{ id: string; sel: string } | null>(null);
  const open = s.agenda.filter((a) => !a.done).length;
  const covered = s.agenda.length - open;

  // Keep keyboard focus on the moved row after a reorder (React moves the DOM node).
  useLayoutEffect(() => {
    const f = refocus.current;
    if (!f) return;
    refocus.current = null;
    const row = listRef.current?.querySelector<HTMLElement>(`[data-ag="${CSS.escape(f.id)}"]`);
    const el = row?.querySelector<HTMLElement>(f.sel);
    (el && !(el as HTMLButtonElement).disabled ? el : row?.querySelector<HTMLElement>('.neo-check'))?.focus();
  }, [s.agenda]);

  const add = (e: FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (t.length < 2) return;
    if (report(st().addAgendaItem(s.id, t), '')) setText('');
  };
  const reorder = (ids: string[]) => report(st().reorderAgenda(s.id, ids), '');
  const move = (id: string, dir: -1 | 1, sel: string) => {
    const ids = s.agenda.map((a) => a.id);
    const i = ids.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    refocus.current = { id, sel };
    reorder(ids);
  };
  const drop = (to: number) => {
    const id = dragId;
    setDragId(null);
    setOverIdx(null);
    if (!id) return;
    const ids = s.agenda.map((a) => a.id);
    const from = ids.indexOf(id);
    if (from < 0 || from === to) return;
    ids.splice(from, 1);
    ids.splice(to, 0, id);
    reorder(ids);
  };
  const onRowKey = (e: KeyboardEvent, id: string) => {
    if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    move(id, e.key === 'ArrowUp' ? -1 : 1, '.neo-check');
  };

  return (
    <NeoPanel
      hud="Shared agenda"
      title="Talking points"
      icon={<ListChecks />}
      className="pf-11-agenda"
      actions={
        s.agenda.length ? (
          <Chip size="sm" tone={open ? 'app' : 'success'}>
            {open ? `${covered}/${s.agenda.length} covered` : 'All covered'}
          </Chip>
        ) : undefined
      }
    >
      {s.agenda.length ? (
        <ol ref={listRef} className="pf-11-agenda__list" aria-label="Agenda — drag or Alt+arrow keys to reorder">
          {s.agenda.map((a, i) => {
            const src = a.source ? SOURCE_META[a.source] : null;
            return (
              <li
                key={a.id}
                data-ag={a.id}
                data-qa="oo-agenda-item"
                className={cx('pf-11-ag', a.done && 'is-done', dragId === a.id && 'is-drag', overIdx === i && dragId && dragId !== a.id && 'is-over')}
                draggable
                onDragStart={(e: DragEvent) => {
                  setDragId(a.id);
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', a.text);
                }}
                onDragOver={(e) => {
                  if (!dragId) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (overIdx !== i) setOverIdx(i);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  drop(i);
                }}
                onDragEnd={() => {
                  setDragId(null);
                  setOverIdx(null);
                }}
                onKeyDown={(e) => onRowKey(e, a.id)}
              >
                <span className="pf-11-ag__grip" aria-hidden="true" title="Drag to reorder">
                  <GripVertical />
                </span>
                <input
                  type="checkbox"
                  className="neo-check"
                  checked={a.done}
                  onChange={() => report(st().toggleAgendaItem(s.id, a.id), '')}
                  aria-label={a.done ? `Reopen “${a.text}”` : `Mark “${a.text}” as covered`}
                />
                <span className="pf-11-ag__body">
                  <span className="pf-11-ag__text">{a.text}</span>
                  <span className="pf-11-meta">
                    <Face ctx={ctx} id={a.byId} size={16} />
                    {a.byId === me ? 'You' : ctx.first(a.byId)}
                    {src && (
                      <Chip size="sm" tone={src.tone} icon={src.icon}>
                        {src.label}
                      </Chip>
                    )}
                    {a.carried ? (
                      <Chip size="sm" tone="warning" icon={<Repeat />} title={`Carried over from ${a.carried} earlier meeting${a.carried === 1 ? '' : 's'}`}>
                        Carried ×{a.carried}
                      </Chip>
                    ) : null}
                  </span>
                </span>
                <span className="pf-11-tools">
                  <button type="button" className="neo-iconbtn neo-iconbtn--sm pf-11-up" aria-label={`Move “${a.text}” up`} disabled={i === 0} onClick={() => move(a.id, -1, '.pf-11-up')}>
                    <ArrowUp />
                  </button>
                  <button type="button" className="neo-iconbtn neo-iconbtn--sm pf-11-down" aria-label={`Move “${a.text}” down`} disabled={i === s.agenda.length - 1} onClick={() => move(a.id, 1, '.pf-11-down')}>
                    <ArrowDown />
                  </button>
                  <button type="button" className="neo-iconbtn neo-iconbtn--sm" aria-label={`Remove “${a.text}”`} onClick={() => withUndo(st().removeAgendaItem(s.id, a.id))}>
                    <Trash2 />
                  </button>
                </span>
              </li>
            );
          })}
        </ol>
      ) : (
        <NeoEmpty compact icon={<ListChecks />} title="No talking points yet">
          Add what’s on your mind — {partner} sees the agenda too.
        </NeoEmpty>
      )}

      <form className="pf-11-add" onSubmit={add}>
        <input
          className="neo-input"
          value={text}
          maxLength={200}
          onChange={(e) => setText(e.target.value)}
          placeholder={s.agenda.length >= 20 ? 'Agenda is full — cover some items first' : 'Add a talking point…'}
          disabled={s.agenda.length >= 20}
          aria-label="New talking point"
          data-qa="oo-agenda-input"
        />
        <button type="submit" className="neo-btn neo-btn--soft" disabled={text.trim().length < 2}>
          <Plus /> <span className="neo-btn__label">Add</span>
        </button>
      </form>

      <NovaTopics key={s.id} ctx={ctx} s={s} now={now} />
    </NeoPanel>
  );
}

function NovaTopics({ ctx, s, now }: { ctx: PerfCtx; s: OneOnOneSeries; now: number }) {
  const topics = useTalkingPoints(ctx, s, now);
  const [hidden, setHidden] = useState<string[]>([]);
  const list = topics.filter((t) => !hidden.includes(t.id)).slice(0, 4);
  const room = 20 - s.agenda.length;
  const add = (t: (typeof list)[number]) => report(st().addAgendaItem(s.id, t.text, t.source), '');
  const addAll = () => {
    let n = 0;
    for (const t of list.slice(0, Math.max(0, room))) if (st().addAgendaItem(s.id, t.text, t.source).ok) n++;
    if (n) toast.success(`Added ${n} talking point${n === 1 ? '' : 's'}`);
  };
  return (
    <NovaBox
      className="pf-11-nova"
      title="Nova suggests"
      hud={list.length ? 'From OKRs · feedback · reviews' : undefined}
      actions={
        list.length > 1 ? (
          <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs" onClick={addAll} disabled={room <= 0}>
            <Plus /> Add all
          </button>
        ) : undefined
      }
    >
      {list.length ? (
        <ul className="pf-11-topics neo-stagger">
          {list.map((t, i) => {
            const src = SOURCE_META[t.source];
            return (
              <li key={t.id} className="pf-11-topic" style={{ ['--i' as string]: i }}>
                <span className="pf-11-topic__icon" data-tone={src.tone} title={src.label}>
                  {src.icon}
                </span>
                <span className="pf-11-topic__text">
                  <b>{t.text}</b>
                  <small>{t.reason}</small>
                </span>
                <button type="button" className="neo-btn neo-btn--soft neo-btn--xs" onClick={() => add(t)} disabled={room <= 0} aria-label={`Add “${t.text}” to the agenda`}>
                  <Plus /> Add
                </button>
                <button type="button" className="neo-iconbtn neo-iconbtn--sm" aria-label={`Dismiss “${t.text}”`} onClick={() => setHidden((h) => [...h, t.id])}>
                  <X />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="pf-11-nova__quiet">Nothing pressing from OKRs, feedback or reviews — a good moment for career and wellbeing topics.</p>
      )}
    </NovaBox>
  );
}

/* ═════════════════════ Notes ═════════════════════ */

export function NotesPanel({ ctx, s }: { ctx: PerfCtx; s: OneOnOneSeries }) {
  const me = ctx.me.id;
  const partner = ctx.first(partnerOf(s, me));
  const [tab, setTab] = useState<'shared' | 'private'>('shared');
  return (
    <NeoPanel
      hud="Live notes"
      title="Notes"
      icon={<NotebookPen />}
      className="pf-11-notes"
      actions={
        <span className="pf-11-tabseg">
          <Seg
            size="sm"
            value={tab}
            onChange={setTab}
            label="Which notes"
            options={[
              { value: 'shared', label: (
                  <>
                    <Users aria-hidden="true" /> Shared
                  </>
                ), title: `Shared with ${partner}` },
              { value: 'private', label: (
                  <>
                    <Lock aria-hidden="true" /> Private
                  </>
                ), title: 'Only you' },
            ]}
          />
        </span>
      }
    >
      <NoteEditor
        key={`sh:${s.id}`}
        hidden={tab !== 'shared'}
        value={s.sharedNotes}
        onSave={(t) => st().saveSharedNotes(s.id, t)}
        label={`Shared notes with ${partner}`}
        placeholder={`Decisions, context, what you agreed… ${partner} sees these live. They move to the timeline when the meeting is completed.`}
        hint={`Visible to you and ${partner}`}
      />
      <NoteEditor
        key={`pv:${s.id}`}
        hidden={tab !== 'private'}
        privateMode
        value={s.privateNotes[me] ?? ''}
        onSave={(t) => st().savePrivateNotes(s.id, t)}
        label="Private notes"
        placeholder="Prep, reminders, things to bring up… only you will ever see these."
        hint="Only you — never shared, not even after the meeting"
      />
    </NeoPanel>
  );
}

function NoteEditor({ value, onSave, label, placeholder, hint, privateMode, hidden }: { value: string; onSave: (t: string) => PerfResult; label: string; placeholder: string; hint: string; privateMode?: boolean; hidden?: boolean }) {
  const [text, setText] = useState(value);
  const [state, setState] = useState<'idle' | 'dirty' | 'saved'>('idle');
  const timer = useRef<number | undefined>(undefined);
  const pending = useRef<string | null>(null);
  const lastSaved = useRef(value);
  const saveRef = useRef(onSave);
  saveRef.current = onSave;

  // Outside changes (completing the meeting clears shared notes) — only when we have nothing pending.
  useEffect(() => {
    if (pending.current === null && value !== lastSaved.current) {
      lastSaved.current = value;
      setText(value);
    }
  }, [value]);

  const flush = useCallback(() => {
    window.clearTimeout(timer.current);
    const t = pending.current;
    if (t === null) return;
    pending.current = null;
    const res = saveRef.current(t);
    if (res.ok) {
      lastSaved.current = t.slice(0, 8000);
      setState('saved');
    } else {
      toast.error(res.error);
      setState('idle');
    }
  }, []);
  useEffect(() => () => flush(), [flush]);

  const change = (t: string) => {
    setText(t);
    pending.current = t;
    setState('dirty');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, 700);
  };

  return (
    <div className={cx('pf-11-note', privateMode && 'is-private')} hidden={hidden}>
      <textarea className="neo-textarea pf-11-note__area" value={text} onChange={(e) => change(e.target.value)} onBlur={flush} placeholder={placeholder} aria-label={label} maxLength={8000} rows={8} data-qa={privateMode ? 'oo-private-notes' : 'oo-shared-notes'} />
      <div className="pf-11-note__foot">
        <span className="pf-11-note__hint">
          {privateMode ? <Lock aria-hidden="true" /> : <Users aria-hidden="true" />}
          {hint}
        </span>
        <span className="pf-11-save" data-state={state} aria-live="polite">
          {state === 'dirty' ? (
            'Saving…'
          ) : state === 'saved' ? (
            <>
              <Check aria-hidden="true" /> Saved
            </>
          ) : text ? (
            'Autosave on'
          ) : (
            ''
          )}
        </span>
      </div>
    </div>
  );
}

/* ═════════════════════ Action items ═════════════════════ */

export function ActionsPanel({ ctx, s, now }: { ctx: PerfCtx; s: OneOnOneSeries; now: number }) {
  const me = ctx.me.id;
  const pid = partnerOf(s, me);
  const [text, setText] = useState('');
  const [owner, setOwner] = useState(me);
  const [due, setDue] = useState('');
  const [showDone, setShowDone] = useState(false);
  const open = s.actionItems.filter((a) => !a.done).sort((a, b) => (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity) || a.createdAt - b.createdAt);
  const done = s.actionItems.filter((a) => a.done).sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0));
  const overdue = open.filter((a) => a.dueAt && a.dueAt < now).length;

  useEffect(() => setOwner(me), [s.id, me]);

  const add = (e: FormEvent) => {
    e.preventDefault();
    const d = due ? new Date(`${due}T23:59:59`).getTime() : undefined;
    if (report(st().addActionItem(s.id, { text, ownerId: owner, dueAt: d && Number.isFinite(d) ? d : undefined }), owner === me ? 'Action item added' : `Action item added for ${ctx.first(owner)}`)) {
      setText('');
      setDue('');
    }
  };
  const toggle = (a: ActionItem) => {
    if (report(st().toggleActionItem(s.id, a.id), '') && !a.done) toast.success('Done — nice follow-through');
  };
  const remove = (a: ActionItem) => {
    const r = st().removeActionItem(s.id, a.id);
    if (!r.ok) return toast.error(r.error);
    useUndo.getState().show('Action item removed', (): PerfResult => {
      const back = st().addActionItem(s.id, { text: a.text, ownerId: a.ownerId, dueAt: a.dueAt });
      if (!back.ok) return back;
      if (a.done) st().toggleActionItem(s.id, back.id);
      return { ok: true, message: 'Action item restored' };
    });
  };

  const row = (a: ActionItem) => (
    <li key={a.id} className={cx('pf-11-act', a.done && 'is-done', !a.done && a.dueAt && a.dueAt < now && 'is-overdue')} data-qa="oo-action">
      <input type="checkbox" className="neo-check" checked={a.done} onChange={() => toggle(a)} aria-label={a.done ? `Reopen “${a.text}”` : `Complete “${a.text}”`} />
      <span className="pf-11-act__body">
        <span className="pf-11-act__text">{a.text}</span>
        <span className="pf-11-meta">
          <Face ctx={ctx} id={a.ownerId} size={16} />
          {a.ownerId === me ? 'You' : ctx.first(a.ownerId)}
          {!a.done && a.dueAt && <DueChip at={a.dueAt} now={now} />}
          {a.done && a.doneAt && <span>Done {shortDate(a.doneAt)}</span>}
        </span>
      </span>
      <span className="pf-11-tools">
        <button type="button" className="neo-iconbtn neo-iconbtn--sm" aria-label={`Remove “${a.text}”`} onClick={() => remove(a)}>
          <Trash2 />
        </button>
      </span>
    </li>
  );

  return (
    <NeoPanel
      hud="Commitments"
      title="Action items"
      icon={<SquareCheckBig />}
      className="pf-11-actions"
      actions={
        open.length ? (
          <Chip size="sm" tone={overdue ? 'danger' : 'app'}>
            {overdue ? `${overdue} overdue` : `${open.length} open`}
          </Chip>
        ) : undefined
      }
    >
      {open.length ? (
        <ul className="pf-11-acts">{open.map(row)}</ul>
      ) : (
        <NeoEmpty compact icon={<SquareCheckBig />} title={done.length ? 'All caught up' : 'No action items yet'}>
          {done.length ? 'Every commitment from this 1:1 is done.' : 'Capture who does what by when — it keeps 1:1s moving.'}
        </NeoEmpty>
      )}
      {done.length > 0 && (
        <>
          <button type="button" className="neo-btn neo-btn--ghost neo-btn--xs pf-11-done-toggle" aria-expanded={showDone} onClick={() => setShowDone((v) => !v)}>
            <ChevronDown style={{ rotate: showDone ? '180deg' : undefined }} /> {done.length} done
          </button>
          {showDone && <ul className="pf-11-acts">{done.map(row)}</ul>}
        </>
      )}

      <form className="pf-11-actadd" onSubmit={add}>
        <input className="neo-input neo-input--sm" value={text} maxLength={200} onChange={(e) => setText(e.target.value)} placeholder="New action item…" aria-label="New action item" data-qa="oo-action-input" />
        <div className="pf-11-actadd__row">
          <Seg
            size="sm"
            value={owner}
            onChange={setOwner}
            label="Owner"
            options={[
              { value: me, label: 'Me' },
              { value: pid, label: ctx.first(pid) },
            ]}
          />
          <input type="date" className="neo-input neo-input--sm" value={due} min={toDateInput(now)} onChange={(e) => setDue(e.target.value)} aria-label="Due date (optional)" title="Due date (optional)" />
          <button type="submit" className="neo-btn neo-btn--soft neo-btn--sm" disabled={text.trim().length < 3}>
            <Plus /> Add
          </button>
        </div>
      </form>
    </NeoPanel>
  );
}
