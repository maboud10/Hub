/**
 * People pickers for hiring teams, interview panels and onboarding buddies.
 * Options come from the NEXUS directory (active users only).
 */
import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Search, X } from 'lucide-react';
import type { User } from '@/types';
import { useHub } from '@/store/hub';
import { Avatar } from '@/components/ui/primitives';
import { cx } from '@/lib/cx';

function useDirectory(filter?: (u: User) => boolean) {
  const users = useHub((s) => s.users);
  return useMemo(() => users.filter((u) => u.active && (!filter || filter(u))).sort((a, b) => a.name.localeCompare(b.name)), [users, filter]);
}

/** Native select grouped by department (great on phones). */
export function UserSelect({
  value,
  onChange,
  filter,
  placeholder = 'Select a person',
  allowEmpty = false,
  id,
  ariaLabel,
}: {
  value: string;
  onChange: (id: string) => void;
  /** Keep this stable (module-level or useCallback) to avoid re-filtering every render. */
  filter?: (u: User) => boolean;
  placeholder?: string;
  allowEmpty?: boolean;
  id?: string;
  ariaLabel?: string;
}) {
  const people = useDirectory(filter);
  const groups = useMemo(() => {
    const m = new Map<string, User[]>();
    for (const u of people) m.set(u.department, [...(m.get(u.department) ?? []), u]);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [people]);
  return (
    <select id={id} className="select" value={value} onChange={(e) => onChange(e.target.value)} aria-label={ariaLabel}>
      {(allowEmpty || !value) && <option value="">{placeholder}</option>}
      {groups.map(([dept, list]) => (
        <optgroup key={dept} label={dept}>
          {list.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name} · {u.title}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

/** Chip input with type-ahead search, keyboard friendly. */
export function UserMultiSelect({
  value,
  onChange,
  filter,
  placeholder = 'Add people…',
  max,
  ariaLabel = 'People',
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  filter?: (u: User) => boolean;
  placeholder?: string;
  max?: number;
  ariaLabel?: string;
}) {
  const people = useDirectory(filter);
  const byId = useMemo(() => new Map(people.map((u) => [u.id, u])), [people]);
  const allUsers = useHub((s) => s.users);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const options = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return people
      .filter((u) => !value.includes(u.id))
      .filter((u) => !needle || `${u.name} ${u.title} ${u.department}`.toLowerCase().includes(needle))
      .slice(0, 8);
  }, [people, q, value]);

  const full = max !== undefined && value.length >= max;
  const add = (id: string) => {
    if (full || value.includes(id)) return;
    onChange([...value, id]);
    setQ('');
    setHi(0);
    inputRef.current?.focus();
  };
  const remove = (id: string) => onChange(value.filter((v) => v !== id));

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setHi((h) => Math.min(options.length - 1, h + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHi((h) => Math.max(0, h - 1));
    } else if (e.key === 'Enter') {
      if (open && options[hi]) {
        e.preventDefault();
        add(options[hi].id);
      }
    } else if (e.key === 'Backspace' && !q && value.length) {
      remove(value[value.length - 1]);
    } else if (e.key === 'Escape' && open) {
      e.stopPropagation();
      setOpen(false);
    }
  };

  return (
    <div className={cx('user-multi', open && 'is-open')} onClick={() => inputRef.current?.focus()}>
      <div className="user-multi__chips">
        {value.map((id) => {
          const u = byId.get(id) ?? allUsers.find((x) => x.id === id);
          if (!u) return null;
          return (
            <span key={id} className="user-multi__chip" title={`${u.name} · ${u.title}`}>
              <Avatar user={u} size={20} />
              <span className="truncate">{u.name}</span>
              <button
                type="button"
                aria-label={`Remove ${u.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  remove(id);
                }}
              >
                <X />
              </button>
            </span>
          );
        })}
        {!full && (
          <span className="user-multi__search">
            <Search aria-hidden="true" />
            <input
              ref={inputRef}
              className="user-multi__input"
              value={q}
              placeholder={value.length ? '' : placeholder}
              aria-label={ariaLabel}
              role="combobox"
              aria-expanded={open}
              aria-controls={listId}
              aria-autocomplete="list"
              onChange={(e) => {
                setQ(e.target.value);
                setOpen(true);
                setHi(0);
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => window.setTimeout(() => setOpen(false), 120)}
              onKeyDown={onKey}
            />
          </span>
        )}
      </div>
      {open && !full && options.length > 0 && (
        <ul className="user-multi__menu" role="listbox" id={listId}>
          {options.map((u, i) => (
            <li key={u.id} role="option" aria-selected={i === hi}>
              <button
                type="button"
                className={cx('user-multi__opt', i === hi && 'is-hi')}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setHi(i)}
                onClick={() => add(u.id)}
              >
                <Avatar user={u} size={26} />
                <span className="grow">
                  <span className="user-multi__name truncate">{u.name}</span>
                  <span className="user-multi__meta truncate">
                    {u.title} · {u.department}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
