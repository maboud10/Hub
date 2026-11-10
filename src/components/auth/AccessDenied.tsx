import { Link } from 'react-router';
import { ArrowLeft, LockKeyhole, ShieldAlert } from 'lucide-react';
import { useClearance, usePrimaryRole } from '@/store/selectors';
import { ClearanceBadge } from '@/components/ui/primitives';
import { NeoEmpty, useNeoTint } from '@/components/neo';
import { HUB_PERMISSIONS } from '@/data/permissions';

/**
 * Creative 403 screen with a glitching lock and the user's clearance vs. what's required.
 * Inside a NEO workspace (any app) it renders as a holographic NEO empty state
 * so it sits naturally inside the app's glass stage.
 */
export function AccessDenied({ area, required }: { area: string; required: string[] }) {
  const clearance = useClearance();
  const role = usePrimaryRole();
  const inNeo = useNeoTint() !== null;
  const labels = required.map((p) => HUB_PERMISSIONS.find((h) => h.id === p)?.label ?? p);

  if (inNeo)
    return (
      <div className="neo-denied">
        <NeoEmpty
          icon={<LockKeyhole />}
          title={`${area} needs more clearance`}
          action={
            <div className="neo-denied__foot">
              <div className="neo-denied__chips">
                <ClearanceBadge level={clearance} compact />
                {labels.slice(0, 3).map((l) => (
                  <span key={l} className="neo-chip" data-tone="danger">
                    <ShieldAlert /> {l}
                  </span>
                ))}
                {labels.length > 3 && (
                  <span className="neo-chip" data-tone="slate">
                    +{labels.length - 3} more
                  </span>
                )}
              </div>
              <Link to="/" className="neo-btn neo-btn--soft">
                <ArrowLeft /> Back to Launchpad
              </Link>
            </div>
          }
        >
          Your current role{role ? ` (${role.name})` : ''} doesn’t include the required permission. If you need it for your work, request access from the
          app’s details or ask an administrator.
        </NeoEmpty>
      </div>
    );

  return (
    <div className="page denied">
      <div className="denied__card card glow-border hud">
        <div className="denied__lock" aria-hidden="true">
          <span className="denied__ring" />
          <span className="denied__ring denied__ring--2" />
          <LockKeyhole />
        </div>
        <div className="eyebrow">Error 403 · Access boundary</div>
        <h1 className="denied__title" data-text="Clearance insufficient">
          Clearance insufficient
        </h1>
        <p className="muted" style={{ maxWidth: 460, margin: '10px auto 0' }}>
          <strong>{area}</strong> is protected. Your current role{role ? ` (${role.name})` : ''} doesn’t include the required
          permission. If you need it for your work, ask an administrator to adjust your role.
        </p>
        <div className="denied__meta">
          <div className="stack stack--sm" style={{ alignItems: 'center' }}>
            <span className="stat-label">Your clearance</span>
            <ClearanceBadge level={clearance} compact />
          </div>
          <div className="stack stack--sm" style={{ alignItems: 'center' }}>
            <span className="stat-label">Requires one of</span>
            <div className="row row--wrap" style={{ justifyContent: 'center' }}>
              {labels.slice(0, 3).map((l) => (
                <span key={l} className="badge badge--danger">
                  <ShieldAlert /> {l}
                </span>
              ))}
              {labels.length > 3 && <span className="badge badge--muted">+{labels.length - 3} more</span>}
            </div>
          </div>
        </div>
        <Link to="/" className="btn btn--primary" style={{ marginTop: 26 }}>
          <ArrowLeft /> Back to home
        </Link>
      </div>
    </div>
  );
}
