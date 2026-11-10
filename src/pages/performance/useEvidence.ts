/**
 * Evidence hook: merges Performance data with shipped work from Helix Projects
 * (via the bridge — degrades gracefully while Projects is unavailable).
 */
import { useEffect, useMemo, useState } from 'react';
import type { BridgeWorkItem } from '@/lib/appBridge';
import { currentViewer, loadBridge } from '@/lib/appBridge';
import { useHub } from '@/store/hub';
import { buildEvidence, type EvidenceItem } from '@/performance/evidence';
import { visibleFeedback } from '@/performance/selectors';
import { usePerf } from '@/performance/store';
import type { PerfCtx } from './hooks';

const workCache = new Map<string, BridgeWorkItem[]>();

/** Completed Helix Projects work for `userId` since `since` (cached per session). */
export function useCompletedWork(userId: string | undefined, since: number): { items: BridgeWorkItem[]; status: 'loading' | 'ready' | 'unavailable' } {
  const key = `${userId}:${Math.floor(since / 86_400_000)}`;
  const [state, setState] = useState<{ key: string; items: BridgeWorkItem[]; status: 'loading' | 'ready' | 'unavailable' }>(() => ({ key, items: workCache.get(key) ?? [], status: workCache.has(key) ? 'ready' : 'loading' }));
  useEffect(() => {
    if (!userId) return;
    if (workCache.has(key)) {
      setState({ key, items: workCache.get(key)!, status: 'ready' });
      return;
    }
    let alive = true;
    setState({ key, items: [], status: 'loading' });
    loadBridge('projects')
      .then((api) => {
        const viewer = currentViewer();
        if (!viewer) throw new Error('signed out');
        const items = api.completedWork(viewer, userId, since) ?? [];
        workCache.set(key, items);
        if (alive) setState({ key, items, status: 'ready' });
      })
      .catch(() => alive && setState({ key, items: [], status: 'unavailable' }));
    return () => {
      alive = false;
    };
  }, [key, userId, since]);
  return state.key === key ? { items: state.items, status: state.status } : { items: [], status: 'loading' };
}

/** Everything that shows what `userId` did between `since` and `until`, as visible to the viewer. */
export function useEvidence(ctx: PerfCtx | null, userId: string | undefined, since: number, until?: number) {
  const kudos = useHub((s) => s.kudos);
  const feedback = usePerf((s) => s.feedback);
  const keyResults = usePerf((s) => s.keyResults);
  const objectives = usePerf((s) => s.objectives);
  const pinned = usePerf((s) => s.evidence);
  const work = useCompletedWork(userId, since);
  const items = useMemo<EvidenceItem[]>(() => {
    if (!ctx || !userId) return [];
    return buildEvidence({
      userId,
      since,
      until,
      kudos,
      feedback: visibleFeedback({ feedback }, ctx.v, ctx.users),
      keyResults,
      objectives,
      pinned,
      work: work.items,
      nameOf: ctx.name,
    });
  }, [ctx, userId, since, until, kudos, feedback, keyResults, objectives, pinned, work.items]);
  return { items, workStatus: work.status };
}
