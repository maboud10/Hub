import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Hotel,
  Leaf,
  Plane,
  Plus,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
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
import { Avatar, EmptyState, Switch } from '@/components/ui/primitives';
import { toast } from '@/store/toast';
import { formatAed, TripStatusBadge, VirtualCorporateCard } from './shared';

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

  const tripDays = useMemo(() => {
    if (!depDate || !retDate || retDate < depDate) return 1;
    return Math.max(1, daysBetween(depDate, retDate) + 1);
  }, [depDate, retDate]);

  const applyPreset = (p: DestinationPreset) => {
    const nights = Math.max(1, tripDays - 1);
    setDestCity(p.city);
    setDestCountry(p.country);
    setFlightHours(p.flightHoursFromDubai);
    setPerDiemRateAed(p.perDiemAed);
    setEstFlightAed(cabinClass === 'business' ? Math.round(p.typicalFlightAed * 2.6) : p.typicalFlightAed);
    setEstHotelAed(p.typicalHotelNightAed * nights);
    setNeedsVisa(Boolean(p.visaHint));
  };

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

  return (
    <div className="stack stack--lg" style={{ minWidth: 0 }}>
      {/* Department Quarterly Travel Budget Meter */}
      <section className="ex-budget-card">
        <div className="row row--between row--wrap" style={{ gap: 12 }}>
          <div>
            <div className="row" style={{ gap: 8 }}>
              <Building2 style={{ width: 17, height: 17, color: 'var(--ex-ink)' }} />
              <h2 className="section-title" style={{ fontSize: 16 }}>
                {budget.dept} Quarterly Travel Budget
              </h2>
              <span className="badge badge--info mono">{budget.pct}% utilized</span>
            </div>
            <p className="text-xs muted" style={{ marginTop: 3 }}>
              Pre-approved, booked, and completed trips count against your department’s quarterly travel envelope.
            </p>
          </div>
          <button
            type="button"
            className="btn ex-btn-teal"
            onClick={() => setNewOpen(true)}
          >
            <Plus /> Request New Trip
          </button>
        </div>

        <div className="ex-meter-track">
          <div
            className={cx('ex-meter-fill', budget.pct >= 85 && 'ex-meter-fill--high')}
            style={{ width: `${budget.pct}%` }}
          />
        </div>

        <div className="row row--between row--wrap text-xs muted" style={{ gap: 10 }}>
          <span>
            Committed spend: <b className="mono" style={{ color: 'var(--text)' }}>{formatAed(budget.committedAed)}</b>
          </span>
          <span>
            Remaining headroom: <b className="mono" style={{ color: 'var(--ex-ink)' }}>{formatAed(budget.remainingAed)}</b>{' '}
            of {formatAed(budget.budgetAed)}
          </span>
        </div>
      </section>

      {/* Scope Filter Bar */}
      <div className="row row--between row--wrap" style={{ gap: 12 }}>
        <div className="chips" role="tablist" aria-label="Trip scope">
          <button
            type="button"
            className={cx('chip', scope === 'mine' && 'is-active')}
            onClick={() => setScope('mine')}
          >
            <Plane /> My Trips <span className="count">{myTrips.length}</span>
          </button>
          {(teamTrips.length > 0 || caps.canApprove || caps.canAudit) && (
            <button
              type="button"
              className={cx('chip', scope === 'team' && 'is-active')}
              onClick={() => setScope('team')}
            >
              <ShieldCheck /> Team &amp; Visible Trips <span className="count">{teamTrips.length}</span>
            </button>
          )}
        </div>
      </div>

      {/* Trips Grid */}
      {displayedTrips.length === 0 ? (
        <EmptyState
          icon={<Plane />}
          title={scope === 'mine' ? 'No trips requested yet' : 'No team trips to display'}
          action={
            scope === 'mine' ? (
              <button type="button" className="btn ex-btn-teal" onClick={() => setNewOpen(true)}>
                <Plus /> Request Travel Pre-Approval
              </button>
            ) : undefined
          }
        >
          {scope === 'mine'
            ? 'Choose a destination preset to benchmark flights, hotel nights, statutory per diem, and CO₂ in seconds.'
            : 'Direct reports’ and company travel requests appear here once submitted.'}
        </EmptyState>
      ) : (
        <div className="ex-trips-grid">
          {displayedTrips.map((trip) => {
            const reqUser = usersById.get(trip.userId);
            const preset = DESTINATION_PRESETS.find(
              (p) => p.city.toLowerCase() === trip.destinationCity.toLowerCase(),
            );
            const showVisaLink = Boolean(trip.needsVisaLetter || preset?.visaHint);
            const isMineOrAuditor = trip.userId === me?.id || caps.canAudit;
            const canDecide = canDecideTrip(viewer, trip, reqUser).ok;

            return (
              <article key={trip.id} className="ex-trip-card">
                {/* Top Header */}
                <div className="row row--between row--wrap" style={{ gap: 8 }}>
                  <div className="row" style={{ gap: 8, minWidth: 0 }}>
                    {reqUser && <Avatar user={reqUser} size={28} />}
                    <div style={{ minWidth: 0 }}>
                      <div className="text-xs mono muted">{trip.reference}</div>
                      {reqUser && scope === 'team' && (
                        <div className="text-xs" style={{ fontWeight: 600 }}>
                          {reqUser.name} · {trip.department}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="row row--wrap" style={{ gap: 6 }}>
                    <span className="badge badge--muted mono" title="Estimated roundtrip carbon footprint">
                      <Leaf /> {trip.co2Kg.toLocaleString()} kg CO₂
                    </span>
                    <TripStatusBadge status={trip.status} />
                  </div>
                </div>

                {/* Origin -> Destination Banner */}
                <div className="ex-route-banner">
                  <div style={{ minWidth: 0 }}>
                    <div className="ex-route-city">
                      {trip.originCity} <span style={{ color: 'var(--ex-ink)' }}>→</span> {trip.destinationCity}
                    </div>
                    <div className="text-xs muted">
                      {trip.destinationCountry} · {formatRange(trip.departureDate, trip.returnDate)} ({trip.days}d ·{' '}
                      {trip.cabinClass})
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flex: 'none' }}>
                    <div className="text-xs muted">Est. Total</div>
                    <div className="mono" style={{ fontWeight: 700, fontSize: 15, color: 'var(--ex-ink)' }}>
                      {formatAed(trip.totalEstimatedAed)}
                    </div>
                  </div>
                </div>

                {/* Title & Purpose */}
                <div>
                  <div style={{ fontWeight: 650, fontSize: 14.5 }}>{trip.title}</div>
                  <div className="text-xs muted" style={{ marginTop: 3 }}>
                    <span className="badge badge--muted" style={{ marginRight: 6 }}>
                      {TRIP_PURPOSE_META[trip.purpose]?.label ?? trip.purpose}
                    </span>
                    {trip.businessJustification}
                  </div>
                </div>

                {/* Estimated AED Breakdown */}
                <div className="ex-breakdown-strip">
                  <div className="ex-breakdown-cell">
                    <span>Flights</span>
                    <b>{formatAed(trip.estimatedFlightAed)}</b>
                  </div>
                  <div className="ex-breakdown-cell">
                    <span>Hotel</span>
                    <b>{formatAed(trip.estimatedHotelAed)}</b>
                  </div>
                  <div className="ex-breakdown-cell">
                    <span>Per Diem ({trip.days}d)</span>
                    <b>{formatAed(trip.estimatedPerDiemAed)}</b>
                  </div>
                  <div className="ex-breakdown-cell">
                    <span>Other</span>
                    <b>{formatAed(trip.estimatedOtherAed)}</b>
                  </div>
                </div>

                {/* Policy Flags */}
                {trip.policyFlags.length > 0 && (
                  <div className="ex-policy-box">
                    {trip.policyFlags.map((f, i) => (
                      <div key={i} className="row" style={{ gap: 6, alignItems: 'flex-start' }}>
                        <AlertTriangle style={{ width: 14, height: 14, color: 'var(--warning)', flex: 'none', marginTop: 2 }} />
                        <span>{f}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Booked Flight PNR & Hotel Confirmation */}
                {trip.itinerary && (
                  <div className="ex-itinerary-box">
                    <div className="row" style={{ gap: 7, minWidth: 0 }}>
                      <Plane style={{ width: 14, height: 14, color: 'var(--ex-ink)', flex: 'none' }} />
                      <span className="truncate">
                        <b>{trip.itinerary.airline}</b> · PNR{' '}
                        <code className="mono">{trip.itinerary.flightBookingRef}</code>
                      </span>
                    </div>
                    <div className="row" style={{ gap: 7, minWidth: 0 }}>
                      <Hotel style={{ width: 14, height: 14, color: 'var(--ex-ink)', flex: 'none' }} />
                      <span className="truncate">
                        {trip.itinerary.hotelName} (<code className="mono">{trip.itinerary.hotelConfirmation}</code>)
                      </span>
                    </div>
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
                  <Link to="/hr/documents?tab=letters" className="ex-visa-link">
                    <FileText /> Get Embassy NOC / Visa Letter in HR Portal → <ExternalLink />
                  </Link>
                )}

                {/* Decision Note if any */}
                {trip.decisionNote && (
                  <div className="text-xs muted">
                    <b>Manager note:</b> “{trip.decisionNote}”
                  </div>
                )}

                {/* 1-Click Contextual Actions */}
                <div className="row row--between row--wrap" style={{ gap: 8, marginTop: 'auto', paddingTop: 4 }}>
                  {trip.status === 'approved' && isMineOrAuditor && (
                    <button
                      type="button"
                      className="btn btn--sm ex-btn-teal"
                      onClick={() => setBookingTrip(trip)}
                    >
                      <Plane /> Book Flight &amp; Hotel Itinerary
                    </button>
                  )}

                  {trip.status === 'booked' && isMineOrAuditor && (
                    <div className="row row--wrap" style={{ gap: 8 }}>
                      <button
                        type="button"
                        className="btn btn--sm"
                        onClick={() => {
                          const res = completeTrip(trip.id);
                          toast.result(res, 'Trip marked completed');
                        }}
                      >
                        <CheckCircle2 /> Mark Trip Completed
                      </button>
                      {trip.userId === me?.id && (
                        <button
                          type="button"
                          className="btn btn--sm ex-btn-teal"
                          onClick={() => navigate(`/expenses/reports?tripId=${trip.id}`)}
                        >
                          <FileSpreadsheet /> Create Expense Report
                        </button>
                      )}
                    </div>
                  )}

                  {trip.status === 'completed' && trip.userId === me?.id && !trip.linkedReportId && (
                    <button
                      type="button"
                      className="btn btn--sm ex-btn-teal"
                      onClick={() => navigate(`/expenses/reports?tripId=${trip.id}`)}
                    >
                      <FileSpreadsheet /> Create Expense Report for Trip
                    </button>
                  )}

                  {trip.linkedReportId && (
                    <button
                      type="button"
                      className="btn btn--sm btn--ghost"
                      onClick={() => navigate('/expenses/reports')}
                    >
                      View Linked Expense Report <ArrowRight />
                    </button>
                  )}

                  {canDecide && (
                    <button
                      type="button"
                      className="btn btn--sm ex-btn-teal"
                      onClick={() => navigate('/expenses/approvals')}
                    >
                      Review Pre-Approval <ArrowRight />
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
        icon={<Plane style={{ width: 20, height: 20, color: 'var(--ex-ink)' }} />}
        title="Request Business Travel Pre-Approval"
        subtitle="Select a destination hub preset to benchmark flights, hotel nights, statutory per diem & CO₂."
        footer={
          <>
            <button type="button" className="btn" onClick={closeNewModal}>
              Cancel
            </button>
            <button type="button" className="btn ex-btn-teal" onClick={handleCreateTrip}>
              <Plane /> Submit for Pre-Approval ({formatAed(totalEstAed)})
            </button>
          </>
        }
      >
        <div className="stack">
          {/* Interactive Destination Preset Picker */}
          <div className="field">
            <span className="field-label">
              <Sparkles style={{ width: 13, height: 13, display: 'inline', marginRight: 5, color: 'var(--ex-ink)' }} />
              1-Click Destination Benchmark Presets
            </span>
            <div className="ex-preset-grid">
              {DESTINATION_PRESETS.map((p) => {
                const active = p.city.toLowerCase() === destCity.trim().toLowerCase();
                return (
                  <button
                    key={p.city}
                    type="button"
                    className={cx('ex-preset-btn', active && 'is-active')}
                    onClick={() => applyPreset(p)}
                  >
                    <b>{p.city}</b>
                    <span>
                      {p.currency} · PD {formatAed(p.perDiemAed)}/d
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="ex-form-grid">
            <label className="field">
              <span className="field-label">Origin City</span>
              <input
                className="input"
                value={originCity}
                onChange={(e) => setOriginCity(e.target.value)}
                placeholder="Dubai"
              />
            </label>
            <label className="field">
              <span className="field-label">Destination City &amp; Country</span>
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
              <span className="field-label">Departure Date</span>
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
              <span className="field-label">Return Date ({tripDays}d)</span>
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
              <span className="field-label">Trip Purpose</span>
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
              <span className="field-label">Cabin Class ({flightHours}h flight)</span>
              <select
                className="select"
                value={cabinClass}
                onChange={(e) => {
                  const nextCabin = e.target.value as CabinClass;
                  setCabinClass(nextCabin);
                  if (activePreset) {
                    setEstFlightAed(
                      nextCabin === 'business'
                        ? Math.round(activePreset.typicalFlightAed * 2.6)
                        : nextCabin === 'premium-economy'
                          ? Math.round(activePreset.typicalFlightAed * 1.45)
                          : activePreset.typicalFlightAed,
                    );
                  }
                }}
              >
                <option value="economy">Economy Standard</option>
                <option value="premium-economy">Premium Economy (6h+)</option>
                <option value="business">Business Class (VP / 6h+ policy)</option>
              </select>
            </label>
          </div>

          <label className="field">
            <span className="field-label">Trip Title</span>
            <input
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={`e.g. ${destCity} Customer Architecture Summit`}
            />
          </label>

          <label className="field">
            <span className="field-label">Business Justification &amp; Expected Outcome</span>
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
              <span className="field-label">Est. Flights (AED)</span>
              <input
                type="number"
                min={0}
                className="input mono"
                value={estFlightAed}
                onChange={(e) => setEstFlightAed(Number(e.target.value) || 0)}
              />
            </label>
            <label className="field">
              <span className="field-label">Est. Hotel Total (AED)</span>
              <input
                type="number"
                min={0}
                className="input mono"
                value={estHotelAed}
                onChange={(e) => setEstHotelAed(Number(e.target.value) || 0)}
              />
            </label>
            <label className="field">
              <span className="field-label">Per Diem Rate (AED/day × {tripDays}d = {formatAed(estPerDiemAed)})</span>
              <input
                type="number"
                min={0}
                className="input mono"
                value={perDiemRateAed}
                onChange={(e) => setPerDiemRateAed(Number(e.target.value) || 0)}
              />
            </label>
            <label className="field">
              <span className="field-label">Ground / Visa / Other (AED)</span>
              <input
                type="number"
                min={0}
                className="input mono"
                value={estOtherAed}
                onChange={(e) => setEstOtherAed(Number(e.target.value) || 0)}
              />
            </label>
          </div>

          <div className="row row--between row--wrap" style={{ gap: 10 }}>
            <div className="row" style={{ gap: 10 }}>
              <Switch
                checked={needsVisa}
                onChange={setNeedsVisa}
                label="Embassy NOC / Business Visa letter needed"
              />
              <span className="text-sm">Embassy NOC / Visa invitation letter needed</span>
            </div>
            <span className="badge badge--muted mono">
              <Leaf /> ~{estCo2Kg.toLocaleString()} kg CO₂ · {flightHours}h flight
            </span>
          </div>

          {needsVisa && (
            <Link to="/hr/documents?tab=letters" onClick={closeNewModal} className="ex-visa-link">
              <FileText /> Instant Embassy NOC Letter available in HR Portal → <ExternalLink />
            </Link>
          )}

          {/* Live Policy Preview */}
          <div className={cx('ex-policy-box', livePolicyFlags.length === 0 && 'ex-policy-box--ok')}>
            {livePolicyFlags.length === 0 ? (
              <div className="row" style={{ gap: 8 }}>
                <CheckCircle2 style={{ width: 16, height: 16, color: 'var(--success)', flex: 'none' }} />
                <span>
                  <b>100% Within Helix Travel Policy</b> — Advance booking window, cabin class, and budget threshold verified.
                </span>
              </div>
            ) : (
              livePolicyFlags.map((flag, idx) => (
                <div key={idx} className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
                  <AlertTriangle style={{ width: 15, height: 15, color: 'var(--warning)', flex: 'none', marginTop: 2 }} />
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
        icon={<Hotel style={{ width: 20, height: 20, color: 'var(--ex-ink)' }} />}
        title={bookingTrip ? `Confirm Itinerary · ${bookingTrip.destinationCity}` : 'Book Itinerary'}
        subtitle={
          bookingTrip
            ? `${bookingTrip.reference} · ${formatRange(bookingTrip.departureDate, bookingTrip.returnDate)} · Activates Duty-of-Care & Virtual Card`
            : undefined
        }
        footer={
          <>
            <button type="button" className="btn" onClick={closeBookingModal}>
              Cancel
            </button>
            <button type="button" className="btn ex-btn-teal" onClick={handleConfirmBooking}>
              <CheckCircle2 /> Confirm PNR &amp; Hotel
            </button>
          </>
        }
      >
        <div className="stack">
          <div className="ex-form-grid">
            <label className="field">
              <span className="field-label">Airline &amp; Flight #</span>
              <input
                className="input"
                value={airline}
                onChange={(e) => setAirline(e.target.value)}
                placeholder="Emirates · EK001"
              />
            </label>
            <label className="field">
              <span className="field-label">Airline PNR Reference</span>
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
              <span className="field-label">Hotel Property</span>
              <input
                className="input"
                value={hotelName}
                onChange={(e) => setHotelName(e.target.value)}
                placeholder="CitizenM Tower of London"
              />
            </label>
            <label className="field">
              <span className="field-label">Hotel Confirmation #</span>
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
