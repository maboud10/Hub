/**
 * Helix Calendar — View 3: Smart Rooms & Spatial Pods
 * Real-time CO2, Acoustic dB, Temperature, and Holo-Array telemetry across
 * Dubai Atrium, London Shoreditch, and Singapore Marina with 1-click booking.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Cpu, ShieldCheck, Thermometer, Users, Video, Volume2, Wind } from 'lucide-react';
import { Chip, NeoPanel, NeoTabs, NovaChip } from '@/components/neo';
import { ProjectSigil } from '@/projects/sigils';
import { useCalendar } from '@/calendar/store';

type HubFilter = 'All' | 'Dubai' | 'London' | 'Singapore';

const HUB_FILTERS: HubFilter[] = ['All', 'Dubai', 'London', 'Singapore'];

export function RoomsView() {
  const navigate = useNavigate();
  const rooms = useCalendar((s) => s.rooms);
  const bookSpatialRoom = useCalendar((s) => s.bookSpatialRoom);

  const [hubFilter, setHubFilter] = useState<HubFilter>('All');

  const visibleRooms = rooms.filter((r) => hubFilter === 'All' || r.hub === hubFilter);

  return (
    <div className="cal-view">
      <NeoPanel
        hud="SPATIAL WORKPLACE TELEMETRY · BIOMETRIC & HOLOGRAPHIC PODS"
        title="Smart Rooms & Focus Capsules"
        actions={
          <NeoTabs<HubFilter>
            value={hubFilter}
            onChange={setHubFilter}
            label="Smart Rooms & Focus Capsules"
            items={HUB_FILTERS.map((hub) => ({ value: hub, label: hub }))}
          />
        }
      >
        <div className="cal-rooms-grid">
          {visibleRooms.map((rm) => (
            <div key={rm.id} className="cal-room-card" data-qa={`cal-room-${rm.id}`}>
              <div className="cal-room-card__head">
                <ProjectSigil icon={rm.sigil} color={rm.color} size={42} />
                <div className="cal-room-card__title-wrap">
                  <div className="cal-room-card__badges">
                    <span className="neo-mono">{rm.code}</span>
                    <Chip
                      tone={
                        rm.status === 'available'
                          ? 'emerald'
                          : rm.status === 'pre_warming'
                            ? 'amber'
                            : 'cyan'
                      }
                      size="sm"
                    >
                      {rm.status === 'available'
                        ? 'Available Now'
                        : rm.status === 'pre_warming'
                          ? 'Pre-Warming Codec'
                          : 'In Session'}
                    </Chip>
                  </div>
                  <h3 className="cal-room-card__title">{rm.name}</h3>
                  <p className="cal-room-card__meta">
                    {rm.hub} · {rm.floor} · <Users className="cal-inline-icon" /> {rm.capacity}{' '}
                    {rm.capacity === 1 ? 'seat' : 'seats'}
                  </p>
                </div>
              </div>

              <div className="cal-room-telemetry">
                <div className="cal-telemetry-item">
                  <Wind />
                  <div>
                    <span className="neo-mono">{rm.telemetry.co2Ppm} ppm</span>
                    <small>CO₂ Air Quality</small>
                  </div>
                </div>
                <div className="cal-telemetry-item">
                  <Volume2 />
                  <div>
                    <span className="neo-mono">{rm.telemetry.acousticDb} dB</span>
                    <small>Acoustic Isolation</small>
                  </div>
                </div>
                <div className="cal-telemetry-item">
                  <Thermometer />
                  <div>
                    <span className="neo-mono">{rm.telemetry.tempC}°C</span>
                    <small>Thermal Comfort</small>
                  </div>
                </div>
                <div className="cal-telemetry-item">
                  <Cpu />
                  <div>
                    <span className="neo-mono">{rm.telemetry.holoArrayHealth}%</span>
                    <small>HoloMeet Array</small>
                  </div>
                </div>
              </div>

              <div className="cal-room-equip">
                {rm.equipment.map((eq) => (
                  <Chip key={eq} size="sm">
                    {eq}
                  </Chip>
                ))}
              </div>

              <div className="cal-room-card__foot">
                <NovaChip>{rm.nextFreeLabel}</NovaChip>
                <div className="cal-room-card__actions">
                  <button
                    type="button"
                    className="neo-btn neo-btn--soft neo-btn--xs"
                    onClick={() => navigate('/meet/room')}
                  >
                    <Video />
                    <span>Pair HoloMeet</span>
                  </button>
                  <button
                    type="button"
                    className="neo-btn neo-btn--plasma neo-btn--xs"
                    onClick={() => bookSpatialRoom(rm.id)}
                    data-qa={`cal-book-room-${rm.id}`}
                  >
                    <ShieldCheck />
                    <span>Instant Book (45m)</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </NeoPanel>
    </div>
  );
}
