/**
 * Spaces — "Orbit · Desks, rooms, visitors & workplace pulse"
 * NEO shell for /spaces/* with 6 tabs (Today in the Office, Desk Map, Meeting
 * Rooms, Visitors & Badges, Service Requests, Workplace Insights), Pre-register
 * Visitor modal (`?new=1` on `/spaces/visitors`), and Nova Workplace drawer.
 */
import '@/styles/neo.css';
import '@/styles/spaces.css';
import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router';
import {
  BadgeCheck,
  BarChart3,
  Building2,
  CalendarClock,
  CalendarDays,
  MapPin,
  Plane,
  RotateCcw,
  Sparkles,
  UserPlus,
  Wrench,
  X,
} from 'lucide-react';
import {
  Chip,
  NeoAppFrame,
  type NeoNavItem,
  NovaChip,
  isNavActive,
} from '@/components/neo';
import { firstName, greeting } from '@/lib/format';
import { useHub } from '@/store/hub';
import { useSessionUser } from '@/store/selectors';
import {
  type NovaSpacesAction,
  type NovaSpacesResponse,
  askSpacesNova,
  defaultSiteForUser,
  formatDecimalHour,
} from '@/spaces/engine';
import {
  FALLBACK_CAL_ROOMS,
  SITES,
  SITE_BY_ID,
  buildFallbackTrips,
  buildRooms,
  siteDay,
  siteFromText,
} from '@/spaces/seed';
import { useSpaces } from '@/spaces/store';
import type {
  CalEventLite,
  CalRoomLite,
  SiteId,
  TripLite,
  VisitPurpose,
} from '@/spaces/types';
import { DesksView } from './DesksView';
import { InsightsView } from './InsightsView';
import { RequestsView } from './RequestsView';
import { RoomsView } from './RoomsView';
import { TodayView } from './TodayView';
import { VisitorsView } from './VisitorsView';
import { SiteSelectorBar, SpacesUiCtx } from './parts';

const SPACES_TINT = { c1: '#e879f9', c2: '#a855f7' };

interface SectionMeta {
  to: string;
  end?: boolean;
  icon: ReactNode;
  eyebrow: string;
  title: string;
  sub: string;
}

const SECTIONS: SectionMeta[] = [
  {
    to: '/spaces',
    end: true,
    icon: <Building2 />,
    eyebrow: 'Spaces deck',
    title: 'Today in the Office',
    sub: 'See who is in each hub today, reserve a desk near your team, check air quality and manage your workplace pass.',
  },
  {
    to: '/spaces/desks',
    icon: <MapPin />,
    eyebrow: 'Spaces deck · Desk Map',
    title: 'Interactive Desk Map',
    sub: '24×14 architectural floor plans with "Sit near my team" recommendations, dual-4K & window filters, EV charging and smart lockers.',
  },
  {
    to: '/spaces/rooms',
    icon: <CalendarClock />,
    eyebrow: 'Spaces deck · Meeting Rooms',
    title: 'Meeting Rooms & Telemetry',
    sub: 'Find and book HoloMeet boardrooms, huddles and focus pods with live CO₂, temperature and acoustic scores synced to Calendar.',
  },
  {
    to: '/spaces/visitors',
    icon: <BadgeCheck />,
    eyebrow: 'Spaces deck · Visitors & Badges',
    title: 'Visitors & Badges',
    sub: 'Pre-register guests with a 5-stage badge-to-checkout journey, digital NDA verification, watchlist screening and printable QR passes.',
  },
  {
    to: '/spaces/requests',
    icon: <Wrench />,
    eyebrow: 'Spaces deck · Service Requests',
    title: 'Facility & AV Service Requests',
    sub: 'Track HVAC, HoloMeet AV calibration, catering and smart locker tickets with a 5-stage live SLA tracker.',
  },
  {
    to: '/spaces/insights',
    icon: <BarChart3 />,
    eyebrow: 'Spaces deck · Workplace Insights',
    title: 'Workplace Insights & GreenOps',
    sub: 'Live occupancy, check-in rates, ghost-desk reclamation and hybrid carbon & energy savings across Dubai, London, Singapore and New York.',
  },
];

export function SpacesPage() {
  const me = useSessionUser();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const users = useHub((s) => s.users);

  const siteByUser = useSpaces((s) => s.siteByUser);
  const setStoreSite = useSpaces((s) => s.setSite);
  const bookings = useSpaces((s) => s.bookings);
  const visitors = useSpaces((s) => s.visitors);
  const requests = useSpaces((s) => s.requests);
  const bookDesk = useSpaces((s) => s.bookDesk);
  const releaseGhostDesks = useSpaces((s) => s.releaseGhostDesks);
  const registerVisitor = useSpaces((s) => s.registerVisitor);
  const resetDemo = useSpaces((s) => s.resetDemo);

  const activeSite: SiteId = useMemo(() => {
    const qSite = siteFromText(params.get('site'));
    if (qSite) return qSite;
    if (me?.id && siteByUser[me.id]) return siteByUser[me.id];
    return defaultSiteForUser(me);
  }, [params, me, siteByUser]);

  const [dayOffset, setDayOffset] = useState<number>(0);
  const date = useMemo(() => siteDay(activeSite, dayOffset), [activeSite, dayOffset]);

  const setSite = useCallback(
    (s: SiteId) => {
      if (me?.id) setStoreSite(me.id, s);
    },
    [me?.id, setStoreSite],
  );

  // Lazy-load live Calendar spatial rooms & events + Travel & Expenses trips
  const [calRooms, setCalRooms] = useState<CalRoomLite[]>(FALLBACK_CAL_ROOMS);
  const [calEvents, setCalEvents] = useState<CalEventLite[]>([]);
  const [trips, setTrips] = useState<TripLite[]>(() => buildFallbackTrips());

  useEffect(() => {
    let alive = true;
    import('@/calendar/store')
      .then(({ useCalendar }) => {
        if (!alive) return;
        const st = useCalendar.getState();
        if (st.rooms?.length) setCalRooms(st.rooms as unknown as CalRoomLite[]);
        if (st.events?.length) setCalEvents(st.events as unknown as CalEventLite[]);
      })
      .catch(() => {
        // Fallback already populated
      });

    import('@/expenses/store')
      .then(({ useExpenses }) => {
        if (!alive) return;
        const st = useExpenses.getState();
        if (st.trips?.length) {
          const mapped: TripLite[] = st.trips.flatMap((t) => {
            const sId = siteFromText(t.destinationCity);
            if (!sId) return [];
            return [
              {
                id: t.id,
                reference: t.reference,
                userId: t.userId,
                city: SITE_BY_ID[sId].city,
                site: sId,
                from: t.departureDate,
                to: t.returnDate,
                title: t.title,
                source: 'expenses' as const,
              },
            ];
          });
          if (mapped.length > 0) {
            setTrips([...mapped, ...buildFallbackTrips()]);
          }
        }
      })
      .catch(() => {
        // Fallback already populated
      });

    return () => {
      alive = false;
    };
  }, []);

  const rooms = useMemo(() => buildRooms(calRooms), [calRooms]);

  // Pre-register Visitor Modal (`?new=1` on `/spaces/visitors`)
  const [visitorModalOpen, setVisitorModalOpen] = useState(false);
  useEffect(() => {
    if (params.get('new') === '1') {
      setVisitorModalOpen(true);
    }
  }, [params]);

  const openVisitorModal = useCallback(() => setVisitorModalOpen(true), []);
  const closeVisitorModal = useCallback(() => {
    setVisitorModalOpen(false);
    if (params.has('new')) {
      const next = new URLSearchParams(params);
      next.delete('new');
      setParams(next, { replace: true });
    }
  }, [params, setParams]);

  // Visitor modal form state
  const [vName, setVName] = useState('');
  const [vCompany, setVCompany] = useState('');
  const [vEmail, setVEmail] = useState('');
  const [vSite, setVSite] = useState<SiteId>(activeSite);
  const [vHour, setVHour] = useState<number>(11);
  const [vPurpose, setVPurpose] = useState<VisitPurpose>('meeting');
  const [vNote, setVNote] = useState('');
  const [vNda, setVNda] = useState<boolean>(true);
  const [vParking, setVParking] = useState<boolean>(false);

  useEffect(() => {
    setVSite(activeSite);
  }, [activeSite]);

  const handleCreateVisitor = (e: FormEvent) => {
    e.preventDefault();
    if (!me || !vName.trim()) return;
    const created = registerVisitor({
      hostId: me.id,
      name: vName.trim(),
      company: vCompany.trim() || 'Partner Guest',
      email: vEmail.trim() || undefined,
      site: vSite,
      dayOffset,
      hour: vHour,
      purpose: vPurpose,
      note: vNote.trim() || undefined,
      ndaRequired: vNda,
      parking: vParking,
    });
    setVName('');
    setVCompany('');
    setVEmail('');
    setVNote('');
    closeVisitorModal();
    navigate(`/spaces/visitors?visitor=${created.id}`);
  };

  // Nova Workplace Drawer state
  const [novaDrawerOpen, setNovaDrawerOpen] = useState(false);
  const [novaInput, setNovaInput] = useState('');
  const [novaResult, setNovaResult] = useState<NovaSpacesResponse | null>(null);

  const openNovaDrawer = useCallback(
    (initialPrompt?: string) => {
      setNovaDrawerOpen(true);
      const q = initialPrompt ?? 'Sit near my team';
      setNovaInput(q);
      if (me) {
        setNovaResult(
          askSpacesNova(q, {
            viewer: me,
            site: activeSite,
            date,
            bookings,
            visitors,
            requests,
            rooms,
            users,
          }),
        );
      }
    },
    [me, activeSite, date, bookings, visitors, requests, rooms, users],
  );

  const handleRunNovaDrawer = (q: string) => {
    if (!me || !q.trim()) return;
    setNovaInput(q);
    setNovaResult(
      askSpacesNova(q, {
        viewer: me,
        site: activeSite,
        date,
        bookings,
        visitors,
        requests,
        rooms,
        users,
      }),
    );
  };

  const handleNovaDrawerAction = (act: NovaSpacesAction) => {
    if (!me) return;
    if (act.kind === 'book_desk') {
      bookDesk({
        userId: me.id,
        site: act.site,
        deskId: act.deskId,
        date,
        checkInNow: dayOffset === 0,
      });
      setNovaDrawerOpen(false);
    } else if (act.kind === 'book_room') {
      setNovaDrawerOpen(false);
      navigate(`/spaces/rooms?room=${act.roomId}`);
    } else if (act.kind === 'release_ghosts') {
      releaseGhostDesks(act.site, date);
      setNovaDrawerOpen(false);
    } else if (act.kind === 'open_visitor_modal') {
      setNovaDrawerOpen(false);
      openVisitorModal();
    } else if (act.kind === 'navigate') {
      setNovaDrawerOpen(false);
      navigate(act.to);
    }
  };

  const waitingVisitorsCount = visitors.filter(
    (v) => v.stage === 'arrived' || (v.watch && !v.watch.cleared),
  ).length;
  const openRequestsCount = requests.filter(
    (r) => r.stage !== 'done' && r.stage !== 'cancelled',
  ).length;

  const items: NeoNavItem[] = [
    {
      to: '/spaces',
      label: 'Today in the Office',
      icon: <Building2 />,
      end: true,
      title: 'Live office presence, workplace pass & Nova copilot',
    },
    {
      to: '/spaces/desks',
      label: 'Desk Map',
      icon: <MapPin />,
      title: 'Interactive floor plan & Sit near my team recommender',
    },
    {
      to: '/spaces/rooms',
      label: 'Meeting Rooms',
      icon: <CalendarClock />,
      title: 'HoloMeet rooms with live CO₂, temp & acoustic scores',
    },
    {
      to: '/spaces/visitors',
      label: 'Visitors & Badges',
      icon: <BadgeCheck />,
      badge: waitingVisitorsCount || null,
      badgeTone: visitors.some((v) => v.watch && !v.watch.cleared) ? 'danger' : 'app',
      title: 'Visitor 5-stage tracker & printable QR badges',
    },
    {
      to: '/spaces/requests',
      label: 'Service Requests',
      icon: <Wrench />,
      badge: openRequestsCount || null,
      title: 'Facility & AV requests with 5-stage SLA tracker',
    },
    {
      to: '/spaces/insights',
      label: 'Workplace Insights',
      icon: <BarChart3 />,
      title: 'Occupancy, ghost-desk sweep & carbon saved',
    },
  ];

  const section = SECTIONS.find((s) => isNavActive(s, pathname)) ?? SECTIONS[0];
  const isHome = section.to === '/spaces';

  const headActions = (
    <>
      <button
        type="button"
        className="neo-btn neo-btn--soft"
        onClick={resetDemo}
        title="Reset Spaces demo data"
      >
        <RotateCcw />
        <span className="neo-btn__label">Reset Demo</span>
      </button>
      <button
        type="button"
        className="neo-btn neo-btn--plasma"
        onClick={openVisitorModal}
        data-qa="sp-head-visitor-btn"
      >
        <UserPlus />
        <span className="neo-btn__label">Pre-register Visitor</span>
      </button>
    </>
  );

  const overlays = (
    <>
      {/* Pre-register Visitor Modal */}
      {visitorModalOpen && (
        <div className="sp-modal-backdrop" role="dialog" aria-modal="true" aria-label="Pre-register Visitor">
          <div className="sp-modal neo-plane">
            <header className="sp-modal__head">
              <div>
                <div className="neo-hud">ORBIT FRONT DESK & SECURITY</div>
                <h2 className="sp-modal__title">Pre-register a Visitor</h2>
              </div>
              <button
                type="button"
                className="neo-iconbtn"
                onClick={closeVisitorModal}
                aria-label="Close modal"
              >
                <X />
              </button>
            </header>

            <form className="sp-modal__body" onSubmit={handleCreateVisitor}>
              <div className="sp-form-grid">
                <label className="sp-addon-field">
                  <span className="neo-hud">VISITOR FULL NAME</span>
                  <input
                    className="neo-input"
                    value={vName}
                    onChange={(e) => setVName(e.target.value)}
                    placeholder="e.g. Tariq Al-Ghamdi"
                    required
                    autoFocus
                    data-qa="sp-visitor-name-input"
                  />
                </label>

                <label className="sp-addon-field">
                  <span className="neo-hud">COMPANY / ORGANIZATION</span>
                  <input
                    className="neo-input"
                    value={vCompany}
                    onChange={(e) => setVCompany(e.target.value)}
                    placeholder="e.g. Emirates Sovereign Cloud"
                    data-qa="sp-visitor-company-input"
                  />
                </label>

                <label className="sp-addon-field">
                  <span className="neo-hud">GUEST EMAIL (FOR QR PASS)</span>
                  <input
                    type="email"
                    className="neo-input"
                    value={vEmail}
                    onChange={(e) => setVEmail(e.target.value)}
                    placeholder="guest@company.com"
                  />
                </label>

                <label className="sp-addon-field">
                  <span className="neo-hud">OFFICE HUB</span>
                  <select
                    className="neo-input"
                    value={vSite}
                    onChange={(e) => setVSite(e.target.value as SiteId)}
                  >
                    {SITES.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label} ({s.building})
                      </option>
                    ))}
                  </select>
                </label>

                <label className="sp-addon-field">
                  <span className="neo-hud">ARRIVAL TIME (LOCAL)</span>
                  <select
                    className="neo-input"
                    value={vHour}
                    onChange={(e) => setVHour(Number(e.target.value))}
                  >
                    {[8.5, 9, 9.5, 10, 10.5, 11, 11.5, 13, 14, 15, 16, 17].map((h) => (
                      <option key={h} value={h}>
                        {formatDecimalHour(h)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="sp-addon-field">
                  <span className="neo-hud">VISIT PURPOSE</span>
                  <select
                    className="neo-input"
                    value={vPurpose}
                    onChange={(e) => setVPurpose(e.target.value as VisitPurpose)}
                  >
                    <option value="meeting">Executive / Partner Meeting</option>
                    <option value="interview">Candidate Interview</option>
                    <option value="contractor">Vendor / Contractor</option>
                    <option value="event">Workshop / Event</option>
                    <option value="delivery">Courier / Delivery</option>
                  </select>
                </label>
              </div>

              <label className="sp-addon-field">
                <span className="neo-hud">RECEPTION & ESCORT NOTES</span>
                <input
                  className="neo-input"
                  value={vNote}
                  onChange={(e) => setVNote(e.target.value)}
                  placeholder="Room name or dietary preferences…"
                />
              </label>

              <div className="sp-modal__checks">
                <label className="sp-checkbox-row">
                  <input
                    type="checkbox"
                    checked={vNda}
                    onChange={(e) => setVNda(e.target.checked)}
                  />
                  <span>Require digital NDA signature before badge print</span>
                </label>
                <label className="sp-checkbox-row">
                  <input
                    type="checkbox"
                    checked={vParking}
                    onChange={(e) => setVParking(e.target.checked)}
                  />
                  <span>Reserve VIP visitor parking bay & gate QR</span>
                </label>
              </div>

              <footer className="sp-modal__foot">
                <button
                  type="button"
                  className="neo-btn neo-btn--ghost"
                  onClick={closeVisitorModal}
                >
                  <span>Cancel</span>
                </button>
                <button
                  type="submit"
                  className="neo-btn neo-btn--plasma"
                  data-qa="sp-visitor-submit-btn"
                >
                  <BadgeCheck />
                  <span>Issue QR Pass & Pre-register</span>
                </button>
              </footer>
            </form>
          </div>
        </div>
      )}

      {/* Nova Workplace Copilot Drawer */}
      {novaDrawerOpen && (
        <div className="sp-modal-backdrop" role="dialog" aria-modal="true" aria-label="Nova Workplace Copilot">
          <div className="sp-drawer neo-plane">
            <header className="sp-modal__head">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <NovaChip>Nova Orbit</NovaChip>
                <h2 className="sp-modal__title">Workplace Spatial Copilot</h2>
              </div>
              <button
                type="button"
                className="neo-iconbtn"
                onClick={() => setNovaDrawerOpen(false)}
                aria-label="Close Nova drawer"
              >
                <X />
              </button>
            </header>

            <div className="sp-drawer__body">
              <form
                className="sp-drawer__form"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleRunNovaDrawer(novaInput);
                }}
              >
                <input
                  className="neo-input"
                  value={novaInput}
                  onChange={(e) => setNovaInput(e.target.value)}
                  placeholder="Ask Nova about desks, rooms, CO₂, or ghost desks…"
                />
                <button type="submit" className="neo-btn neo-btn--plasma">
                  <Sparkles />
                  <span>Ask</span>
                </button>
              </form>

              <div className="sp-chip-row">
                {[
                  'Sit near my team',
                  'Find me a desk near Omar',
                  'Book a HoloMeet room for 6',
                  'Release ghost desks',
                  'Air quality & carbon pulse',
                ].map((q) => (
                  <Chip key={q} tone="violet" onClick={() => handleRunNovaDrawer(q)}>
                    {q}
                  </Chip>
                ))}
              </div>

              {novaResult && (
                <div className="sp-nova-result" aria-live="polite">
                  <div className="sp-nova-result__head">
                    <strong>{novaResult.headline}</strong>
                    <Chip tone="cyan" size="sm">
                      {novaResult.confidence}
                    </Chip>
                  </div>
                  <p className="sp-nova-result__body">{novaResult.body}</p>
                  <ul className="sp-nova-result__bullets">
                    {novaResult.bullets.map((b, idx) => (
                      <li key={idx}>{b}</li>
                    ))}
                  </ul>
                  <div className="sp-nova-result__actions">
                    {novaResult.actions.map((act, idx) => (
                      <button
                        key={idx}
                        type="button"
                        className={
                          idx === 0
                            ? 'neo-btn neo-btn--sm neo-btn--plasma'
                            : 'neo-btn neo-btn--sm neo-btn--soft'
                        }
                        onClick={() => handleNovaDrawerAction(act)}
                      >
                        <Sparkles />
                        <span>{act.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );

  const ctxValue = useMemo(
    () => ({
      site: activeSite,
      setSite,
      dayOffset,
      setDayOffset,
      date,
      rooms,
      calEvents,
      trips,
      openVisitorModal,
      openNovaDrawer,
    }),
    [
      activeSite,
      setSite,
      dayOffset,
      date,
      rooms,
      calEvents,
      trips,
      openVisitorModal,
      openNovaDrawer,
    ],
  );

  return (
    <SpacesUiCtx.Provider value={ctxValue}>
      <NeoAppFrame
        app="spaces"
        tint={SPACES_TINT}
        className="spaces-page"
        brand={{ icon: <Building2 />, label: 'Orbit Spaces', to: '/spaces' }}
        items={items}
        footer={[
          {
            to: '/calendar',
            label: 'Calendar',
            icon: <CalendarDays />,
            title: 'Open Helix Calendar',
          },
          {
            to: '/expenses/travel',
            label: 'Travel',
            icon: <Plane />,
            title: 'Open Travel & Expenses',
          },
        ]}
        head={{
          icon: section.icon,
          eyebrow: section.eyebrow,
          title: isHome ? `${greeting()}${me ? `, ${firstName(me.name)}` : ''}` : section.title,
          sub: section.sub,
          actions: headActions,
        }}
        toolbar={<SiteSelectorBar userId={me?.id ?? 'u-layla'} />}
        overlays={overlays}
      >
        <Routes>
          <Route index element={<TodayView />} />
          <Route path="desks" element={<DesksView />} />
          <Route path="rooms" element={<RoomsView />} />
          <Route path="visitors" element={<VisitorsView />} />
          <Route path="requests" element={<RequestsView />} />
          <Route path="insights" element={<InsightsView />} />
          <Route path="*" element={<Navigate to="/spaces" replace />} />
        </Routes>
      </NeoAppFrame>
    </SpacesUiCtx.Provider>
  );
}

export default SpacesPage;
