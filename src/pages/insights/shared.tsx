import { useMemo } from 'react';
import { Globe, Layers, ShieldCheck, Sparkles } from 'lucide-react';
import type { User } from '@/types';
import { SEED_USERS } from '@/data/users';
import { useHub } from '@/store/hub';
import { Avatar } from '@/components/ui/primitives';
import { NeoTabs, type NeoTabItem } from '@/components/neo';
import { SEGMENT_META } from '@/insights/seed';
import type { InsightsSegment } from '@/insights/types';

export function useInsightsUsers() {
  const storeUsers = useHub((s) => s.users);
  const users = storeUsers?.length ? storeUsers : SEED_USERS;

  return useMemo(() => {
    const map = new Map<string, User>();
    for (const u of SEED_USERS) map.set(u.id, u);
    for (const u of users) map.set(u.id, u);
    const get = (id: string): User =>
      map.get(id) ??
      SEED_USERS[0];
    return { map, get, all: [...map.values()] };
  }, [users]);
}

export function OwnerPill({ userId, prefix }: { userId: string; prefix?: string }) {
  const { get } = useInsightsUsers();
  const user = get(userId);
  return (
    <span className="ins-owner" title={`${user.name} · ${user.title}`}>
      <Avatar user={user} size={20} />
      <span className="ins-owner__name">
        {prefix ? `${prefix} ` : ''}
        {user.name}
      </span>
    </span>
  );
}

const SEGMENT_TABS: NeoTabItem<InsightsSegment>[] = [
  { value: 'all', label: 'All Global', icon: <Globe /> },
  { value: 'mena', label: 'MENA & GCC', icon: <Sparkles /> },
  { value: 'enterprise', label: 'Enterprise', icon: <ShieldCheck /> },
  { value: 'plg', label: 'PLG Self-Serve', icon: <Layers /> },
];

export function SegmentFilterBar({
  value,
  onChange,
  rightSlot,
}: {
  value: InsightsSegment;
  onChange: (seg: InsightsSegment) => void;
  rightSlot?: React.ReactNode;
}) {
  const meta = SEGMENT_META[value];
  return (
    <div className="ins-segbar">
      <div className="ins-segbar__left">
        <NeoTabs
          value={value}
          onChange={onChange}
          items={SEGMENT_TABS}
          label="Filter telemetry by segment"
        />
        <div className="ins-segbar__meta">
          <span>
            ARR <b>${meta.arrM.toFixed(1)}M</b>
          </span>
          <span className="ins-dot">·</span>
          <span>
            NDR <b className="ins-pos">{meta.ndrPct}%</b>
          </span>
          <span className="ins-dot">·</span>
          <span>
            Active Teams <b>{meta.activeTeamsPct}%</b>
          </span>
          <span className="ins-dot">·</span>
          <span>
            CAC Payback <b>{meta.cacPaybackMos} mos</b>
          </span>
        </div>
      </div>
      {rightSlot && <div className="ins-segbar__right">{rightSlot}</div>}
    </div>
  );
}
