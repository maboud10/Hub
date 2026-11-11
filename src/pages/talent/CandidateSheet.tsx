/**
 * Candidate profile sheet — opened from anywhere with
 * `useTalentUI.getState().openCandidate(id)`. Right drawer on desktop, bottom
 * sheet on phones. Permission-aware: contact details are recruiter-only,
 * compensation is redacted without `talent.comp.view`, and only applications
 * on requisitions you can see are shown.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { useLocation } from 'react-router';
import { Archive, Ban, BriefcaseBusiness, Copy, History, IdCard, Linkedin, Lock, Mail, MapPin, NotebookPen, Phone, Send, ShieldCheck, SquareKanban, UserPlus, UserRoundX, X } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { EmailLink } from '@/components/apps/EmailLink';
import { EmptyState } from '@/components/ui/primitives';
import { useTalentUI } from '@/talent/ui';
import { useTalent } from '@/talent/store';
import { useTalentCaps, useTalentLookups, useTalentScope } from '@/talent/selectors';
import { stageIndex } from '@/talent/constants';
import type { Application } from '@/talent/types';
import { toast } from '@/store/toast';
import { useNow } from '@/hooks/useNow';
import { cx } from '@/lib/cx';
import { CandidateAvatar, SampleTag, SourceBadge } from './components/shared';
import { copyText } from './components/format';
import { ConsentBadge } from './pipeline/ConsentBadge';
import { SheetOverview } from './pipeline/SheetOverview';
import { SheetPipeline } from './pipeline/SheetPipeline';
import { SheetActivity, SheetNotes } from './pipeline/SheetTimeline';
import { CandidateJourneyTracker } from './trackers';

type SheetTab = 'overview' | 'pipeline' | 'activity' | 'notes';

const TABS: { id: SheetTab; label: string; icon: typeof IdCard }[] = [
  { id: 'overview', label: 'Overview', icon: IdCard },
  { id: 'pipeline', label: 'Pipeline', icon: SquareKanban },
  { id: 'activity', label: 'Activity', icon: History },
  { id: 'notes', label: 'Notes', icon: NotebookPen },
];

const appRank = (a: Application) => (a.status === 'active' ? 0 : a.status === 'hired' ? 1 : 2);

/** The primary application's journey — ticks once a minute, only while the Overview tab is shown. */
function PrimaryJourney({ app }: { app: Application }) {
  const now = useNow(60_000);
  return <CandidateJourneyTracker app={app} now={now} className="tl-sheet-journey" />;
}

export function CandidateSheet() {
  const id = useTalentUI((s) => s.candidateId);
  const close = useTalentUI((s) => s.closeCandidate);
  // Escape / scrim / swipe: Modal and Sheet both listen for Escape on window, so
  // when a dialog is stacked on the profile let it close first (one layer per press).
  const dismiss = useCallback(() => {
    if (useTalentUI.getState().modal || document.querySelector('body > .modal')) return;
    close();
  }, [close]);
  const location = useLocation();
  const caps = useTalentCaps();
  const scope = useTalentScope();
  const { reqById } = useTalentLookups();
  const activity = useTalent((s) => s.activity);

  // Keep showing the last candidate while the sheet animates out.
  const [lastId, setLastId] = useState<string | null>(id);
  useEffect(() => {
    if (id) setLastId(id);
  }, [id]);
  const cid = id ?? lastId;

  const [tab, setTab] = useState<SheetTab>('overview');
  useEffect(() => {
    if (!id) return;
    const p = location.pathname;
    setTab(p.startsWith('/talent/pipeline') || p.startsWith('/talent/requisitions/') || p.startsWith('/talent/interviews') || p.startsWith('/talent/offers') ? 'pipeline' : 'overview');
    // Only when a (different) candidate is opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const cand = useMemo(() => (cid ? scope.candidates.find((c) => c.id === cid) : undefined), [scope.candidates, cid]);
  const apps = useMemo(
    () =>
      scope.applications
        .filter((a) => a.candidateId === cid)
        .sort((a, b) => appRank(a) - appRank(b) || stageIndex(b.stage) - stageIndex(a.stage) || b.updatedAt - a.updatedAt),
    [scope.applications, cid],
  );
  const primary = apps.find((a) => a.status === 'active') ?? apps[0];
  const noteCount = useMemo(
    () => (cid ? activity.filter((a) => a.kind === 'note' && a.candidateId === cid && (caps.manage || !a.requisitionId || scope.reqIds.has(a.requisitionId))).length : 0),
    [activity, cid, caps.manage, scope.reqIds],
  );

  const tabRefs = useRef<Partial<Record<SheetTab, HTMLButtonElement | null>>>({});
  const onTabKey = (e: KeyboardEvent, i: number) => {
    const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const next = TABS[(i + dir + TABS.length) % TABS.length].id;
    setTab(next);
    tabRefs.current[next]?.focus();
  };

  const canSource = caps.manage || caps.source;
  const dnc = cand?.status === 'do-not-contact';
  const first = cand?.name.split(' ')[0] ?? '';

  const copy = async (label: string, value: string) => {
    if (await copyText(value)) toast.success(`${label} copied`);
    else toast.error(`Couldn’t copy the ${label.toLowerCase()}`);
  };

  const header = cand ? (
    <div className="tl-sheet-head" style={{ '--cand-h': cand.avatarHue } as CSSProperties}>
      <div className="tl-sheet-head__glow" aria-hidden="true" />
      <div className="tl-sheet-head__top">
        <span className="tl-sheet-head__avatar">
          <CandidateAvatar person={cand} size={58} />
        </span>
        <div className="tl-sheet-head__id">
          <div className="tl-sheet-head__namerow">
            <h2 className="tl-sheet-head__name">{cand.name}</h2>
            {cand.sample && <SampleTag />}
          </div>
          <p className="tl-sheet-head__headline">{cand.headline || `${cand.currentTitle} at ${cand.currentCompany}`}</p>
          <div className="tl-sheet-head__meta">
            <span className="tl-sheet-head__fact">
              <MapPin aria-hidden="true" />
              {cand.location}
            </span>
            <span className="tl-sheet-head__fact">
              <BriefcaseBusiness aria-hidden="true" />
              {cand.yearsExperience} yrs
            </span>
            <SourceBadge source={cand.source} detail={cand.sourceDetail} />
            <ConsentBadge consent={cand.consent} />
            {cand.openToWork && <span className="badge badge--success">Open to work</span>}
            {cand.status === 'archived' && (
              <span className="badge badge--muted">
                <Archive aria-hidden="true" /> Archived
              </span>
            )}
            {dnc && (
              <span className="badge badge--danger">
                <Ban aria-hidden="true" /> Do not contact
              </span>
            )}
          </div>
        </div>
        <button type="button" className="icon-btn icon-btn--sm tl-sheet-head__close" onClick={close} aria-label="Close profile">
          <X />
        </button>
      </div>

      <div className="tl-sheet-contact">
        {caps.contact ? (
          <>
            {cand.email && (
              <span className="tl-sheet-contact__item">
                <EmailLink to={cand.email}>
                  <Mail aria-hidden="true" />
                  <span className="truncate">{cand.email}</span>
                </EmailLink>
                <button type="button" className="tl-sheet-contact__copy" onClick={() => copy('Email', cand.email!)} aria-label="Copy email address">
                  <Copy aria-hidden="true" />
                </button>
              </span>
            )}
            {cand.phone && (
              <span className="tl-sheet-contact__item">
                <a href={`tel:${cand.phone.replace(/\s+/g, '')}`}>
                  <Phone aria-hidden="true" />
                  {cand.phone}
                </a>
                <button type="button" className="tl-sheet-contact__copy" onClick={() => copy('Phone number', cand.phone!)} aria-label="Copy phone number">
                  <Copy aria-hidden="true" />
                </button>
              </span>
            )}
            {!cand.email && !cand.phone && <span className="tl-sheet-contact__none">No contact details yet</span>}
          </>
        ) : (
          <span className="tl-sheet-contact__locked">
            <Lock aria-hidden="true" /> Contact details are visible to recruiters
          </span>
        )}
        {cand.linkedinUrl && !cand.sample && (
          <span className="tl-sheet-contact__item">
            <a href={cand.linkedinUrl} target="_blank" rel="noopener noreferrer">
              <Linkedin aria-hidden="true" />
              LinkedIn profile
            </a>
          </span>
        )}
      </div>

      <div className="tabs tl-sheet-tabs" role="tablist" aria-label="Candidate profile">
        {TABS.map((t, i) => {
          const Icon = t.icon;
          const count = t.id === 'pipeline' ? apps.length : t.id === 'notes' ? noteCount : null;
          return (
            <button
              key={t.id}
              ref={(el) => {
                tabRefs.current[t.id] = el;
              }}
              type="button"
              role="tab"
              id={`tl-sheet-tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`tl-sheet-panel-${t.id}`}
              tabIndex={tab === t.id ? 0 : -1}
              className={cx('tab', tab === t.id && 'is-active')}
              onClick={() => setTab(t.id)}
              onKeyDown={(e) => onTabKey(e, i)}
            >
              <Icon aria-hidden="true" />
              {t.label}
              {count ? <span className="tl-sheet-tabs__count">{count}</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  ) : (
    <div className="sheet__head">
      <h2 className="sheet__title grow">Candidate</h2>
      <button type="button" className="icon-btn icon-btn--sm" onClick={close} aria-label="Close">
        <X />
      </button>
    </div>
  );

  const footer =
    cand && canSource ? (
      <div className="tl-sheet-foot">
        <button
          type="button"
          className="btn btn--primary"
          disabled={dnc}
          title={dnc ? `${first} asked not to be contacted` : undefined}
          onClick={() => useTalentUI.getState().openModal({ kind: 'outreach', candidateId: cand.id, requisitionId: primary?.requisitionId ?? null })}
        >
          <Send aria-hidden="true" /> Draft outreach
        </button>
        <button type="button" className="btn" disabled={dnc} onClick={() => useTalentUI.getState().openModal({ kind: 'add-to-pipeline', candidateId: cand.id })}>
          <UserPlus aria-hidden="true" /> Add to pipeline
        </button>
        {!cand.consent.given && (
          <button type="button" className="btn btn--ghost" onClick={() => useTalentUI.getState().openModal({ kind: 'consent', candidateId: cand.id })}>
            <ShieldCheck aria-hidden="true" /> Record consent
          </button>
        )}
      </div>
    ) : undefined;

  const primaryReq = primary ? reqById.get(primary.requisitionId) : undefined;

  return (
    <Sheet open={!!id} onClose={dismiss} width={600} header={header} footer={footer} className="tl-sheet" label={cand ? `${cand.name}, candidate profile` : 'Candidate profile'}>
      {!cand ? (
        <EmptyState icon={<UserRoundX />} title="Profile not available">
          This candidate isn’t in your talent pool or hiring teams, or the profile was removed.
        </EmptyState>
      ) : (
        <div role="tabpanel" id={`tl-sheet-panel-${tab}`} aria-labelledby={`tl-sheet-tab-${tab}`} className="tl-sheet-panel" key={`${cand.id}-${tab}`}>
          {tab === 'overview' && (
            <SheetOverview cand={cand} match={primary?.match ?? null} matchFor={primaryReq?.title} journey={primary ? <PrimaryJourney app={primary} /> : undefined} />
          )}
          {tab === 'pipeline' && <SheetPipeline cand={cand} apps={apps} />}
          {tab === 'activity' && <SheetActivity cand={cand} apps={apps} />}
          {tab === 'notes' && <SheetNotes cand={cand} apps={apps} />}
        </div>
      )}
    </Sheet>
  );
}
