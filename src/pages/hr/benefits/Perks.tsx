/**
 * Perks & wellbeing (with the confidential Employee Assistance Programme front
 * and centre) and a gentle "Life event?" section that routes new babies and
 * weddings straight into the enrolment wizard, or to Ask People Ops.
 */
import { useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router';
import { Baby, Copy, Gem, HeartHandshake, Lock, MessageCircleQuestion, Phone, ShieldCheck, Sparkles, Video, type LucideIcon } from 'lucide-react';
import { PERKS, type PerkMeta } from '@/hr/constants';
import { toast } from '@/store/toast';
import { Modal } from '@/components/ui/Modal';
import { copyText } from '@/pages/talent/components/format';
import { HrPanel } from '../components/shared';
import type { LifeEvent } from './model';

const EAP_CODE = 'HELIXCARE';

export function PerksPanel() {
  const [eap, setEap] = useState(false);
  return (
    <HrPanel className="hr-bn-perks-panel" hud="Included for everyone" title="Perks & wellbeing" icon={<Sparkles aria-hidden="true" />} sub="Always on. No forms, no approvals.">
      <div className="hr-bn-perks">
        {PERKS.map((p) => (p.id === 'eap' ? <EapCard key={p.id} perk={p} onOpen={() => setEap(true)} /> : <PerkCard key={p.id} perk={p} />))}
      </div>
      <EapModal open={eap} onClose={() => setEap(false)} />
    </HrPanel>
  );
}

function PerkCard({ perk }: { perk: PerkMeta }) {
  const Icon = perk.icon;
  return (
    <article className="hr-bn-perk" style={{ '--pk-h': perk.hue } as CSSProperties}>
      <span className="hr-bn-perk__icon" aria-hidden="true">
        <Icon />
      </span>
      <h3 className="hr-bn-perk__title">{perk.label}</h3>
      <p className="hr-bn-perk__desc">{perk.description}</p>
      <p className="hr-bn-perk__detail">{perk.detail}</p>
    </article>
  );
}

function EapCard({ perk, onOpen }: { perk: PerkMeta; onOpen: () => void }) {
  const Icon = perk.icon;
  return (
    <article className="hr-bn-perk hr-bn-perk--eap" style={{ '--pk-h': perk.hue } as CSSProperties}>
      <span className="hr-bn-perk__icon" aria-hidden="true">
        <Icon />
      </span>
      <div className="hr-bn-perk__eap-body">
        <span className="hr-bn-perk__flag">
          <Lock aria-hidden="true" /> 100% confidential
        </span>
        <h3 className="hr-bn-perk__title">{perk.label}</h3>
        <p className="hr-bn-perk__desc">{perk.description}</p>
        <p className="hr-bn-perk__detail">{perk.detail}</p>
        <div className="row row--wrap">
          <button type="button" className="btn btn--primary btn--sm" onClick={onOpen}>
            <HeartHandshake aria-hidden="true" /> Get confidential support
          </button>
          <span className="text-xs faint">Free · 24/7 · 20+ languages</span>
        </div>
      </div>
    </article>
  );
}

function EapModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const copy = async () => {
    if (await copyText(EAP_CODE)) toast.success('Access code copied', 'Use it to register anonymously with the EAP.');
    else toast.error('Couldn’t copy the code', EAP_CODE);
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      width={560}
      className="hr-bn-eap-modal"
      title="Talk to someone, any time"
      subtitle="Licensed counsellors for you and your family: stress, grief, relationships, money worries or anything else."
      icon={
        <span className="hr-bn-modal-icon" aria-hidden="true">
          <HeartHandshake />
        </span>
      }
      footer={
        <>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              onClose();
              navigate('/hr?ask=1');
            }}
          >
            <MessageCircleQuestion aria-hidden="true" /> Talk to People Ops instead
          </button>
          <button type="button" className="btn btn--primary" onClick={onClose}>
            Done
          </button>
        </>
      }
    >
      <div className="hr-bn-eap">
        <p className="hr-bn-eap__privacy">
          <ShieldCheck aria-hidden="true" />
          <span>
            <b>Helix never sees who uses the EAP.</b> No names, no employee IDs, nothing logged in NEXUS. Opening this window isn’t recorded either.
          </span>
        </p>
        <div className="hr-bn-eap__code">
          <span className="stat-label">Your access code</span>
          <code>{EAP_CODE}</code>
          <button type="button" className="btn btn--sm" onClick={copy}>
            <Copy aria-hidden="true" /> Copy
          </button>
        </div>
        <ul className="hr-bn-eap__ways">
          <li>
            <Phone aria-hidden="true" />
            <span>
              <b>Call the 24/7 line</b> listed in the EAP app and give your access code.
            </span>
          </li>
          <li>
            <Video aria-hidden="true" />
            <span>
              <b>Book a video or in-person session</b>, 8 free sessions a year for you and each family member.
            </span>
          </li>
          <li>
            <MessageCircleQuestion aria-hidden="true" />
            <span>
              <b>Chat in the app</b> if talking feels like too much right now.
            </span>
          </li>
        </ul>
        <p className="hr-bn-eap__crisis">If you or someone else is in immediate danger, contact your local emergency services now.</p>
      </div>
    </Modal>
  );
}

interface LifeCard {
  id: string;
  icon: LucideIcon;
  emoji: string;
  title: string;
  text: string;
  primary: { label: string; run: () => void };
  secondary?: { label: string; run: () => void };
}

export function LifeEvents({ onEnrol }: { onEnrol: (event?: LifeEvent) => void }) {
  const navigate = useNavigate();
  const cards: LifeCard[] = [
    {
      id: 'baby',
      icon: Baby,
      emoji: '👶',
      title: 'New baby',
      text: 'Congratulations! Add your little one to your health cover within 30 days, and plan your parental leave.',
      primary: { label: 'Add to my cover', run: () => onEnrol('baby') },
      secondary: { label: 'Plan parental leave', run: () => navigate('/hr/time-off?new=1&type=parental') },
    },
    {
      id: 'marriage',
      icon: Gem,
      emoji: '💍',
      title: 'Getting married',
      text: 'Add your spouse to your cover. People Ops can help with family sponsorship and visas too.',
      primary: { label: 'Add my spouse', run: () => onEnrol('marriage') },
      secondary: { label: 'Ask People Ops', run: () => navigate('/hr?ask=1') },
    },
    {
      id: 'other',
      icon: HeartHandshake,
      emoji: '🤝',
      title: 'Something else',
      text: 'Moving, caring for family or going through a loss? Talk to us in confidence and we’ll sort out the details.',
      primary: { label: 'Ask People Ops', run: () => navigate('/hr?ask=1') },
    },
  ];
  return (
    <HrPanel className="hr-bn-life-panel" hud="Qualifying changes" title="Life event?" icon={<Sparkles aria-hidden="true" />} sub="Big moments change what you need. Update everything in one go.">
      <div className="hr-bn-events">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <article key={c.id} className="hr-bn-evt">
              <span className="hr-bn-evt__emoji" aria-hidden="true">
                {c.emoji}
              </span>
              <div className="grow">
                <h3 className="hr-bn-evt__title">
                  <Icon aria-hidden="true" /> {c.title}
                </h3>
                <p className="text-sm muted">{c.text}</p>
                <div className="hr-bn-evt__actions">
                  <button type="button" className="btn btn--sm" onClick={c.primary.run}>
                    {c.primary.label}
                  </button>
                  {c.secondary && (
                    <button type="button" className="btn btn--ghost btn--sm" onClick={c.secondary.run}>
                      {c.secondary.label}
                    </button>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </HrPanel>
  );
}
