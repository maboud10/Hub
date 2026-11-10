/**
 * People Ops console · Ask People Ops cases board: Open / Answered / Resolved
 * columns (a status switcher on phones), confidential cases locked behind a
 * deliberate "open", inline threads with reply (`replyCase`) and resolve
 * (`closeCase`), and a link to the approvals inbox.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ArrowRight, CircleCheckBig, EyeOff, Lock, MessagesSquare, Send } from 'lucide-react';
import type { CaseStatus, HrCase } from '@/hr/types';
import { CASE_CATEGORY_META, CASE_STATUS_META } from '@/hr/constants';
import { canReplyCase } from '@/hr/access';
import { useHr } from '@/hr/store';
import { useHrViewer } from '@/hr/selectors';
import { useUserById } from '@/store/selectors';
import { toast } from '@/store/toast';
import { useNow } from '@/hooks/useNow';
import { Segmented } from '@/components/ui/primitives';
import { cx } from '@/lib/cx';
import { HrPanel, UserLine } from '../components/shared';
import { ago } from '../home/format';

const COLUMNS: CaseStatus[] = ['open', 'answered', 'closed'];
const HINT: Record<CaseStatus, string> = {
  open: 'Waiting for a reply',
  answered: 'Replied, waiting on them',
  closed: 'Resolved',
};

export function CasesBoard() {
  const cases = useHr((s) => s.cases);
  const [col, setCol] = useState<CaseStatus>('open');
  const [openId, setOpenId] = useState<string | null>(null);
  const byStatus = useMemo(() => {
    const sorted = [...cases].sort((a, b) => b.updatedAt - a.updatedAt);
    return Object.fromEntries(COLUMNS.map((s) => [s, sorted.filter((c) => c.status === s)])) as Record<CaseStatus, HrCase[]>;
  }, [cases]);

  return (
    <HrPanel
      className="hr-ops-cases"
      hud="Inbox & threads"
      title="Ask People Ops cases"
      icon={<MessagesSquare aria-hidden="true" />}
      sub="Reply right here or from Approvals. Confidential cases stay locked until you open them."
      actions={
        <Link to="/hr/approvals" className="btn btn--sm">
          Open approvals <ArrowRight />
        </Link>
      }
    >
      <div className="hr-ops-cases__seg">
        <Segmented value={col} onChange={setCol} label="Case status" options={COLUMNS.map((s) => ({ value: s, label: `${CASE_STATUS_META[s].label} (${byStatus[s].length})` }))} />
      </div>
      <div className="hr-ops-cases__board">
        {COLUMNS.map((s) => (
          <section key={s} className={cx('hr-ops-cases__col', `is-${s}`, col === s && 'is-active')} aria-label={`${CASE_STATUS_META[s].label} cases`}>
            <header className="hr-ops-cases__colhead">
              <i aria-hidden="true" />
              <b>{CASE_STATUS_META[s].label}</b>
              <span className="hr-ops-cases__count">{byStatus[s].length}</span>
              <span className="hr-ops-cases__hint">{HINT[s]}</span>
            </header>
            {byStatus[s].length ? (
              byStatus[s].map((c) => <CaseCard key={c.id} hrCase={c} open={openId === c.id} onToggle={() => setOpenId((id) => (id === c.id ? null : c.id))} />)
            ) : (
              <p className="hr-ops-cases__empty">{s === 'open' ? 'All caught up. Nothing waiting for a reply.' : 'Nothing here right now.'}</p>
            )}
          </section>
        ))}
      </div>
    </HrPanel>
  );
}

function CaseCard({ hrCase: c, open, onToggle }: { hrCase: HrCase; open: boolean; onToggle: () => void }) {
  const v = useHrViewer();
  const requester = useUserById(c.userId);
  const replyCase = useHr((s) => s.replyCase);
  const closeCase = useHr((s) => s.closeCase);
  const now = useNow(60_000);
  const [text, setText] = useState('');
  const cat = CASE_CATEGORY_META[c.category];
  const Icon = cat.icon;
  const last = c.messages[c.messages.length - 1];
  const own = !!v && v.userId === c.userId;
  const canReply = !!v && !own && canReplyCase(v, c).ok;
  const panelId = `hr-ops-case-${c.id}`;

  const reply = () => {
    if (toast.result(replyCase(c.id, text))) setText('');
  };

  return (
    <article className={cx('hr-ops-case', c.confidential && 'is-confidential', open && 'is-open')}>
      <button type="button" className="hr-ops-case__head" aria-expanded={open} aria-controls={panelId} onClick={onToggle}>
        <span className={cx('hr-ops-case__cat', c.category === 'wellbeing' && 'is-care')} aria-hidden="true">
          <Icon />
        </span>
        <span className="grow">
          <span className="hr-ops-case__subject">{c.subject}</span>
          <span className="hr-ops-case__meta">
            {requester?.name ?? 'Someone'} · {ago(c.updatedAt, now)} · {c.messages.length} message{c.messages.length === 1 ? '' : 's'}
          </span>
        </span>
        {c.confidential && (
          <span className="hr-ops-case__lock" title="Confidential: People Ops only, never managers">
            <Lock aria-hidden="true" />
            <span className="sr-only">Confidential</span>
          </span>
        )}
      </button>
      {!open &&
        (c.confidential ? (
          <p className="hr-ops-case__hidden">
            <EyeOff aria-hidden="true" /> Details hidden. Open to read.
          </p>
        ) : (
          last && <p className="hr-ops-case__preview">{last.text}</p>
        ))}
      {open && (
        <div className="hr-ops-case__body" id={panelId}>
          <span className="hr-ops-case__tags">
            <span className="tag">{cat.label}</span>
            {c.confidential && (
              <span className="hr-ops-case__conf">
                <Lock aria-hidden="true" /> Confidential · only People Ops can see this
              </span>
            )}
          </span>
          <ol className="hr-ops-case__thread">
            {c.messages.map((m) => (
              <li key={m.id} className={cx('hr-ops-msg', m.by === c.userId ? 'is-them' : 'is-ops')}>
                <UserLine userId={m.by} size={24} sub={`${m.by === c.userId ? 'Asked' : 'People Ops'} · ${ago(m.at, now)}`} />
                <p>{m.text}</p>
              </li>
            ))}
          </ol>
          {c.status === 'closed' ? (
            <p className="hr-ops-case__note">
              <CircleCheckBig aria-hidden="true" /> Resolved {ago(c.updatedAt, now)}.
            </p>
          ) : own ? (
            <p className="hr-ops-case__note">This is your own case, so another People Ops partner will reply.</p>
          ) : canReply ? (
            <div className="hr-ops-case__reply">
              <textarea className="textarea" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder={`Reply to ${requester?.name.split(' ')[0] ?? 'them'}…`} aria-label="Your reply" maxLength={2000} />
              <div className="hr-ops-case__bar">
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => toast.result(closeCase(c.id))}>
                  <CircleCheckBig /> Resolve
                </button>
                <button type="button" className="btn btn--primary btn--sm" onClick={reply} disabled={text.trim().length < 2}>
                  <Send /> Reply
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </article>
  );
}
