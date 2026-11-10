/**
 * Emoji picker: search, recents, categories. Rendered inside a NeoPopover.
 */
import { useMemo, useRef, useState } from 'react';
import { Clock, Coffee, Heart, Lightbulb, Leaf, Plane, Smile, Hand, PartyPopper } from 'lucide-react';
import { NeoPopover, NeoSearch, type PopAnchor, type PopPlacement } from '@/components/neo';
import { cx } from '@/lib/cx';
import { EMOJI_CATEGORIES, EMOJIS, searchEmoji, type EmojiCategory } from '@/chat/emoji';
import { usePerson } from './hooks';

const CAT_ICON: Record<EmojiCategory | 'recent', typeof Smile> = {
  recent: Clock,
  smileys: Smile,
  people: Hand,
  nature: Leaf,
  food: Coffee,
  activities: PartyPopper,
  travel: Plane,
  objects: Lightbulb,
  symbols: Heart,
};

export function EmojiGrid({ onPick }: { onPick: (emoji: string) => void }) {
  const person = usePerson();
  const [q, setQ] = useState('');
  const [hover, setHover] = useState<{ e: string; code: string } | null>(null);
  const body = useRef<HTMLDivElement>(null);
  const recents = person.emojiRecents.length ? person.emojiRecents : ['👍', '🎉', '🔥', '🙌', '👀', '😂', '💜', '🚀'];
  const results = useMemo(() => (q.trim() ? searchEmoji(q, 80) : null), [q]);
  const byCat = useMemo(() => {
    const m = new Map<EmojiCategory, typeof EMOJIS>();
    for (const e of EMOJIS) m.set(e.cat, [...(m.get(e.cat) ?? []), e]);
    return m;
  }, []);
  const jump = (id: string) => body.current?.querySelector(`[data-cat="${id}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });

  return (
    <div className="pc-emoji" onKeyDown={(e) => e.stopPropagation()}>
      <div className="pc-emoji__top">
        <NeoSearch value={q} onChange={setQ} placeholder="Search emoji…" size="sm" autoFocus label="Search emoji" />
      </div>
      {!results && (
        <div className="pc-emoji__cats" role="tablist" aria-label="Emoji categories">
          {(['recent', ...EMOJI_CATEGORIES.map((c) => c.id)] as const).map((id) => {
            const Icon = CAT_ICON[id];
            return (
              <button key={id} type="button" className="neo-iconbtn neo-iconbtn--sm" onClick={() => jump(id)} aria-label={id === 'recent' ? 'Recent' : EMOJI_CATEGORIES.find((c) => c.id === id)?.label}>
                <Icon />
              </button>
            );
          })}
        </div>
      )}
      <div className="pc-emoji__body" ref={body}>
        {results ? (
          results.length ? (
            <div className="pc-emoji__grid">
              {results.map((x) => (
                <button key={x.e} type="button" className="pc-emoji__btn" onClick={() => onPick(x.e)} onMouseEnter={() => setHover(x)} aria-label={x.code}>
                  {x.e}
                </button>
              ))}
            </div>
          ) : (
            <div className="pc-emoji__empty">No emoji for “{q}”</div>
          )
        ) : (
          <>
            <div className="pc-emoji__label" data-cat="recent">
              Recent
            </div>
            <div className="pc-emoji__grid">
              {recents.slice(0, 16).map((e) => (
                <button key={e} type="button" className="pc-emoji__btn" onClick={() => onPick(e)} aria-label={e}>
                  {e}
                </button>
              ))}
            </div>
            {EMOJI_CATEGORIES.map((c) => (
              <div key={c.id}>
                <div className="pc-emoji__label" data-cat={c.id}>
                  {c.label}
                </div>
                <div className="pc-emoji__grid">
                  {(byCat.get(c.id) ?? []).map((x) => (
                    <button key={x.e} type="button" className="pc-emoji__btn" onClick={() => onPick(x.e)} onMouseEnter={() => setHover(x)} aria-label={x.code}>
                      {x.e}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
      <div className={cx('pc-emoji__foot', !hover && 'is-empty')}>
        {hover ? (
          <>
            <span className="pc-emoji__big">{hover.e}</span>
            <span className="neo-mono text-xs">:{hover.code}:</span>
          </>
        ) : (
          <span className="neo-faint text-xs">Tip: type :name: in a message</span>
        )}
      </div>
    </div>
  );
}

export function EmojiPopover({ open, anchor, onClose, onPick, placement = 'top-end' }: { open: boolean; anchor: PopAnchor; onClose: () => void; onPick: (e: string) => void; placement?: PopPlacement }) {
  return (
    <NeoPopover open={open} anchor={anchor} onClose={onClose} placement={placement} width={344} label="Emoji picker" className="pc-emoji-pop">
      <EmojiGrid
        onPick={(e) => {
          onPick(e);
          onClose();
        }}
      />
    </NeoPopover>
  );
}
