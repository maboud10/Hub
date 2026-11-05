import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { Award, Gem, HandHeart, Lightbulb, Search, Shield, Users } from 'lucide-react';
import type { KudosValue } from '@/types';
import { useHub } from '@/store/hub';
import { useUI } from '@/store/ui';
import { toast } from '@/store/toast';
import { useSessionUser } from '@/store/selectors';
import { Modal } from '@/components/ui/Modal';
import { Avatar } from '@/components/ui/primitives';
import { burstConfetti } from '@/lib/confetti';
import { cx } from '@/lib/cx';

export const KUDOS_VALUES: Record<KudosValue, { label: string; icon: typeof Award; color: string; blurb: string }> = {
  teamwork: { label: 'Teamwork', icon: Users, color: '#38bdf8', blurb: 'Lifted the whole team' },
  innovation: { label: 'Innovation', icon: Lightbulb, color: '#fbbf24', blurb: 'Fresh thinking' },
  customer: { label: 'Customer love', icon: HandHeart, color: '#f472b6', blurb: 'Delighted customers' },
  ownership: { label: 'Ownership', icon: Shield, color: '#34d399', blurb: 'Took it all the way' },
  craft: { label: 'Craft', icon: Gem, color: '#a78bfa', blurb: 'Exceptional quality' },
};

export function KudosDialog() {
  const { open, toId } = useUI((s) => s.kudos);
  const close = useUI((s) => s.closeKudos);
  const me = useSessionUser();
  const users = useHub((s) => s.users);
  const giveKudos = useHub((s) => s.giveKudos);
  const [recipient, setRecipient] = useState<string | undefined>(toId);
  const [value, setValue] = useState<KudosValue>('teamwork');
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (open) {
      setRecipient(toId);
      setValue('teamwork');
      setMessage('');
      setQuery('');
    }
  }, [open, toId]);

  const candidates = useMemo(() => {
    const q = query.toLowerCase();
    return users.filter((u) => u.active && u.id !== me?.id && (!q || `${u.name} ${u.title} ${u.department}`.toLowerCase().includes(q))).slice(0, 8);
  }, [users, me, query]);
  const target = users.find((u) => u.id === recipient);

  const send = (e: MouseEvent) => {
    if (!recipient) return;
    const ok = toast.result(giveKudos(recipient, value, message));
    if (ok) {
      burstConfetti({ x: e.clientX, y: e.clientY });
      close();
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Give kudos"
      subtitle="Public recognition shows up on the kudos wall and notifies them."
      width={560}
      footer={
        <>
          <button className="btn btn--ghost" onClick={close}>
            Cancel
          </button>
          <button className="btn btn--primary" onClick={send} disabled={!recipient || message.trim().length < 5}>
            <Award /> Send kudos
          </button>
        </>
      }
    >
      <div className="stack stack--lg">
        <div className="field">
          <span className="field-label">Who are you recognising?</span>
          {target ? (
            <div className="kudos-target">
              <Avatar user={target} size={42} presence />
              <div className="grow">
                <div style={{ fontWeight: 600 }}>{target.name}</div>
                <div className="text-sm muted">{target.title}</div>
              </div>
              <button className="btn btn--sm" onClick={() => setRecipient(undefined)}>
                Change
              </button>
            </div>
          ) : (
            <>
              <div className="input-wrap">
                <Search />
                <input className="input" placeholder="Search colleagues…" value={query} onChange={(e) => setQuery(e.target.value)} data-autofocus />
              </div>
              <div className="kudos-people">
                {candidates.map((u) => (
                  <button key={u.id} className="kudos-person" onClick={() => setRecipient(u.id)}>
                    <Avatar user={u} size={34} />
                    <span className="truncate">{u.name.split(' ')[0]}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="field">
          <span className="field-label">For which value?</span>
          <div className="kudos-values" role="radiogroup" aria-label="Kudos value">
            {(Object.keys(KUDOS_VALUES) as KudosValue[]).map((k) => {
              const v = KUDOS_VALUES[k];
              const Icon = v.icon;
              return (
                <button
                  key={k}
                  role="radio"
                  aria-checked={value === k}
                  className={cx('kudos-value', value === k && 'is-active')}
                  style={{ ['--kv' as string]: v.color }}
                  onClick={() => setValue(k)}
                >
                  <Icon />
                  <span>{v.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="field">
          <label className="field-label" htmlFor="kudos-msg">
            Message
          </label>
          <textarea
            id="kudos-msg"
            className="textarea"
            maxLength={280}
            placeholder={target ? `What did ${target.name.split(' ')[0]} do that made a difference?` : 'What made a difference?'}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <span className="field-hint row row--between">
            <span>{KUDOS_VALUES[value].blurb}</span>
            <span className="mono">{message.length}/280</span>
          </span>
        </div>
      </div>
    </Modal>
  );
}
