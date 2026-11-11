import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Hotel,
  Leaf,
  Plane,
  Sparkles,
  TriangleAlert,
  Users,
} from 'lucide-react';
import { Bar, Chip, NeoEmpty, NeoPanel, NeoTabs, type NeoTabItem } from '@/components/neo';
import { cx } from '@/lib/cx';
import { addDaysISO, daysBetween, formatRange, todayISO } from '@/hr/calendar';
import { canDecideTrip, canSeeTrip } from '@/expenses/access';
import {
  DESTINATION_PRESETS,
  evaluateTripPolicy,
  TRIP_PURPOSE_META,
  type DestinationPreset,
} from '@/expenses/constants';
import { useExpenses } from '@/expenses/store';
import {
  useDeptTravelBudget,
  useExpensesCaps,
  useExpensesViewer,
} from '@/expenses/selectors';
import type { CabinClass, TravelRequest, TripPurpose } from '@/expenses/types';
import { useHub } from '@/store/hub';
import { useSessionUser } from '@/store/selectors';
import { Modal } from '@/components/ui/Modal';
import { Avatar, Switch } from '@/components/ui/primitives';
import { toast } from '@/store/toast';
import { readTripDraft, TRIP_DRAFT_KEYS, type TripDraft } from './nova';
import { formatAed, TripStatusBadge, VirtualCorporateCard } from './shared';
import { TripTracker, useSpendTrackCtx } from './trackers';

const CABIN_LABEL: Record<CabinClass, string> = {
  economy: 'Economy',
  'premium-economy': 'Premium economy',
  business: 'Business',
};

/** Benchmark airfare for a cabin (business ≈ 2.6×, premium ≈ 1.45× economy). */
const cabinFare = (economyAed: number, cabin: CabinClass) =>
  cabin === 'business' ? Math.round(economyAed * 2.6) : cabin === 'premium-economy' ? Math.round(economyAed * 1.45) : economyAed;

export function TravelDeskView() {
  const me = useSessionUser();
  const viewer = useExpensesViewer();
  const caps = useExpensesCaps();
  const users = useHub((s) => s.users);
  const trips = useExpenses((s) => s.trips);
  const requestTravel = useExpenses((s) => s.requestTravel);
  const bookTravelItinerary = useExpenses((s) => s.bookTravelItinerary);
  const completeTrip = useExpenses((s) => s.completeTrip);
  const budget = useDeptTravelBudget();
  const trackCtx = useSpendTrackCtx();

  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [scope, setScope] = useState<'mine' | 'team'>('mine');
  const [newOpen, setNewOpen] = useState(false);
  const [bookingTrip, setBookingTrip] = useState<TravelRequest | null>(null);

  // Sync URL ?new=1 and ?book=<tripId>
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setNewOpen(true);
    }
    const bookId = searchParams.get('book');
    if (bookId) {
      const found = trips.find((t) => t.id === bookId);
      if (found) setBookingTrip(found);
    }
  }, [searchParams, trips]);

  const closeNewModal = () => {
    setNewOpen(false);
    if (searchParams.has('new')) {
      const next = new URLSearchParams(searchParams);
      next.delete('new');
      setSearchParams(next, { replace: true });
    }
  };

  const closeBookingModal = () => {
    setBookingTrip(null);
    if (searchParams.has('book')) {
      const next = new URLSearchParams(searchParams);
      next.delete('book');
      setSearchParams(next, { replace: true });
    }
  };

  const usersById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  const { myTrips, teamTrips } = useMemo(() => {
    const mine: TravelRequest[] = [];
    const team: TravelRequest[] = [];
    for (const t of trips) {
      const reqUser = usersById.get(t.userId);
      if (!canSeeTrip(viewer, t, reqUser)) continue;
      if (t.userId === me?.id) mine.push(t);
      else team.push(t);
    }
    return { myTrips: mine, teamTrips: team };
  }, [trips, usersById, viewer, me?.id]);

  const displayedTrips = scope === 'mine' ? myTrips : teamTrips;
  const showTeamTab = teamTrips.length > 0 || caps.canApprove || caps.canAudit;
  const scopeTabs: NeoTabItem<'mine' | 'team'>[] = [
    { value: 'mine', label: 'My trips', icon: <Plane />, count: myTrips.length },
    ...(showTeamTab ? [{ value: 'team' as const, label: 'Team & visible', icon: <Users />, count: teamTrips.length }] : []),
  ];

  // ── Request Travel Modal State ──
  const defaultOrigin = useMemo(
    () => me?.location.split('·')[0].trim() || 'Dubai',
    [me?.location],
  );
  const initialPreset = DESTINATION_PRESETS[0]; // London
  const [originCity, setOriginCity] = useState(defaultOrigin);
  const [destCity, setDestCity] = useState(initialPreset.city);
  const [destCountry, setDestCountry] = useState(initialPreset.country);
  const [depDate, setDepDate] = useState(() => addDaysISO(todayISO(), 14));
  const [retDate, setRetDate] = useState(() => addDaysISO(todayISO(), 17));
  const [purpose, setPurpose] = useState<TripPurpose>('client-summit');
  const [cabinClass, setCabinClass] = useState<CabinClass>('economy');
  const [title, setTitle] = useState('');
  const [justification, setJustification] = useState('');
  const [flightHours, setFlightHours] = useState(initialPreset.flightHoursFromDubai);
  const [estFlightAed, setEstFlightAed] = useState(initialPreset.typicalFlightAed);
  const [estHotelAed, setEstHotelAed] = useState(initialPreset.typicalHotelNightAed * 3);
  const [perDiemRateAed, setPerDiemRateAed] = useState(initialPreset.perDiemAed);
  const [estOtherAed, setEstOtherAed] = useState(320);
  const [needsVisa, setNeedsVisa] = useState(Boolean(initialPreset.visaHint));
  const [novaDrafted, setNovaDrafted] = useState(false);

  const tripDays = useMemo(() => {
    if (!depDate || !retDate || retDate < depDate) return 1;
    return Math.max(1, daysBetween(depDate, retDate) + 1);
  }, [depDate, retDate]);

  const applyPreset = (p: DestinationPreset, nights = Math.max(1, tripDays - 1), cabin = cabinClass) => {
    setDestCity(p.city);
    setDestCountry(p.country);
    setFlightHours(p.flightHoursFromDubai);
    setPerDiemRateAed(p.perDiemAed);
    setEstFlightAed(cabinFare(p.typicalFlightAed, cabin));
    setEstHotelAed(p.typicalHotelNightAed * nights);
    setNeedsVisa(Boolean(p.visaHint));
  };

  // Nova hand-off: ?new=1&dest=London&depart=…&ret=…&purpose=…&title=…&why=…&cabin=…
  const appliedDraft = useRef('');
  useEffect(() => {
    const draft: Partial<TripDraft> | null = readTripDraft(searchParams);
    if (!draft) return;
    const key = searchParams.toString();
    if (appliedDraft.current === key) return;
    appliedDraft.current = key;

    const dep = draft.departureDate ?? depDate;
    const ret = draft.returnDate && draft.returnDate >= dep ? draft.returnDate : addDaysISO(dep, 3);
    const cabin = draft.cabin ?? cabinClass;
    setDepDate(dep);
    setRetDate(ret);
    setCabinClass(cabin);
    if (draft.city) {
      const preset = DESTINATION_PRESETS.find((p) => p.city.toLowerCase() === draft.city?.toLowerCase());
      if (preset) applyPreset(preset, Math.max(1, daysBetween(dep, ret)), cabin);
      else {
        setDestCity(draft.city);
        setDestCountry(draft.country ?? '');
      }
    }
    if (draft.purpose) setPurpose(draft.purpose);
    if (draft.title) setTitle(draft.title);
    if (draft.justification) setJustification(draft.justification);
    setNovaDrafted(true);
    setNewOpen(true);

    const next = new URLSearchParams(searchParams);
    for (const k of TRIP_DRAFT_KEYS) next.delete(k);
    next.set('new', '1');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const activePreset = useMemo(
    () => DESTINATION_PRESETS.find((p) => p.city.toLowerCase() === destCity.trim().toLowerCase()),
    [destCity],
  );

  const estPerDiemAed = Math.round(tripDays * perDiemRateAed);
  const totalEstAed = Math.round(estFlightAed + estHotelAed + estPerDiemAed + estOtherAed);
  const estCo2Kg = activePreset?.co2KgRoundtrip ?? Math.round(flightHours * 210);

  const livePolicyFlags = useMemo(
    () =>
      evaluateTripPolicy({
        departureDate: depDate,
        today: todayISO(),
        cabinClass,
        flightHours,
        totalEstimatedAed: totalEstAed,
      }),
    [depDate, cabinClass, flightHours, totalEstAed],
  );

  const handleCreateTrip = () => {
    const res = requestTravel({
      originCity,
      destinationCity: destCity,
      destinationCountry: destCountry,
      departureDate: depDate,
      returnDate: retDate,
      purpose,
      title,
      businessJustification: justification,
      cabinClass,
      flightHours,
      estimatedFlightAed: estFlightAed,
      estimatedHotelAed: estHotelAed,
      perDiemRateAed,
      estimatedOtherAed: estOtherAed,
      needsVisaLetter: needsVisa,
    });
    if (toast.result(res, 'Travel request submitted')) {
      setTitle('');
      setJustification('');
      setNovaDrafted(false);
      setScope('mine');
      closeNewModal();
    }
  };

  // ── Book Itinerary Modal State ──
  const [airline, setAirline] = useState('Emirates · EK003');
  const [pnr, setPnr] = useState('EK-84M2Q');
  const [hotelName, setHotelName] = useState('');
  const [hotelConf, setHotelConf] = useState('HTL-59204');

  useEffect(() => {
    if (bookingTrip) {
      setAirline(
        bookingTrip.destinationCity === 'Singapore'
          ? 'Singapore Airlines · SQ495'
          : bookingTrip.destinationCity === 'London'
            ? 'Emirates · EK001'
            : 'Emirates · EK045',
      );
      setPnr(`HX-${bookingTrip.reference.slice(-4)}P`);
      setHotelName(`${bookingTrip.destinationCity} Partner Executive Hotel`);
      setHotelConf(`CONF-${bookingTrip.reference.slice(-4)}`);
    }
  }, [bookingTrip]);

  const handleConfirmBooking = () => {
    if (!bookingTrip) return;
    const res = bookTravelItinerary(bookingTrip.id, {
      airline,
      flightBookingRef: pnr,
      hotelName,
      hotelConfirmation: hotelConf,
    });
    if (toast.result(res, 'Flight & hotel itinerary confirmed')) {
      closeBookingModal();
    }
  };

  const quarter = `Q${Math.floor(new Date().getMonth() / 3) + 1}`;

  return (
    <div className="neo-stack">
      {/* Department Quarterly Travel Budget */}
      <NeoPanel
        hud={`${quarter} travel pool`}
        title={`${budget.dept} travel budget`}
        icon={<Building2 />}
        actions={
          <Chip tone={budget.pct >= 85 ? 'warning' : 'app'} size="sm">
            {budget.pct}% committed
          </Chip>
        }
      >
        <Bar
          value={budget.pct / 100}
          height={8}
          fill={budget.pct >= 85 ? 'linear-gradient(90deg, #f59e0b, #ef4444)' : undefined}
          label={`${budget.pct}% of the ${budget.dept} travel pool committed`}
        />
        <div className="ex-budget-row">
          <span>
            Committed <b className="neo-mono">{formatAed(budget.committedAed)}</b>
          </span>
          <span>
            Headroom <b className="neo-mono neo-tint">{formatAed(budget.remainingAed)}</b> of {formatAed(budget.budgetAed)}
          </span>
        </div>
        <p className="ex-hint">Pre-approved, booked and completed trips count against your department’s quarterly envelope.</p>
      </NeoPanel>

      {/* Scope switcher */}
      {scopeTabs.length > 1 && (
        <div className="ex-toolbar">
          <NeoTabs value={scope} onChange={setScope} items={scopeTabs} label="Trip scope" />
        </div>
      )}

      {/* Trips Grid */}
      {displayedTrips.length === 0 ? (
        <NeoPanel>
          <NeoEmpty
            icon={<Plane />}
            title={scope === 'mine' ? 'No trips requested yet' : 'No team trips to show'}
            action={
              scope === 'mine' ? (
                <button type="button" className="neo-btn neo-btn--plasma" onClick={() => setNewOpen(true)}>
                  <Plane /> Request travel pre-approval
                </button>
              ) : undefined
            }
          >
            {scope === 'mine'
              ? 'Pick a destination preset to benchmark flights, hotel nights, statutory per diem and CO₂ in seconds.'
              : 'Direct reports’ and company travel requests appear here once submitted.'}
          </NeoEmpty>
        </NeoPanel>
      ) : (
        <div className="ex-trips neo-stagger">
          {displayedTrips.map((trip, i) => {
            const reqUser = usersById.get(trip.userId);
            const preset = DESTINATION_PRESETS.find(
              (p) => p.city.toLowerCase() === trip.destinationCity.toLowerCase(),
            );
            const showVisaLink = Boolean(trip.needsVisaLetter || preset?.visaHint);
            const isMineOrAuditor = trip.userId === me?.id || caps.canAudit;
            const canDecide = canDecideTrip(viewer, trip, reqUser).ok;

            return (
              <article key={trip.id} className="ex-trip" style={{ ['--i' as string]: i }}>
                {/* Top Header */}
                <header className="ex-trip__head">
                  {reqUser && <Avatar user={reqUser} size={30} />}
                  <div className="ex-trip__who">
                    <span className="ex-trip__ref neo-mono">{trip.reference}</span>
                    {reqUser && scope === 'team' && (
                      <span className="ex-trip__name">
                        {reqUser.name} · {trip.department}
                      </span>
                    )}
                  </div>
                  <div className="ex-chips ex-trip__chips">
                    <Chip size="sm" icon={<Leaf />} title="Estimated roundtrip carbon footprint">
                      {trip.co2Kg.toLocaleString()} kg CO₂
                    </Chip>
                    <TripStatusBadge status={trip.status} size="sm" />
                  </div>
                </header>

                {/* Origin → Destination */}
                <div className="ex-route">
                  <div className="ex-route__leg">
                    <span className="ex-route__city">{trip.originCity}</span>
                    <span className="ex-route__arc" aria-hidden="true">
                      <Plane />
                    </span>
                    <span className="ex-route__city ex-route__city--to">{trip.destinationCity}</span>
                  </div>
                  <div className="ex-route__foot">
                    <span className="ex-route__meta">
                      {trip.destinationCountry} · {formatRange(trip.departureDate, trip.returnDate)} · {trip.days}d · {CABIN_LABEL[trip.cabinClass]}
                    </span>
                    <span className="ex-route__total">
                      <span className="neo-hud">Est. total</span>
                      <b className="neo-num">{formatAed(trip.totalEstimatedAed)}</b>
                    </span>
                  </div>
                </div>

                {/* Live approval → booking → travel → expensed journey */}
                <TripTracker trip={trip} ctx={trackCtx} />

                {/* Title & Purpose */}
                <div className="ex-trip__title">
                  <b>{trip.title}</b>
                  <div className="ex-trip__why">
                    <Chip size="sm" tone="app">
                      {TRIP_PURPOSE_META[trip.purpose]?.label ?? trip.purpose}
                    </Chip>
                    <span>{trip.businessJustification}</span>
                  </div>
                </div>

                {/* Estimated AED Breakdown */}
                <div className="ex-breakdown">
                  <div>
                    <span>Flights</span>
                    <b>{formatAed(trip.estimatedFlightAed)}</b>
                  </div>
                  <div>
                    <span>Hotel</span>
                    <b>{formatAed(trip.estimatedHotelAed)}</b>
                  </div>
                  <div>
                    <span>Per diem · {trip.days}d</span>
                    <b>{formatAed(trip.estimatedPerDiemAed)}</b>
                  </div>
                  <div>
                    <span>Other</span>
                    <b>{formatAed(trip.estimatedOtherAed)}</b>
                  </div>
                </div>

                {/* Policy Flags */}
                {trip.policyFlags.length > 0 && (
                  <div className="ex-callout" data-tone="warning">
                    {trip.policyFlags.map((f, idx) => (
                      <div key={idx} className="ex-callout__row">
                        <TriangleAlert />
                        <span>{f}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Booked Flight PNR & Hotel Confirmation */}
                {trip.itinerary && (
                  <div className="ex-itin">
                    <span className="truncate">
                      <Plane /> <b>{trip.itinerary.airline}</b> · PNR <code className="neo-mono">{trip.itinerary.flightBookingRef}</code>
                    </span>
                    <span className="truncate">
                      <Hotel /> {trip.itinerary.hotelName} · <code className="neo-mono">{trip.itinerary.hotelConfirmation}</code>
                    </span>
                  </div>
                )}

                {/* Scoped Virtual Corporate Card */}
                {trip.virtualCard && (
                  <VirtualCorporateCard
                    card={trip.virtualCard}
                    holderName={reqUser?.name}
                    tripLabel={trip.destinationCity}
                    compact
                  />
                )}

                {/* Embassy NOC / Visa Letter Deep Link */}
                {showVisaLink && (
                  <Link to="/hr/documents?tab=letters" className="ex-link">
                    <FileText /> Embassy NOC / visa letter in HR Portal <ExternalLink />
                  </Link>
                )}

                {/* Decision Note if any */}
                {trip.decisionNote && (
                  <p className="ex-quote">
                    <b>Manager note</b> “{trip.decisionNote}”
                  </p>
                )}

                {/* 1-Click Contextual Actions */}
                <div className="ex-trip__actions">
                  {trip.status === 'approved' && isMineOrAuditor && (
                    <button
                      type="button"
                      className="neo-btn neo-btn--plasma neo-btn--sm"
                      onClick={() => setBookingTrip(trip)}
                    >
                      <Plane /> Book flight & hotel
                    </button>
                  )}

                  {trip.status === 'booked' && isMineOrAuditor && (
                    <>
                      <button
                        type="button"
                        className="neo-btn neo-btn--sm"
                        onClick={() => {
                          const res = completeTrip(trip.id);
                          toast.result(res, 'Trip marked completed');
                        }}
                      >
                        <CheckCircle2 /> Mark completed
                      </button>
                      {trip.userId === me?.id && (
                        <button
                          type="button"
                          className="neo-btn neo-btn--plasma neo-btn--sm"
                          onClick={() => navigate(`/expenses/reports?tripId=${trip.id}`)}
                        >
                          <FileSpreadsheet /> Expense report
                        </button>
                      )}
                    </>
                  )}

                  {trip.status === 'completed' && trip.userId === me?.id && !trip.linkedReportId && (
                    <button
                      type="button"
                      className="neo-btn neo-btn--plasma neo-btn--sm"
                      onClick={() => navigate(`/expenses/reports?tripId=${trip.id}`)}
                    >
                      <FileSpreadsheet /> Expense this trip
                    </button>
                  )}

                  {trip.linkedReportId && (
                    <button
                      type="button"
                      className="neo-btn neo-btn--ghost neo-btn--sm"
                      onClick={() => navigate('/expenses/reports')}
                    >
                      Linked report <ArrowRight />
                    </button>
                  )}

                  {canDecide && (
                    <button
                      type="button"
                      className="neo-btn neo-btn--soft neo-btn--sm"
                      onClick={() => navigate('/expenses/approvals')}
                    >
                      Review pre-approval <ArrowRight />
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* ── Request Travel Modal ── */}
      <Modal
        open={newOpen}
        onClose={closeNewModal}
        width={680}
        className="ex-modal"
        icon={
          <span className="ex-modal__icon" aria-hidden="true">
            <Plane />
          </span>
        }
        title="Request travel pre-approval"
        subtitle="Pick a destination preset to benchmark flights, hotel nights, statutory per diem & CO₂."
        footer={
          <>
            <button type="button" className="neo-btn" onClick={closeNewModal}>
              Cancel
            </button>
            <button type="button" className="neo-btn neo-btn--plasma" onClick={handleCreateTrip}>
              <Plane /> Submit for pre-approval · {formatAed(totalEstAed)}
            </button>
          </>
        }
      >
        <div className="stack">
          {novaDrafted && (
            <div className="ex-callout" data-tone="app">
              <div className="ex-callout__row">
                <Sparkles />
                <span>
                  <b>Drafted by Nova</b> — destination, dates, purpose and justification are filled in from your note. Check the estimate, then submit.
                </span>
              </div>
            </div>
          )}

          {/* Interactive Destination Preset Picker */}
          <div className="field">
            <span className="field-label">
              <Sparkles className="ex-inline-icon" />
              One-click destination benchmarks
            </span>
            <div className="ex-presets">
              {DESTINATION_PRESETS.map((p) => {
                const active = p.city.toLowerCase() === destCity.trim().toLowerCase();
                return (
                  <button
                    key={p.city}
                    type="button"
                    className={cx('ex-preset', active && 'is-active')}
                    aria-pressed={active}
                    onClick={() => applyPreset(p)}
                  >
                    <b>{p.city}</b>
                    <span>
                      {p.currency} · {formatAed(p.perDiemAed)}/d
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="ex-form-grid">
            <label className="field">
              <span className="field-label">Origin city</span>
              <input
                className="input"
                value={originCity}
                onChange={(e) => setOriginCity(e.target.value)}
                placeholder="Dubai"
              />
            </label>
            <label className="field">
              <span className="field-label">Destination city & country</span>
              <div className="row" style={{ gap: 8 }}>
                <input
                  className="input"
                  value={destCity}
                  onChange={(e) => setDestCity(e.target.value)}
                  placeholder="London"
                />
                <input
                  className="input"
                  value={destCountry}
                  onChange={(e) => setDestCountry(e.target.value)}
                  placeholder="United Kingdom"
                />
              </div>
            </label>
          </div>

          <div className="ex-form-grid">
            <label className="field">
              <span className="field-label">Departure date</span>
              <input
                type="date"
                className="input"
                value={depDate}
                onChange={(e) => {
                  const nextDep = e.target.value;
                  setDepDate(nextDep);
                  if (retDate < nextDep) setRetDate(addDaysISO(nextDep, 3));
                }}
              />
            </label>
            <label className="field">
              <span className="field-label">Return date ({tripDays}d)</span>
              <input
                type="date"
                className="input"
                value={retDate}
                min={depDate}
                onChange={(e) => setRetDate(e.target.value)}
              />
            </label>
          </div>

          <div className="ex-form-grid">
            <label className="field">
              <span className="field-label">Trip purpose</span>
              <select
                className="select"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value as TripPurpose)}
              >
                {(Object.keys(TRIP_PURPOSE_META) as TripPurpose[]).map((k) => (
                  <option key={k} value={k}>
                    {TRIP_PURPOSE_META[k].label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Cabin class ({flightHours}h flight)</span>
              <select
                className="select"
                value={cabinClass}
                onChange={(e) => {
                  const nextCabin = e.target.value as CabinClass;
                  setCabinClass(nextCabin);
                  if (activePreset) setEstFlightAed(cabinFare(activePreset.typicalFlightAed, nextCabin));
                }}
              >
                <option value="economy">Economy standard</option>
                <option value="premium-economy">Premium economy (6h+)</option>
                <option value="business">Business class (VP / 6h+ policy)</option>
              </select>
            </label>
          </div>

          <label className="field">
            <span className="field-label">Trip title</span>
            <input
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={`e.g. ${destCity} Customer Architecture Summit`}
            />
          </label>

          <label className="field">
            <span className="field-label">Business justification & expected outcome</span>
            <textarea
              className="textarea"
              style={{ minHeight: 74 }}
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              placeholder="Explain customer, engineering, or OKR impact so your manager can sign off quickly..."
            />
          </label>

          {/* Estimated Cost & Per-Diem Inputs */}
          <div className="ex-form-grid">
            <label className="field">
              <span className="field-label">Est. flights (AED)</span>
              <input
                type="number"
                min={0}
                className="input mono"
                value={estFlightAed}
                onChange={(e) => setEstFlightAed(Number(e.target.value) || 0)}
              />
            </label>
            <label className="field">
              <span className="field-label">Est. hotel total (AED)</span>
              <input
                type="number"
                min={0}
                className="input mono"
                value={estHotelAed}
                onChange={(e) => setEstHotelAed(Number(e.target.value) || 0)}
              />
            </label>
            <label className="field">
              <span className="field-label">Per diem (AED/day × {tripDays}d = {formatAed(estPerDiemAed)})</span>
              <input
                type="number"
                min={0}
                className="input mono"
                value={perDiemRateAed}
                onChange={(e) => setPerDiemRateAed(Number(e.target.value) || 0)}
              />
            </label>
            <label className="field">
              <span className="field-label">Ground / visa / other (AED)</span>
              <input
                type="number"
                min={0}
                className="input mono"
                value={estOtherAed}
                onChange={(e) => setEstOtherAed(Number(e.target.value) || 0)}
              />
            </label>
          </div>

          <div className="ex-switch-row">
            <div className="row" style={{ gap: 10 }}>
              <Switch
                checked={needsVisa}
                onChange={setNeedsVisa}
                label="Embassy NOC / Business Visa letter needed"
              />
              <span className="text-sm">Embassy NOC / visa invitation letter needed</span>
            </div>
            <Chip size="sm" icon={<Leaf />}>
              ~{estCo2Kg.toLocaleString()} kg CO₂ · {flightHours}h flight
            </Chip>
          </div>

          {needsVisa && (
            <Link to="/hr/documents?tab=letters" onClick={closeNewModal} className="ex-link">
              <FileText /> Instant embassy NOC letter in HR Portal <ExternalLink />
            </Link>
          )}

          {/* Live Policy Preview */}
          <div className="ex-callout" data-tone={livePolicyFlags.length === 0 ? 'success' : 'warning'}>
            {livePolicyFlags.length === 0 ? (
              <div className="ex-callout__row">
                <CheckCircle2 />
                <span>
                  <b>Within Helix travel policy</b> — booking window, cabin class and budget threshold verified.
                </span>
              </div>
            ) : (
              livePolicyFlags.map((flag, idx) => (
                <div key={idx} className="ex-callout__row">
                  <TriangleAlert />
                  <span>{flag}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </Modal>

      {/* ── Book Flight & Hotel Itinerary Modal ── */}
      <Modal
        open={Boolean(bookingTrip)}
        onClose={closeBookingModal}
        width={520}
        className="ex-modal"
        icon={
          <span className="ex-modal__icon" aria-hidden="true">
            <Hotel />
          </span>
        }
        title={bookingTrip ? `Confirm itinerary · ${bookingTrip.destinationCity}` : 'Book itinerary'}
        subtitle={
          bookingTrip
            ? `${bookingTrip.reference} · ${formatRange(bookingTrip.departureDate, bookingTrip.returnDate)} · activates duty-of-care & virtual card`
            : undefined
        }
        footer={
          <>
            <button type="button" className="neo-btn" onClick={closeBookingModal}>
              Cancel
            </button>
            <button type="button" className="neo-btn neo-btn--plasma" onClick={handleConfirmBooking}>
              <CheckCircle2 /> Confirm PNR & hotel
            </button>
          </>
        }
      >
        <div className="stack">
          <div className="ex-form-grid">
            <label className="field">
              <span className="field-label">Airline & flight #</span>
              <input
                className="input"
                value={airline}
                onChange={(e) => setAirline(e.target.value)}
                placeholder="Emirates · EK001"
              />
            </label>
            <label className="field">
              <span className="field-label">Airline PNR reference</span>
              <input
                className="input mono"
                value={pnr}
                onChange={(e) => setPnr(e.target.value)}
                placeholder="EK-84M2Q"
              />
            </label>
          </div>

          <div className="ex-form-grid">
            <label className="field">
              <span className="field-label">Hotel property</span>
              <input
                className="input"
                value={hotelName}
                onChange={(e) => setHotelName(e.target.value)}
                placeholder="CitizenM Tower of London"
              />
            </label>
            <label className="field">
              <span className="field-label">Hotel confirmation #</span>
              <input
                className="input mono"
                value={hotelConf}
                onChange={(e) => setHotelConf(e.target.value)}
                placeholder="CTM-50381"
              />
            </label>
          </div>

          {bookingTrip?.virtualCard && (
            <VirtualCorporateCard
              card={bookingTrip.virtualCard}
              holderName={me?.name}
              tripLabel={bookingTrip.destinationCity}
              compact
            />
          )}
        </div>
      </Modal>
    </div>
  );
}
