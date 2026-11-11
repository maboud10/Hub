/**
 * Helix Calendar — View 4: Smart Booking Links & Intelligent Routing
 * Auto-routed external & internal scheduling links integrated with
 * Helix CRM territories, Talent Hub interview panels, and People Ops 1:1s.
 */
import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { Copy, ExternalLink, Link2, Sparkles, ToggleLeft, ToggleRight } from 'lucide-react';
import { Avatars, Chip, NeoPanel } from '@/components/neo';
import { useHub } from '@/store/hub';
import { toast } from '@/store/toast';
import { ProjectSigil } from '@/projects/sigils';
import { useCalendar } from '@/calendar/store';

export function LinksView() {
  const navigate = useNavigate();
  const users = useHub((s) => s.users);
  const bookingLinks = useCalendar((s) => s.bookingLinks);
  const toggleBookingLink = useCalendar((s) => s.toggleBookingLink);
  const simulateBookingFromLink = useCalendar((s) => s.simulateBookingFromLink);

  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  const handleCopy = (slug: string) => {
    try {
      navigator.clipboard?.writeText(`https://${slug}`);
    } catch {
      // ignore
    }
    toast.success('Copied Smart Booking Link', `https://${slug}`);
  };

  return (
    <div className="cal-view">
      <NeoPanel
        hud="INTELLIGENT ROUTING & EXTERNAL SCHEDULING · ZERO EMAIL PING-PONG"
        title="Smart Booking Links & Territory Routers"
      >
        <div className="cal-links-grid">
          {bookingLinks.map((lnk) => {
            const hosts = lnk.hostIds
              .map((id) => userMap.get(id))
              .filter((u): u is NonNullable<typeof u> => Boolean(u));

            return (
              <div key={lnk.id} className="cal-link-card" data-qa={`cal-link-${lnk.id}`}>
                <div className="cal-link-card__head">
                  <ProjectSigil icon={lnk.sigil} color={lnk.color} size={40} />
                  <div className="cal-link-card__info">
                    <div className="cal-link-card__top">
                      <span className="neo-mono cal-link-slug">
                        <Link2 /> {lnk.slug}
                      </span>
                      <Chip tone={lnk.active ? 'emerald' : 'slate'} size="sm">
                        {lnk.active ? 'Active Router' : 'Paused'}
                      </Chip>
                    </div>
                    <h3 className="cal-link-card__title">{lnk.title}</h3>
                    <p className="cal-link-card__sub">{lnk.subtitle}</p>
                  </div>
                </div>

                <div className="cal-link-metrics">
                  <div>
                    <span className="neo-hud">DURATION & BUFFER</span>
                    <strong>
                      {lnk.durationMins}m + {lnk.bufferMins}m buffer
                    </strong>
                  </div>
                  <div>
                    <span className="neo-hud">ROUTING ENGINE</span>
                    <strong>{lnk.routingMode.replace('_', ' ').toUpperCase()}</strong>
                  </div>
                  <div>
                    <span className="neo-hud">30D BOOKINGS</span>
                    <strong>
                      {lnk.bookingsThisMonth} ({lnk.conversionPct}% conv)
                    </strong>
                  </div>
                </div>

                <div className="cal-link-card__foot">
                  <div className="cal-link-hosts">
                    <Avatars users={hosts} max={4} size={24} />
                    <span>Daily cap: {lnk.dailyCap}/day</span>
                  </div>

                  <div className="cal-link-actions">
                    <button
                      type="button"
                      className="neo-btn neo-btn--ghost neo-btn--xs"
                      onClick={() => toggleBookingLink(lnk.id)}
                    >
                      {lnk.active ? <ToggleRight /> : <ToggleLeft />}
                      <span>{lnk.active ? 'Active' : 'Enable'}</span>
                    </button>
                    <button
                      type="button"
                      className="neo-btn neo-btn--soft neo-btn--xs"
                      onClick={() => handleCopy(lnk.slug)}
                    >
                      <Copy />
                      <span>Copy Link</span>
                    </button>
                    <button
                      type="button"
                      className="neo-btn neo-btn--plasma neo-btn--xs"
                      onClick={() => {
                        simulateBookingFromLink(lnk.id);
                        navigate('/calendar');
                      }}
                      data-qa={`cal-sim-link-${lnk.id}`}
                    >
                      <Sparkles />
                      <span>Simulate Instant Booking</span>
                    </button>
                    {lnk.linkedApp && (
                      <button
                        type="button"
                        className="neo-btn neo-btn--ghost neo-btn--xs"
                        onClick={() => navigate(`/${lnk.linkedApp}`)}
                        title={`Open ${lnk.linkedApp}`}
                      >
                        <ExternalLink />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </NeoPanel>
    </div>
  );
}
