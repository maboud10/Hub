/**
 * Spaces — "Service Requests" (/spaces/requests)
 * 5-stage NeoTracker Facility Request Journey (`Submitted` → `Triaged & Assigned`
 * → `Technician Dispatched` → `Work in Progress` → `Verified & Closed`),
 * new facility ticket composer, and 1-click IT Helpdesk hand-off.
 */
import { type FormEvent, useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
  ArrowRight,
  CheckCircle2,
  LifeBuoy,
  Plus,
  Star,
  Wrench,
} from 'lucide-react';
import {
  Chip,
  NeoEmpty,
  NeoHome,
  NeoPanel,
  NeoTabs,
  NeoTracker,
} from '@/components/neo';
import { Avatar } from '@/components/ui/primitives';
import { useHub } from '@/store/hub';
import { canManageRequest, useSpacesAccess } from '@/spaces/access';
import {
  REQUEST_JOURNEY_STEPS,
  requestTrackerState,
} from '@/spaces/engine';
import { SITE_BY_ID } from '@/spaces/seed';
import { useSpaces } from '@/spaces/store';
import type { ServiceKind, ServicePriority } from '@/spaces/types';
import { escalateRequestToHelpdesk, useSpacesUi } from './parts';

type KindFilter = 'all' | ServiceKind;

const KIND_LABELS: Record<ServiceKind, string> = {
  maintenance: 'HVAC & Maintenance',
  it_setup: 'AV & HoloMeet Setup',
  catering: 'Hospitality & Catering',
  cleaning: 'Cleaning & Reset',
  locker: 'Smart Lockers',
  parking: 'EV & Parking',
  lost_found: 'Lost & Found',
};

export function RequestsView() {
  const { user: me, perms } = useSpacesAccess();
  const users = useHub((s) => s.users);
  const { site } = useSpacesUi();

  const requests = useSpaces((s) => s.requests);
  const createServiceRequest = useSpaces((s) => s.createServiceRequest);
  const advanceServiceRequest = useSpaces((s) => s.advanceServiceRequest);
  const rateServiceRequest = useSpaces((s) => s.rateServiceRequest);
  const linkRequestHelpdeskTicket = useSpaces((s) => s.linkRequestHelpdeskTicket);

  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(() => requests[0]?.id ?? null);

  // New request form state
  const [kind, setKind] = useState<ServiceKind>('maintenance');
  const [title, setTitle] = useState('');
  const [where, setWhere] = useState('Collab Zone · L41');
  const [priority, setPriority] = useState<ServicePriority>('normal');
  const [detail, setDetail] = useState('');

  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  const filteredRequests = useMemo(
    () =>
      requests.filter((r) => {
        if (kindFilter !== 'all' && r.kind !== kindFilter) return false;
        return true;
      }),
    [requests, kindFilter],
  );

  const selectedRequest = useMemo(
    () => requests.find((r) => r.id === selectedId) ?? filteredRequests[0],
    [requests, selectedId, filteredRequests],
  );

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!me || !title.trim()) return;
    const created = createServiceRequest({
      requesterId: me.id,
      site,
      kind,
      title: title.trim(),
      detail: detail.trim() || undefined,
      where: where.trim() || SITE_BY_ID[site].label,
      priority,
    });
    setSelectedId(created.id);
    setTitle('');
    setDetail('');
  };

  const handleEscalateHelpdesk = async (reqId: string) => {
    const req = requests.find((r) => r.id === reqId);
    if (!req) return;
    const res = await escalateRequestToHelpdesk(req);
    if (res) {
      linkRequestHelpdeskTicket(req.id, res.ticketId, res.to);
    }
  };

  return (
    <div className="sp-view">
      <div className="sp-filterbar">
        <NeoTabs<KindFilter>
          value={kindFilter}
          onChange={setKindFilter}
          label="Filter facility ticket categories"
          items={[
            { value: 'all', label: 'All Tickets', count: requests.length },
            { value: 'maintenance', label: 'HVAC & Maint.' },
            { value: 'it_setup', label: 'AV & HoloMeet' },
            { value: 'catering', label: 'Catering' },
            { value: 'cleaning', label: 'Cleaning' },
            { value: 'locker', label: 'Lockers' },
          ]}
        />
      </div>

      <NeoHome
        main={
          <>
            {/* Selected Request 5-Stage NeoTracker */}
            {selectedRequest && (() => {
              const tr = requestTrackerState(selectedRequest);
              const canManage = canManageRequest(me, perms, selectedRequest);

              return (
                <NeoTracker
                  hud={`FACILITY TICKET · ${selectedRequest.code} (${SITE_BY_ID[selectedRequest.site].label})`}
                  title={selectedRequest.title}
                  steps={REQUEST_JOURNEY_STEPS}
                  current={tr.current}
                  state={tr.state}
                  message={tr.message}
                  eta={tr.eta}
                  actions={
                    <div className="sp-tracker-actions">
                      {canManage && selectedRequest.stage !== 'done' && selectedRequest.stage !== 'cancelled' && (
                        <button
                          type="button"
                          className="neo-btn neo-btn--xs neo-btn--plasma"
                          onClick={() => advanceServiceRequest(selectedRequest.id)}
                          data-qa="sp-advance-request-btn"
                        >
                          <CheckCircle2 />
                          <span>
                            {selectedRequest.stage === 'in_progress'
                              ? 'Verify & Close Ticket'
                              : 'Advance Stage'}
                          </span>
                        </button>
                      )}

                      {!selectedRequest.ticketId ? (
                        <button
                          type="button"
                          className="neo-btn neo-btn--xs neo-btn--soft"
                          onClick={() => handleEscalateHelpdesk(selectedRequest.id)}
                        >
                          <LifeBuoy />
                          <span>Link IT Helpdesk</span>
                        </button>
                      ) : (
                        <Link
                          to={selectedRequest.ticketTo ?? '/helpdesk/tickets'}
                          className="neo-btn neo-btn--xs neo-btn--soft"
                        >
                          <LifeBuoy />
                          <span>Helpdesk {selectedRequest.ticketId}</span>
                          <ArrowRight />
                        </Link>
                      )}
                    </div>
                  }
                />
              );
            })()}

            {/* Facility Ticket Queue */}
            <NeoPanel
              hud="WORKPLACE OPERATIONS QUEUE"
              title="Active & Resolved Facility Tickets"
              icon={<Wrench />}
            >
              {filteredRequests.length === 0 ? (
                <NeoEmpty icon={<Wrench />} title="No facility requests in this category" />
              ) : (
                <div className="sp-visitor-list">
                  {filteredRequests.map((req) => {
                    const requester = userMap.get(req.requesterId);
                    const tr = requestTrackerState(req);
                    const isSelected = selectedRequest?.id === req.id;

                    return (
                      <div
                        key={req.id}
                        className={`sp-visitor-row neo-spot ${isSelected ? 'is-selected' : ''}`}
                        onClick={() => setSelectedId(req.id)}
                        data-qa={`sp-request-row-${req.id}`}
                      >
                        <div className="sp-visitor-row__main">
                          <div className="sp-visitor-row__head">
                            <span className="neo-mono sp-visitor-row__badge">{req.code}</span>
                            <span className="sp-visitor-row__name">{req.title}</span>
                            <Chip
                              tone={
                                req.priority === 'high'
                                  ? 'rose'
                                  : req.priority === 'normal'
                                    ? 'cyan'
                                    : 'slate'
                              }
                              size="sm"
                            >
                              {req.priority}
                            </Chip>
                            <Chip tone="violet" size="sm">
                              {KIND_LABELS[req.kind]}
                            </Chip>
                          </div>

                          {req.detail && <div className="sp-request-detail">{req.detail}</div>}

                          <div className="sp-visitor-row__meta">
                            <span>{SITE_BY_ID[req.site].label}</span>
                            {req.where && (
                              <>
                                <span>·</span>
                                <b>{req.where}</b>
                              </>
                            )}
                            {requester && (
                              <>
                                <span>·</span>
                                <span className="sp-host-inline">
                                  <Avatar user={requester} size={18} />
                                  <span>{requester.name}</span>
                                </span>
                              </>
                            )}
                            {req.assignee && (
                              <>
                                <span>·</span>
                                <span>Assignee: {req.assignee}</span>
                              </>
                            )}
                          </div>

                          {req.stage === 'done' && (
                            <div className="sp-rating-row" onClick={(e) => e.stopPropagation()}>
                              <span>Satisfaction rating:</span>
                              {[1, 2, 3, 4, 5].map((n) => (
                                <button
                                  key={n}
                                  type="button"
                                  className={`sp-star-btn ${(req.rating ?? 0) >= n ? 'is-lit' : ''}`}
                                  onClick={() => rateServiceRequest(req.id, n)}
                                  aria-label={`Rate ${n} stars`}
                                >
                                  <Star />
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="sp-visitor-row__tracker">
                          <NeoTracker
                            steps={REQUEST_JOURNEY_STEPS}
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
          <NeoPanel
            hud="LOG WORKPLACE TICKET"
            title="New Facility Request"
            icon={<Plus />}
          >
            <form className="sp-inspector" onSubmit={handleSubmit}>
              <label className="sp-addon-field">
                <span className="neo-hud">CATEGORY</span>
                <select
                  className="neo-input neo-input--sm"
                  value={kind}
                  onChange={(e) => setKind(e.target.value as ServiceKind)}
                >
                  {(Object.keys(KIND_LABELS) as ServiceKind[]).map((k) => (
                    <option key={k} value={k}>
                      {KIND_LABELS[k]}
                    </option>
                  ))}
                </select>
              </label>

              <label className="sp-addon-field">
                <span className="neo-hud">SUMMARY</span>
                <input
                  className="neo-input neo-input--sm"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Recalibrate display wall or boost AC…"
                  required
                  data-qa="sp-req-title-input"
                />
              </label>

              <label className="sp-addon-field">
                <span className="neo-hud">FLOOR / ZONE / ROOM</span>
                <input
                  className="neo-input neo-input--sm"
                  value={where}
                  onChange={(e) => setWhere(e.target.value)}
                  placeholder="e.g. Room Nebula · L41"
                />
              </label>

              <label className="sp-addon-field">
                <span className="neo-hud">PRIORITY</span>
                <select
                  className="neo-input neo-input--sm"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as ServicePriority)}
                >
                  <option value="low">Low (Next day)</option>
                  <option value="normal">Normal (4h SLA)</option>
                  <option value="high">High (Urgent 2h SLA)</option>
                </select>
              </label>

              <label className="sp-addon-field">
                <span className="neo-hud">DETAILS</span>
                <textarea
                  className="neo-input"
                  rows={3}
                  value={detail}
                  onChange={(e) => setDetail(e.target.value)}
                  placeholder="Additional notes for Workplace Ops or AV engineers…"
                />
              </label>

              <button
                type="submit"
                className="neo-btn neo-btn--plasma neo-btn--block"
                data-qa="sp-submit-request-btn"
              >
                <Plus />
                <span>Submit Facility Request</span>
              </button>
            </form>
          </NeoPanel>
        }
      />
    </div>
  );
}
