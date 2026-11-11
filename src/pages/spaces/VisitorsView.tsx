/**
 * Spaces — "Visitors & Badges" (/spaces/visitors)
 * 5-stage NeoTracker Visitor Journey (`Invited` → `NDA & Security Pre-check` →
 * `Arrived at Kiosk` → `Host Notified & Badged` → `Checked Out`), printable QR
 * visitor pass card, denied-party screening escalation to Security Center,
 * and 1-click host ping in Pulse Chat + Nova Mail invite.
 */
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import {
  BadgeCheck,
  CheckCircle2,
  LogOut,
  Mail,
  MessageSquare,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  UserPlus,
} from 'lucide-react';
import {
  Chip,
  NeoBanner,
  NeoBanners,
  NeoEmpty,
  NeoHome,
  NeoPanel,
  NeoTabs,
  NeoTracker,
} from '@/components/neo';
import { Avatar } from '@/components/ui/primitives';
import { useHub } from '@/store/hub';
import { useSpacesAccess } from '@/spaces/access';
import {
  VISITOR_JOURNEY_STEPS,
  formatDecimalHour,
  visitorTrackerState,
} from '@/spaces/engine';
import { SITE_BY_ID } from '@/spaces/seed';
import { useSpaces } from '@/spaces/store';
import type { VisitorStage } from '@/spaces/types';
import {
  QrBadgeCard,
  escalateWatchToSecurity,
  pingColleagueOnChat,
  sendVisitorInviteMail,
  useSpacesUi,
} from './parts';

type StageFilter = 'all' | VisitorStage;

export function VisitorsView() {
  const { user: me, isOpsAdmin } = useSpacesAccess();
  const [params] = useSearchParams();
  const users = useHub((s) => s.users);
  const { site, openVisitorModal } = useSpacesUi();

  const visitors = useSpaces((s) => s.visitors);
  const advanceVisitor = useSpaces((s) => s.advanceVisitor);
  const recordVisitorHostPing = useSpaces((s) => s.recordVisitorHostPing);
  const recordVisitorInviteSent = useSpaces((s) => s.recordVisitorInviteSent);
  const escalateVisitorWatch = useSpaces((s) => s.escalateVisitorWatch);
  const clearVisitorWatch = useSpaces((s) => s.clearVisitorWatch);

  const [stageFilter, setStageFilter] = useState<StageFilter>('all');
  const [allHubs, setAllHubs] = useState<boolean>(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  const filteredVisitors = useMemo(
    () =>
      visitors.filter((v) => {
        if (!allHubs && v.site !== site) return false;
        if (stageFilter !== 'all' && v.stage !== stageFilter) return false;
        return true;
      }),
    [visitors, allHubs, site, stageFilter],
  );

  useEffect(() => {
    const paramVisitor = params.get('visitor');
    if (paramVisitor && visitors.some((v) => v.id === paramVisitor)) {
      setSelectedId(paramVisitor);
      return;
    }
    if (filteredVisitors[0] && (!selectedId || !filteredVisitors.some((v) => v.id === selectedId))) {
      setSelectedId(filteredVisitors[0].id);
    }
  }, [params, visitors, filteredVisitors, selectedId]);

  const selectedVisitor = useMemo(
    () => visitors.find((v) => v.id === selectedId) ?? filteredVisitors[0],
    [visitors, selectedId, filteredVisitors],
  );

  const flaggedVisitors = useMemo(
    () => visitors.filter((v) => v.watch && !v.watch.cleared),
    [visitors],
  );

  const handleIssueBadgeAndPingHost = async (visitorId: string) => {
    const updated = advanceVisitor(visitorId, 'badge');
    if (!updated) return;
    const toRoute = await pingColleagueOnChat({
      toUserId: updated.hostId,
      text: `🛎️ Your visitor ${updated.name} (${updated.company}) has checked in at ${SITE_BY_ID[updated.site].label} reception and been issued badge ${updated.badge}.`,
      cardTitle: `${updated.name} · Badge ${updated.badge}`,
      cardSubtitle: `${updated.company} · ${SITE_BY_ID[updated.site].label} Reception`,
      toRoute: `/spaces/visitors?visitor=${updated.id}`,
      statusLabel: 'Badged at Kiosk',
    });
    if (toRoute) {
      recordVisitorHostPing(updated.id, toRoute);
    }
  };

  const handleSendInviteMail = async (visitorId: string) => {
    const v = visitors.find((x) => x.id === visitorId);
    if (!v) return;
    const host = userMap.get(v.hostId);
    const toRoute = await sendVisitorInviteMail(v, host?.name ?? me?.name ?? 'Helix Host');
    if (toRoute) {
      recordVisitorInviteSent(v.id, toRoute);
    }
  };

  const handleEscalateWatch = async (visitorId: string) => {
    const v = visitors.find((x) => x.id === visitorId);
    if (!v) return;
    const patch = await escalateWatchToSecurity(v);
    escalateVisitorWatch(v.id, patch);
  };

  return (
    <div className="sp-view">
      {flaggedVisitors.length > 0 && (
        <NeoBanners>
          {flaggedVisitors.map((fv) => (
            <NeoBanner
              key={fv.id}
              tone="danger"
              icon={<ShieldAlert />}
              title={`Denied-party screening hold: ${fv.name} (${fv.company}) at ${SITE_BY_ID[fv.site].label}`}
              meta={fv.watch?.caseId ? `SOC Case ${fv.watch.caseId}` : 'Action required'}
              onClick={() => setSelectedId(fv.id)}
              action={
                <div className="sp-banner-btns">
                  {!fv.watch?.caseId && (
                    <button
                      type="button"
                      className="neo-btn neo-btn--xs neo-btn--danger"
                      onClick={() => handleEscalateWatch(fv.id)}
                    >
                      <ShieldAlert />
                      <span>Escalate to SOC</span>
                    </button>
                  )}
                  {isOpsAdmin && (
                    <button
                      type="button"
                      className="neo-btn neo-btn--xs neo-btn--soft"
                      onClick={() => clearVisitorWatch(fv.id)}
                    >
                      <ShieldCheck />
                      <span>Clear Hold</span>
                    </button>
                  )}
                </div>
              }
            >
              <span>{fv.watch?.reason}</span>
            </NeoBanner>
          ))}
        </NeoBanners>
      )}

      {/* Filter Bar */}
      <div className="sp-filterbar">
        <NeoTabs<StageFilter>
          value={stageFilter}
          onChange={setStageFilter}
          label="Filter visitor stages"
          items={[
            { value: 'all', label: 'All Guests', count: visitors.length },
            { value: 'invited', label: 'Invited' },
            { value: 'preregistered', label: 'Pre-checked' },
            { value: 'arrived', label: 'At Kiosk' },
            { value: 'badged', label: 'Badged' },
            { value: 'checked_out', label: 'Checked Out' },
          ]}
        />

        <div className="sp-filterbar__chips">
          <Chip
            tone={allHubs ? 'violet' : 'slate'}
            pressed={allHubs}
            onClick={() => setAllHubs((v) => !v)}
          >
            {allHubs ? 'Showing all 4 hubs' : `Only ${SITE_BY_ID[site].label}`}
          </Chip>

          <button
            type="button"
            className="neo-btn neo-btn--sm neo-btn--plasma"
            onClick={openVisitorModal}
            data-qa="sp-preregister-visitor-btn"
          >
            <UserPlus />
            <span>Pre-register Visitor</span>
          </button>
        </div>
      </div>

      <NeoHome
        main={
          <>
            {/* Selected Visitor 5-Stage NeoTracker */}
            {selectedVisitor && (() => {
              const tr = visitorTrackerState(selectedVisitor);
              return (
                <NeoTracker
                  hud={`VISITOR JOURNEY · ${selectedVisitor.badge ?? 'PASS'}`}
                  title={`${selectedVisitor.name} · ${selectedVisitor.company}`}
                  steps={VISITOR_JOURNEY_STEPS.map((s) => ({
                    id: s.id,
                    label: s.label,
                    sub: s.sub,
                  }))}
                  current={tr.current}
                  state={tr.state}
                  message={tr.message}
                  eta={tr.eta}
                  actions={
                    <div className="sp-tracker-actions">
                      {selectedVisitor.stage === 'invited' && (
                        <button
                          type="button"
                          className="neo-btn neo-btn--xs neo-btn--soft"
                          onClick={() => advanceVisitor(selectedVisitor.id, 'preregister')}
                        >
                          <ShieldCheck />
                          <span>Complete NDA Pre-check</span>
                        </button>
                      )}
                      {(selectedVisitor.stage === 'invited' ||
                        selectedVisitor.stage === 'preregistered') && (
                        <button
                          type="button"
                          className="neo-btn neo-btn--xs neo-btn--plasma"
                          onClick={() => advanceVisitor(selectedVisitor.id, 'arrive')}
                        >
                          <UserCheck />
                          <span>Check In at Kiosk</span>
                        </button>
                      )}
                      {selectedVisitor.stage === 'arrived' &&
                        (!selectedVisitor.watch || selectedVisitor.watch.cleared) && (
                          <button
                            type="button"
                            className="neo-btn neo-btn--xs neo-btn--plasma"
                            onClick={() => handleIssueBadgeAndPingHost(selectedVisitor.id)}
                            data-qa="sp-issue-badge-btn"
                          >
                            <BadgeCheck />
                            <span>Issue Badge & Ping Host</span>
                          </button>
                        )}
                      {selectedVisitor.stage === 'badged' && (
                        <button
                          type="button"
                          className="neo-btn neo-btn--xs neo-btn--soft"
                          onClick={() => advanceVisitor(selectedVisitor.id, 'checkout')}
                        >
                          <LogOut />
                          <span>Check Out</span>
                        </button>
                      )}
                    </div>
                  }
                />
              );
            })()}

            {/* Visitor Log Roster */}
            <NeoPanel
              hud="FRONT-DESK VISITOR ROSTER"
              title="Registered Visitors & Kiosk Queue"
              icon={<BadgeCheck />}
            >
              {filteredVisitors.length === 0 ? (
                <NeoEmpty
                  icon={<BadgeCheck />}
                  title="No visitors in this stage"
                  action={
                    <button
                      type="button"
                      className="neo-btn neo-btn--xs neo-btn--plasma"
                      onClick={openVisitorModal}
                    >
                      <UserPlus />
                      <span>Pre-register Visitor</span>
                    </button>
                  }
                />
              ) : (
                <div className="sp-visitor-list">
                  {filteredVisitors.map((v) => {
                    const host = userMap.get(v.hostId);
                    const tr = visitorTrackerState(v);
                    const isSelected = selectedVisitor?.id === v.id;
                    const isFlagged = Boolean(v.watch && !v.watch.cleared);

                    return (
                      <div
                        key={v.id}
                        className={`sp-visitor-row neo-spot ${isSelected ? 'is-selected' : ''}`}
                        onClick={() => setSelectedId(v.id)}
                        data-qa={`sp-visitor-row-${v.id}`}
                      >
                        <div className="sp-visitor-row__main">
                          <div className="sp-visitor-row__head">
                            <span className="sp-visitor-row__name">{v.name}</span>
                            <Chip tone="slate" size="sm">
                              {v.company}
                            </Chip>
                            <Chip tone="violet" size="sm">
                              {SITE_BY_ID[v.site].city}
                            </Chip>
                            {v.badge && (
                              <span className="neo-mono sp-visitor-row__badge">{v.badge}</span>
                            )}
                            {isFlagged && (
                              <Chip tone="rose" size="sm" icon={<ShieldAlert />}>
                                <span>Watchlist Hold</span>
                              </Chip>
                            )}
                          </div>

                          <div className="sp-visitor-row__meta">
                            {host && (
                              <span className="sp-host-inline">
                                <Avatar user={host} size={20} />
                                <span>Host:</span> <b>{host.name}</b>
                              </span>
                            )}
                            <span>·</span>
                            <span>
                              {v.date} · {formatDecimalHour(v.hour)}
                            </span>
                            <span>·</span>
                            <span>Purpose: {v.purpose}</span>
                            {v.note && (
                              <>
                                <span>·</span>
                                <span>{v.note}</span>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="sp-visitor-row__tracker">
                          <NeoTracker
                            steps={VISITOR_JOURNEY_STEPS.map((s) => ({ label: s.label }))}
                            current={tr.current}
                            state={tr.state}
                            compact
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </NeoPanel>
          </>
        }
        side={
          selectedVisitor && (
            <>
              <NeoPanel
                hud="PRINTABLE EXPRESS PASS"
                title="QR Turnstile & Wi-Fi Badge"
                icon={<BadgeCheck />}
              >
                <QrBadgeCard
                  visitor={selectedVisitor}
                  host={userMap.get(selectedVisitor.hostId)}
                />

                <div className="sp-inspector__btns" style={{ marginTop: 12 }}>
                  <button
                    type="button"
                    className="neo-btn neo-btn--sm neo-btn--soft neo-btn--block"
                    onClick={() => handleSendInviteMail(selectedVisitor.id)}
                  >
                    <Mail />
                    <span>Email QR Pass via Nova Mail</span>
                  </button>

                  <button
                    type="button"
                    className="neo-btn neo-btn--sm neo-btn--ghost neo-btn--block"
                    onClick={() =>
                      pingColleagueOnChat({
                        toUserId: selectedVisitor.hostId,
                        text: `Visitor update for ${selectedVisitor.name} (${selectedVisitor.company}) at ${SITE_BY_ID[selectedVisitor.site].label}: stage is currently "${selectedVisitor.stage}".`,
                        cardTitle: `${selectedVisitor.name} · ${selectedVisitor.badge ?? 'Visitor'}`,
                        cardSubtitle: `${selectedVisitor.company} · ${SITE_BY_ID[selectedVisitor.site].label}`,
                        toRoute: `/spaces/visitors?visitor=${selectedVisitor.id}`,
                      })
                    }
                  >
                    <MessageSquare />
                    <span>Ping Host on Pulse Chat</span>
                  </button>

                  {!selectedVisitor.ndaSigned && (
                    <button
                      type="button"
                      className="neo-btn neo-btn--sm neo-btn--soft neo-btn--block"
                      onClick={() => advanceVisitor(selectedVisitor.id, 'sign_nda')}
                    >
                      <CheckCircle2 />
                      <span>Record Kiosk NDA Signature</span>
                    </button>
                  )}
                </div>
              </NeoPanel>
            </>
          )
        }
      />
    </div>
  );
}
