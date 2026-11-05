/**
 * Pipeline list view: a sortable table (candidate, requisition, stage, match,
 * days in stage, owner, next action) that reflows into cards on phones.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Clock } from 'lucide-react';
import { APPLICATION_STATUS_LABEL, stageIndex } from '@/talent/constants';
import { useTalentLookups } from '@/talent/selectors';
import { useTalentUI } from '@/talent/ui';
import { cx } from '@/lib/cx';
import { CandidateAvatar, MatchRing, NextActionButton, PersonChip, SampleTag, StageBadge } from '../components/shared';
import { MoveMenu } from './MoveMenu';
import type { PipeRow } from './PipelineCard';
import { isClosedApp, stageVars } from './pipelineUtils';

type SortKey = 'candidate' | 'req' | 'stage' | 'match' | 'days' | 'owner';

export function PipelineList({ rows, showReq }: { rows: PipeRow[]; showReq: boolean }) {
  const { userById } = useTalentLookups();
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'stage', dir: -1 });

  const sorted = useMemo(() => {
    const val = (r: PipeRow): string | number => {
      switch (sort.key) {
        case 'candidate':
          return r.cand?.name ?? '';
        case 'req':
          return r.req?.title ?? '';
        case 'stage':
          return (r.app.status === 'hired' ? 8 : stageIndex(r.app.stage)) - (isClosedApp(r.app) ? 20 : 0);
        case 'match':
          return r.app.match?.score ?? -1;
        case 'days':
          return isClosedApp(r.app) ? -1 : r.days;
        case 'owner':
          return userById.get(r.app.ownerId)?.name ?? '';
      }
    };
    return [...rows].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
      return c * sort.dir || (b.app.match?.score ?? 0) - (a.app.match?.score ?? 0);
    });
  }, [rows, sort, userById]);

  const th = (key: SortKey, label: ReactNode, className?: string) => {
    const active = sort.key === key;
    const Icon = active ? (sort.dir === 1 ? ArrowUp : ArrowDown) : ArrowUpDown;
    return (
      <th className={className} aria-sort={active ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
        <button
          type="button"
          className={cx('tl-pipe-th', active && 'is-active')}
          onClick={() => setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === 'candidate' || key === 'req' || key === 'owner' ? 1 : -1 }))}
        >
          {label}
          <Icon aria-hidden="true" />
        </button>
      </th>
    );
  };

  const open = (candidateId: string) => useTalentUI.getState().openCandidate(candidateId);

  return (
    <div className="table-wrap tl-pipe-tablewrap">
      <table className="table tl-pipe-table">
        <caption className="sr-only">Pipeline candidates, sortable by column</caption>
        <thead>
          <tr>
            {th('candidate', 'Candidate')}
            {showReq && th('req', 'Requisition')}
            {th('stage', 'Stage')}
            {th('match', 'Match')}
            {th('days', 'In stage')}
            {th('owner', 'Owner')}
            <th>Next action</th>
            <th>
              <span className="sr-only">Move</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const closed = isClosedApp(r.app);
            const name = r.cand?.name ?? 'Unknown candidate';
            return (
              <tr
                key={r.app.id}
                className={cx('tl-pipe-tr', closed && 'is-closed', !closed && r.app.status === 'active' && `is-sla-${r.sla}`)}
                style={stageVars(r.app.stage)}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest('button, a')) return;
                  open(r.app.candidateId);
                }}
              >
                <td data-label="Candidate" className="tl-pipe-td-person">
                  <div className="tl-pipe-person">
                    {r.cand && <CandidateAvatar person={r.cand} size={36} />}
                    <div className="tl-pipe-person__text">
                      <div className="row" style={{ gap: 6 }}>
                        <button type="button" className="tl-pipe-person__name" onClick={() => open(r.app.candidateId)}>
                          {name}
                        </button>
                        {r.cand?.sample && <SampleTag />}
                      </div>
                      <div className="tl-pipe-person__role">{r.cand ? `${r.cand.currentTitle} @ ${r.cand.currentCompany}` : '—'}</div>
                    </div>
                  </div>
                </td>
                {showReq && (
                  <td data-label="Requisition">
                    <span className="tl-pipe-td-req" title={r.req?.title}>
                      {r.req?.title ?? '—'}
                    </span>
                  </td>
                )}
                <td data-label="Stage">
                  <span className="row" style={{ gap: 6 }}>
                    <StageBadge stage={r.app.status === 'hired' ? 'hired' : r.app.stage} />
                    {closed && <span className="badge badge--muted">{APPLICATION_STATUS_LABEL[r.app.status]}</span>}
                  </span>
                </td>
                <td data-label="Match">{r.app.match ? <MatchRing score={r.app.match.score} size={34} stroke={3} /> : <span className="faint">—</span>}</td>
                <td data-label="In stage">
                  {closed || r.app.status === 'hired' ? (
                    <span className="faint">—</span>
                  ) : (
                    <span className={cx('tl-pipe-sla', `is-${r.sla}`)}>
                      <Clock aria-hidden="true" />
                      {r.days}d
                    </span>
                  )}
                </td>
                <td data-label="Owner">
                  <PersonChip userId={r.app.ownerId} />
                </td>
                <td data-label="Next action" className="tl-pipe-td-next">
                  {closed ? <span className="faint text-sm">Closed</span> : <NextActionButton applicationId={r.app.id} />}
                </td>
                <td className="tl-pipe-td-menu">
                  <MoveMenu app={r.app} req={r.req} name={name} showProfile />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
