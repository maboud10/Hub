/**
 * Live Knowledge Base search for the NEO header (`NeoHead` center slot).
 * Instant permission-scoped matches as you type; Enter opens the top hit (or
 * asks Nova Docs when nothing matches), ↑/↓ move through results, and outside
 * click / Esc close the dropdown.
 */
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { ArrowRight, Search, Sparkles, X } from 'lucide-react';
import { cx } from '@/lib/cx';
import { searchArticles, type SearchHit } from '@/wiki/cortex';
import { useVisibleArticles } from '@/wiki/selectors';
import { useWiki } from '@/wiki/store';
import { FreshnessPill, SpacePill } from './wikiUi';

const hitUrl = (hit: SearchHit) => `/wiki/doc/${hit.article.slug}${hit.matchedSectionId ? `#${hit.matchedSectionId}` : ''}`;

export function WikiSearch({ onAsk }: { onAsk: (query: string) => void }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const visibleArticles = useVisibleArticles();
  const spaces = useWiki((s) => s.spaces);

  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  /** -1 = nothing, 0 = "Ask Nova Docs", 1…n = hits. */
  const [active, setActive] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const hits = useMemo(() => {
    if (!query.trim()) return [];
    return searchArticles(query, visibleArticles).slice(0, 5);
  }, [query, visibleArticles]);
  const spaceMap = useMemo(() => new Map(spaces.map((s) => [s.id, s])), [spaces]);
  const showDropdown = focused && query.trim().length > 0;

  // Close live search dropdown on click outside or Escape
  useEffect(() => {
    if (!focused) return;
    const onPointerDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setFocused(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFocused(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [focused]);

  // A new page is a new context: fold the dropdown away.
  useEffect(() => {
    setFocused(false);
  }, [pathname]);

  useEffect(() => {
    setActive(-1);
  }, [query]);

  const ask = () => {
    setFocused(false);
    onAsk(query);
  };

  const openHit = (i: number) => {
    const hit = hits[i];
    if (!hit) return;
    setFocused(false);
    navigate(hitUrl(hit));
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    const count = hits.length + 1;
    if (e.key === 'ArrowDown' && query.trim()) {
      e.preventDefault();
      setFocused(true);
      setActive((a) => (a + 1) % count);
      return;
    }
    if (e.key === 'ArrowUp' && query.trim()) {
      e.preventDefault();
      setFocused(true);
      setActive((a) => (a <= 0 ? count - 1 : a - 1));
      return;
    }
    if (e.key === 'Escape' && !showDropdown && query) {
      setQuery('');
      return;
    }
    if (e.key === 'Enter' && query.trim()) {
      e.preventDefault();
      if (active === 0) ask();
      else if (active > 0) openHit(active - 1);
      else if (hits[0]) openHit(0);
      else ask();
    }
  };

  const optionId = (i: number) => `${listId}-opt-${i}`;

  return (
    <div ref={wrapRef} className={cx('wk-search', showDropdown && 'is-open')}>
      <div className="wk-search__box">
        <Search className="wk-search__icon" aria-hidden="true" />
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showDropdown && active >= 0 ? optionId(active) : undefined}
          className="wk-search__input"
          value={query}
          onFocus={() => setFocused(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setFocused(true);
          }}
          onKeyDown={onKeyDown}
          placeholder="Search playbooks, runbooks, policies…"
          aria-label="Search Knowledge Base playbooks"
        />
        {query && (
          <button
            type="button"
            className="neo-iconbtn neo-iconbtn--sm"
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
            aria-label="Clear search"
          >
            <X />
          </button>
        )}
        <button type="button" className="wk-search__ai" onClick={ask} title="Ask Nova Docs for a grounded, cited answer">
          <Sparkles aria-hidden="true" />
          <span>Ask AI</span>
        </button>
      </div>

      {showDropdown && (
        <div className="wk-search__drop neo-rise" role="listbox" id={listId} aria-label="Instant playbook matches">
          <button
            id={optionId(0)}
            type="button"
            role="option"
            aria-selected={active === 0}
            className={cx('wk-search__ask', active === 0 && 'is-active')}
            onMouseEnter={() => setActive(0)}
            onClick={ask}
          >
            <span className="wk-search__orb" aria-hidden="true" />
            <span className="wk-search__ask-text">
              <b>Synthesize a grounded answer with Nova Docs</b>
              <span>“{query.trim()}”</span>
            </span>
            <ArrowRight aria-hidden="true" />
          </button>

          {hits.length > 0 ? (
            <>
              <div className="wk-search__label neo-hud">Top matches in your cleared spaces</div>
              {hits.map((hit, i) => {
                const sp = spaceMap.get(hit.article.spaceId);
                return (
                  <Link
                    key={hit.article.id}
                    id={optionId(i + 1)}
                    role="option"
                    aria-selected={active === i + 1}
                    to={hitUrl(hit)}
                    className={cx('wk-search__hit', active === i + 1 && 'is-active')}
                    onMouseEnter={() => setActive(i + 1)}
                    onClick={() => setFocused(false)}
                  >
                    <span className="wk-search__hit-top">
                      <span className="wk-search__hit-title">
                        {hit.article.title}
                        {hit.matchedHeading && <span className="wk-search__hit-sec"> · § {hit.matchedHeading}</span>}
                      </span>
                      <span className="wk-search__hit-meta">
                        {sp && <SpacePill space={sp} />}
                        <FreshnessPill article={hit.article} compact />
                      </span>
                    </span>
                    <span className="wk-search__hit-snippet">{hit.snippet}</span>
                  </Link>
                );
              })}
            </>
          ) : (
            <div className="wk-search__none">No direct title or section match in your cleared spaces — ask Nova Docs above.</div>
          )}

          <div className="wk-search__foot" aria-hidden="true">
            <span>
              <kbd className="kbd">↑</kbd>
              <kbd className="kbd">↓</kbd> navigate
            </span>
            <span>
              <kbd className="kbd">↵</kbd> open top hit
            </span>
            <span>
              <kbd className="kbd">esc</kbd> close
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
