/**
 * Quick Capture — natural-language task entry with live token highlighting,
 * chips and inline autocomplete for @people, #projects, !priority and +tags.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { CalendarDays, Clock3, CornerDownLeft, Flag, Hash, Sparkles, Tag, UserRound, X } from 'lucide-react';
import { Avatar } from '@/components/ui/primitives';
import { useHub } from '@/store/hub';
import { toast } from '@/store/toast';
import { cx } from '@/lib/cx';
import { canEditProject } from '@/projects/access';
import { formatDue } from '@/projects/dates';
import { taskKey } from '@/projects/metrics';
import { PRIORITY_NAME, activeTrigger, applyTrigger, parseQuickAdd, type ActiveTrigger, type QuickToken } from '@/projects/nlp';
import { ProjectSigil } from '@/projects/sigils';
import { useProjects } from '@/projects/store';
import type { Priority, Task } from '@/projects/types';
import { useActor, useVisibleProjects, type QuickAddDefaults } from './ctx';
import { PriorityGlyph } from './ui';

const EXAMPLES = [
  'Review token PR tomorrow 3pm @priya #prism !high',
  'Draft Q1 capacity plan next friday #platform +planning',
  'Book venue walkthrough in 3 days #allhands p2',
  'Prep 1:1 notes today 4:30pm',
];

const TOKEN_ICON: Record<QuickToken['kind'], ReactNode> = {
  date: <CalendarDays />,
  time: <Clock3 />,
  assignee: <UserRound />,
  project: <Hash />,
  priority: <Flag />,
  tag: <Tag />,
};

interface Suggestion {
  key: string;
  label: string;
  sub?: string;
  icon: ReactNode;
  insert: string;
}

export function QuickCapture({
  variant = 'hero',
  defaults,
  autoFocus,
  onCreated,
}: {
  variant?: 'hero' | 'modal';
  defaults?: QuickAddDefaults;
  autoFocus?: boolean;
  onCreated?: (id: string, task: Task) => void;
}) {
  const actor = useActor();
  const users = useHub((s) => s.users);
  const projects = useVisibleProjects();
  const tasks = useProjects((s) => s.tasks);
  const createTask = useProjects((s) => s.createTask);
  const [text, setText] = useState(defaults?.text ?? '');
  const [caret, setCaret] = useState(0);
  const [focused, setFocused] = useState(false);
  const [sel, setSel] = useState(0);
  const [example, setExample] = useState(0);
  const [flash, setFlash] = useState<{ id: string; label: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const mirror = useRef<HTMLDivElement>(null);

  const writable = useMemo(() => (actor ? projects.filter((p) => canEditProject(p, actor)) : []), [projects, actor]);
  const active = useMemo(() => users.filter((u) => u.active), [users]);
  const parsed = useMemo(
    () => parseQuickAdd(text, { now: Date.now(), users: active, projects: writable, meId: actor?.id }),
    [text, active, writable, actor],
  );
  const projectId = parsed.projectId ?? (defaults?.projectId && writable.some((p) => p.id === defaults.projectId) ? defaults.projectId : undefined);
  const project = writable.find((p) => p.id === projectId);
  const dueDate = parsed.dueDate ?? defaults?.dueDate;

  // rotate the placeholder example while idle
  useEffect(() => {
    if (text || focused) return;
    const id = window.setInterval(() => setExample((i) => (i + 1) % EXAMPLES.length), 4200);
    return () => window.clearInterval(id);
  }, [text, focused]);

  useEffect(() => {
    if (autoFocus) requestAnimationFrame(() => input.current?.focus());
  }, [autoFocus]);

  const trigger: ActiveTrigger | null = focused ? activeTrigger(text, caret) : null;
  const suggestions: Suggestion[] = useMemo(() => {
    if (!trigger) return [];
    const q = trigger.query.toLowerCase();
    if (trigger.sigil === '@')
      return active
        .filter((u) => !q || u.name.toLowerCase().split(' ').some((w) => w.startsWith(q)) || u.name.toLowerCase().startsWith(q))
        .slice(0, 6)
        .map((u) => ({ key: u.id, label: u.name, sub: u.title, icon: <Avatar user={u} size={22} />, insert: `@${u.name.split(' ')[0]}` }));
    if (trigger.sigil === '#')
      return writable
        .filter((p) => !q || p.key.toLowerCase().startsWith(q) || p.name.toLowerCase().split(/\s+/).some((w) => w.startsWith(q)))
        .slice(0, 6)
        .map((p) => ({ key: p.id, label: p.name, sub: p.key, icon: <ProjectSigil icon={p.icon} color={p.color} size={18} />, insert: `#${p.key.toLowerCase()}` }));
    if (trigger.sigil === '!')
      return (['urgent', 'high', 'medium', 'low'] as Priority[])
        .filter((p) => !q || p.startsWith(q))
        .map((p) => ({ key: p, label: PRIORITY_NAME[p], icon: <PriorityGlyph priority={p} />, insert: `!${p}` }));
    const tags = [...new Set(tasks.flatMap((t) => t.tags))].filter((t) => !q || t.startsWith(q)).slice(0, 6);
    return tags.map((t) => ({ key: t, label: t, icon: <Tag />, insert: `+${t}` }));
  }, [trigger, active, writable, tasks]);
  const showSuggest = suggestions.length > 0;

  useEffect(() => setSel(0), [trigger?.sigil, trigger?.query]);

  const syncScroll = () => {
    if (mirror.current && input.current) mirror.current.scrollLeft = input.current.scrollLeft;
  };

  const apply = (s: Suggestion) => {
    if (!trigger) return;
    const r = applyTrigger(text, trigger, s.insert);
    setText(r.text);
    requestAnimationFrame(() => {
      input.current?.focus();
      input.current?.setSelectionRange(r.caret, r.caret);
      setCaret(r.caret);
      syncScroll();
    });
  };

  const submit = () => {
    if (!actor) return;
    const title = parsed.title.trim();
    if (!title) {
      toast.warning('Add a title', 'Type what needs doing — tokens like “tomorrow” or “@priya” are optional.');
      return;
    }
    const r = createTask({
      title,
      projectId: projectId ?? null,
      sectionId: projectId && projectId === defaults?.projectId ? (defaults?.sectionId ?? undefined) : undefined,
      assigneeId: parsed.assigneeId ?? actor.id,
      dueDate,
      dueTime: parsed.dueTime,
      priority: parsed.priority,
      tags: parsed.tags,
    });
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    const t = useProjects.getState().tasks.find((x) => x.id === r.taskId)!;
    const key = taskKey(project, t);
    setText('');
    setCaret(0);
    setFlash({ id: t.id, label: key });
    window.setTimeout(() => setFlash((f) => (f?.id === t.id ? null : f)), 4000);
    toast.success(`Captured ${key}`, [project?.name ?? 'My tasks', dueDate ? formatDue(dueDate, Date.now(), parsed.dueTime) : null].filter(Boolean).join(' · '));
    onCreated?.(t.id, t);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (showSuggest) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSel((i) => (i + 1) % suggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSel((i) => (i - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        apply(suggestions[sel]);
        return;
      }
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      if (text) setText('');
      else input.current?.blur();
    }
  };

  // mirror segments for in-place highlighting
  const segments = useMemo(() => {
    const out: { text: string; kind?: QuickToken['kind'] | 'bad' }[] = [];
    const marks = [
      ...parsed.tokens.map((t) => ({ start: t.start, end: t.end, kind: t.kind as QuickToken['kind'] | 'bad' })),
      ...parsed.unresolved.map((u) => ({ start: u.start, end: u.end, kind: 'bad' as const })),
    ].sort((a, b) => a.start - b.start);
    let i = 0;
    for (const m of marks) {
      if (m.start < i) continue;
      if (m.start > i) out.push({ text: text.slice(i, m.start) });
      out.push({ text: text.slice(m.start, m.end), kind: m.kind });
      i = m.end;
    }
    if (i < text.length) out.push({ text: text.slice(i) });
    return out;
  }, [parsed, text]);

  const me = actor ? active.find((u) => u.id === actor.id) : undefined;
  const assignee = parsed.assigneeId ? active.find((u) => u.id === parsed.assigneeId) : me;

  return (
    <div className={cx('pj-cap', `pj-cap--${variant}`, focused && 'is-focused', text && 'has-text')}>
      {variant === 'hero' && (
        <div className="pj-cap__head">
          <span className="neo-hud neo-hud--tint">
            <Sparkles /> Quick capture
          </span>
          <span className="pj-cap__hint neo-faint">
            <kbd className="kbd">@</kbd> person <kbd className="kbd">#</kbd> project <kbd className="kbd">!</kbd> priority <kbd className="kbd">+</kbd> tag
          </span>
        </div>
      )}
      <div className="pj-cap__field">
        <div className="pj-cap__mirror" ref={mirror} aria-hidden="true">
          {segments.map((s, i) =>
            s.kind ? (
              <mark key={i} data-k={s.kind}>
                {s.text}
              </mark>
            ) : (
              <span key={i}>{s.text}</span>
            ),
          )}
        </div>
        <input
          ref={input}
          className="pj-cap__input"
          value={text}
          data-capture={variant === 'hero' ? 'main' : 'modal'}
          data-qa="capture"
          data-autofocus={autoFocus ? true : undefined}
          placeholder={focused ? 'What needs doing?' : `Try “${EXAMPLES[example]}”`}
          aria-label="Capture a task"
          aria-autocomplete="list"
          aria-expanded={showSuggest}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => {
            setText(e.target.value);
            setCaret(e.target.selectionStart ?? e.target.value.length);
            requestAnimationFrame(syncScroll);
          }}
          onSelect={(e) => setCaret((e.target as HTMLInputElement).selectionStart ?? 0)}
          onKeyDown={onKey}
          onScroll={syncScroll}
          onFocus={() => setFocused(true)}
          onBlur={() => window.setTimeout(() => setFocused(false), 120)}
        />
        <button type="button" className="pj-cap__enter" onClick={submit} disabled={!parsed.title.trim()} aria-label="Add task" data-qa="capture-submit">
          <CornerDownLeft />
        </button>
        {showSuggest && (
          <div className="pj-cap__suggest neo-portal" role="listbox" aria-label="Suggestions">
            {suggestions.map((s, i) => (
              <button
                key={s.key}
                type="button"
                role="option"
                aria-selected={i === sel}
                className={cx('pj-cap__opt', i === sel && 'is-sel')}
                onMouseDown={(e) => {
                  e.preventDefault();
                  apply(s);
                }}
                onMouseEnter={() => setSel(i)}
              >
                {s.icon}
                <span className="grow truncate">{s.label}</span>
                {s.sub && <span className="neo-faint text-xs truncate">{s.sub}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
      {(text || variant === 'modal') && (
        <div className="pj-cap__chips" aria-live="polite">
          {parsed.tokens.map((t, i) => (
            <span key={`${t.kind}-${i}`} className="pj-tok" data-k={t.kind}>
              {t.kind === 'assignee' ? <Avatar user={active.find((u) => u.id === t.value) ?? { name: t.label, avatarHue: 260 }} size={16} /> : TOKEN_ICON[t.kind]}
              {t.label}
            </span>
          ))}
          {!parsed.projectId && project && (
            <span className="pj-tok pj-tok--ghost" data-k="project">
              <Hash /> {project.name}
            </span>
          )}
          {!parsed.assigneeId && assignee && (
            <span className="pj-tok pj-tok--ghost" data-k="assignee">
              <UserRound /> You
            </span>
          )}
          {parsed.unresolved.map((u, i) => (
            <span key={`u-${i}`} className="pj-tok pj-tok--bad">
              <X /> {u.kind === 'assignee' ? `No one named ${u.raw.slice(1)}` : `No project you can edit matches ${u.raw.slice(1)}`}
            </span>
          ))}
          {parsed.title && (
            <span className="pj-cap__preview neo-faint">
              → <strong>{parsed.title}</strong>
              {project ? ` in ${project.key}` : ' in My tasks'}
            </span>
          )}
        </div>
      )}
      {flash && !text && (
        <div className="pj-cap__flash" role="status">
          <span className="pj-cap__flash-dot" /> Added {flash.label}
        </div>
      )}
    </div>
  );
}
