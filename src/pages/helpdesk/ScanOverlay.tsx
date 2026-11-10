/**
 * IT Helpdesk — Full-screen Asset Tag & QR Scanner (`ScanOverlay`).
 *
 * Rendered by `HelpdeskPage` when `?scan=1`.
 * - Uses `navigator.mediaDevices.getUserMedia` + `BarcodeDetector` when available,
 *   and cleanly falls back to a futuristic holographic optical HUD with an
 *   animated laser sweep + live `QrSvg` target preview (ideal for headless Chrome
 *   and instant 1-click demos).
 * - Accepts full deep-link URLs (`deviceUrl(tag)`), asset tags (`HX-MBP-0007`,
 *   `hx mbp 142`), 4-digit suffixes (`0007`, `142`), or serial numbers.
 * - Quick-pick chips for primary, loaner, at-risk and lost fleet devices.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import {
  ArrowRight,
  Camera,
  CameraOff,
  CheckCircle2,
  Cpu,
  QrCode,
  Radar,
  ScanLine,
  ShieldAlert,
  Sparkles,
  Truck,
  Wrench,
  X,
} from 'lucide-react';
import { Orb } from '@/components/neo';
import { cx } from '@/lib/cx';
import { useNow } from '@/hooks/useNow';
import { useHub } from '@/store/hub';
import { toast } from '@/store/toast';
import { useHelpdesk } from '@/helpdesk/store';
import type { Device } from '@/helpdesk/types';
import {
  ASSET_TAG_RE,
  complianceIssues,
  deviceHealth,
  healthBand,
  HEALTH_BAND_COLOR,
  HEALTH_BAND_LABEL,
  normaliseTag,
  primaryDevice,
} from '@/helpdesk/fleet';
import { DEVICE_STATUS_LABEL, KIND_LABEL } from '@/helpdesk/meta';
import { DeviceGlyph } from './glyphs';
import { holoColor } from './DeviceParts';
import { deviceUrl, QrSvg } from './Sticker';
import { HealthRing, Kbd, Person, useViewer } from './ui';
import '@/styles/helpdesk/scan.css';

interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement): Promise<{ rawValue?: string }[]>;
}

declare global {
  interface Window {
    BarcodeDetector?: new (opts?: { formats?: string[] }) => BarcodeDetectorLike;
  }
}

/** Resolve user input or scanned QR string into a normalized candidate tag or device. */
export function resolveScannedInput(raw: string, devices: Device[]): { tag: string; device?: Device } {
  const trimmed = raw.trim();
  if (!trimmed) return { tag: '' };

  // 1. Check if input is a full or partial URL like https://.../helpdesk/fleet/HX-MBP-0007
  const urlMatch = trimmed.match(/\/helpdesk\/(?:fleet|devices)\/([A-Za-z0-9-]+)/i);
  const extracted = urlMatch ? urlMatch[1] : trimmed;

  // 2. Normalise ("hx mbp 7" -> "HX-MBP-0007")
  const norm = normaliseTag(extracted);
  if (ASSET_TAG_RE.test(norm)) {
    const exact = devices.find((d) => d.assetTag === norm);
    return { tag: norm, device: exact };
  }

  // 3. Pure 1..4 digit suffix ("0007" or "142")
  const digits = extracted.replace(/^#/, '').trim();
  if (/^\d{1,4}$/.test(digits)) {
    const padded = digits.padStart(4, '0');
    const found = devices.find((d) => d.assetTag.endsWith(`-${padded}`));
    if (found) return { tag: found.assetTag, device: found };
  }

  // 4. Serial or partial assetTag / model match
  const upper = extracted.toUpperCase();
  const bySerial = devices.find((d) => d.serial.toUpperCase() === upper || d.assetTag === upper);
  if (bySerial) return { tag: bySerial.assetTag, device: bySerial };

  const partial = devices.find(
    (d) => d.assetTag.includes(upper) || d.serial.toUpperCase().includes(upper) || d.model.toUpperCase().includes(upper),
  );
  if (partial) return { tag: partial.assetTag, device: partial };

  return { tag: norm };
}

type CameraState = 'simulated' | 'requesting' | 'live' | 'unavailable';

export function ScanOverlay({ onClose }: { admin?: boolean; onClose?: () => void }) {
  const navigate = useNavigate();
  const viewer = useViewer();
  const devices = useHelpdesk((s) => s.devices);
  const users = useHub((s) => s.users);
  const now = useNow(30_000);

  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [camState, setCamState] = useState<CameraState>('simulated');
  const [camReason, setCamReason] = useState('Holographic optical simulation active · camera optional');
  const [hoveredTag, setHoveredTag] = useState<string | null>(null);
  const [locking, setLocking] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const close = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    onClose?.();
  }, [onClose]);

  const openDevice = useCallback(
    (tag: string) => {
      const target = devices.find((d) => d.assetTag === tag.toUpperCase());
      if (!target) {
        setError(`No fleet device matches “${tag}”. Try HX-MBP-0007 or pick a chip below.`);
        return;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      toast.success(`Scanned ${target.assetTag}`, `${target.model} · ${DEVICE_STATUS_LABEL[target.status]}`);
      onClose?.();
      navigate(`/helpdesk/fleet/${target.assetTag}`);
    },
    [devices, navigate, onClose],
  );

  // Stop any camera tracks on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, []);

  // Focus manual input on open + Escape to close
  useEffect(() => {
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      cancelAnimationFrame(id);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [close]);

  // Optional live camera + BarcodeDetector loop
  const startCamera = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setCamState('unavailable');
      setCamReason('Camera API unsupported in this browser — using holographic simulator');
      return;
    }
    setCamState('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setCamState('live');
      setCamReason(
        window.BarcodeDetector
          ? 'Live optical feed · BarcodeDetector active'
          : 'Live camera preview · enter tag or click a sticker to lock',
      );
    } catch {
      setCamState('unavailable');
      setCamReason('Camera unavailable or permission declined — holographic HUD ready');
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCamState('simulated');
    setCamReason('Holographic optical simulation active · camera optional');
  }, []);

  // BarcodeDetector polling when camera is live
  useEffect(() => {
    if (camState !== 'live' || !window.BarcodeDetector) return;
    let cancelled = false;
    let detector: BarcodeDetectorLike | null = null;
    try {
      detector = new window.BarcodeDetector({ formats: ['qr_code', 'code_128', 'code_39'] });
    } catch {
      detector = null;
    }
    if (!detector) return;

    const timer = window.setInterval(async () => {
      if (cancelled || !videoRef.current || videoRef.current.readyState < 2) return;
      try {
        const codes = await detector.detect(videoRef.current);
        const raw = codes[0]?.rawValue?.trim();
        if (raw) {
          const { device } = resolveScannedInput(raw, devices);
          if (device) openDevice(device.assetTag);
        }
      } catch {
        /* ignore frame errors */
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [camState, devices, openDevice]);

  // Curated quick-pick fleet devices for 1-click demos
  const quickPicks = useMemo(() => {
    const active = devices.filter((d) => d.status !== 'retired');
    const me = viewer?.user.id ?? 'u-layla';
    const myPrimary = primaryDevice(active, me) ?? active.find((d) => d.assetTag === 'HX-MBP-0007') ?? active[0];
    const omarPrimary = active.find((d) => d.assetTag === 'HX-MBP-0142');
    const loaner = active.find((d) => d.status === 'loaner');
    const nonCompliant = active.find((d) => d.assetTag === 'HX-MBP-0187') ?? active.find((d) => complianceIssues(d, now).length > 0);
    const staleMdm = active.find((d) => d.assetTag === 'HX-XPS-0146');
    const inRepair = active.find((d) => d.status === 'in_repair');
    const lost = active.find((d) => d.status === 'lost');

    const picks: { badge: string; tone: 'ok' | 'warn' | 'bad' | 'info'; device: Device }[] = [];
    const seen = new Set<string>();
    const add = (badge: string, tone: 'ok' | 'warn' | 'bad' | 'info', d?: Device) => {
      if (!d || seen.has(d.assetTag)) return;
      seen.add(d.assetTag);
      picks.push({ badge, tone, device: d });
    };

    add('Your primary', 'ok', myPrimary);
    add('Engineering rig', 'info', omarPrimary);
    add('Active loaner', 'warn', loaner);
    add('Firewall off', 'warn', nonCompliant);
    add('MDM stale', 'warn', staleMdm);
    add('In repair', 'info', inRepair);
    add('Reported lost', 'bad', lost);

    return picks;
  }, [devices, viewer?.user.id, now]);

  // Resolved device from manual input or hovered chip or default primary
  const resolvedInput = useMemo(() => resolveScannedInput(input, devices), [input, devices]);
  const previewDevice = useMemo<Device | undefined>(() => {
    if (resolvedInput.device) return resolvedInput.device;
    if (hoveredTag) return devices.find((d) => d.assetTag === hoveredTag);
    return quickPicks[0]?.device ?? devices[0];
  }, [resolvedInput.device, hoveredTag, quickPicks, devices]);

  const previewHealth = previewDevice ? deviceHealth(previewDevice, now) : 100;
  const previewBand = healthBand(previewHealth);
  const previewOwner = useMemo(
    () => (previewDevice?.assigneeId ? users.find((u) => u.id === previewDevice.assigneeId) : undefined),
    [users, previewDevice],
  );

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() && previewDevice) {
      openDevice(previewDevice.assetTag);
      return;
    }
    const { tag, device } = resolveScannedInput(input, devices);
    if (device) {
      openDevice(device.assetTag);
      return;
    }
    setError(
      tag
        ? `No device found with tag “${tag}”. Check the sticker or choose a fleet device below.`
        : 'Enter an asset tag (e.g. HX-MBP-0007 or 0142) or full sticker URL.',
    );
  };

  const simulateOpticalLock = () => {
    if (!previewDevice || locking) return;
    setLocking(true);
    window.setTimeout(() => {
      openDevice(previewDevice.assetTag);
    }, 320);
  };

  return createPortal(
    <div
      className="neo-portal hd-scanner"
      role="dialog"
      aria-modal="true"
      aria-label="Scan asset sticker or QR code"
      data-qa="scan-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="hd-scanner__shell">
        {/* Top bar */}
        <header className="hd-scanner__head">
          <div className="hd-scanner__brand">
            <span className="hd-scanner__icon">
              <QrCode />
            </span>
            <div>
              <div className="neo-hud">
                HELIX OPTICAL DECK · <span className="neo-mono">QR / CODE-128</span>
              </div>
              <h2 className="hd-scanner__title">Asset tag & sticker scanner</h2>
            </div>
          </div>

          <div className="hd-scanner__head-actions">
            {camState === 'live' ? (
              <button type="button" className="neo-btn neo-btn--soft neo-btn--sm" onClick={stopCamera}>
                <CameraOff /> <span className="neo-btn__label">Hologram HUD</span>
              </button>
            ) : (
              <button
                type="button"
                className="neo-btn neo-btn--soft neo-btn--sm"
                onClick={startCamera}
                disabled={camState === 'requesting'}
                data-qa="scan-toggle-camera"
              >
                <Camera /> <span className="neo-btn__label">{camState === 'requesting' ? 'Starting camera…' : 'Use camera'}</span>
              </button>
            )}
            <button
              type="button"
              className="neo-iconbtn"
              onClick={close}
              aria-label="Close scanner"
              data-qa="scan-close"
            >
              <X />
            </button>
          </div>
        </header>

        <div className="hd-scanner__body">
          {/* Left: Futuristic Holographic Scanner Viewport */}
          <div className={cx('hd-scanner__viewport', locking && 'is-locking')} data-mode={camState}>
            {camState === 'live' && <video ref={videoRef} className="hd-scanner__video" playsInline muted />}

            {/* Grid & HUD overlay */}
            <div className="hd-scanner__grid" aria-hidden="true" />
            <div className="hd-scanner__vignette" aria-hidden="true" />

            {/* Top HUD telemetry readout */}
            <div className="hd-scanner__hud-top">
              <span className="hd-scanner__hud-pill">
                <Orb tone={camState === 'live' ? 'success' : 'app'} pulse size={7} />
                <span>{camState === 'live' ? 'LIVE OPTICAL STREAM' : 'HOLOGRAPHIC TARGET SIMULATOR'}</span>
              </span>
              <span className="hd-scanner__hud-coords neo-mono">
                {previewDevice ? `LOCK // ${previewDevice.assetTag}` : 'SCANNING…'}
              </span>
            </div>

            {/* Targeting Reticle + Animated Laser Sweep + Live QR / Hologram Target */}
            <div className="hd-scanner__reticle">
              <i className="hd-scanner__corner hd-scanner__corner--tl" />
              <i className="hd-scanner__corner hd-scanner__corner--tr" />
              <i className="hd-scanner__corner hd-scanner__corner--bl" />
              <i className="hd-scanner__corner hd-scanner__corner--br" />
              <div className="hd-scanner__laser" aria-hidden="true" />

              {previewDevice && (
                <div className="hd-scanner__target" data-qa="scan-live-target">
                  <div className="hd-scanner__qr-card">
                    <QrSvg text={deviceUrl(previewDevice.assetTag)} size={128} />
                    <div className="hd-scanner__qr-caption neo-mono">{previewDevice.assetTag}</div>
                  </div>

                  <div className="hd-scanner__target-info">
                    <div
                      className="hd-scanner__target-glyph"
                      style={{ ['--holo' as string]: holoColor(previewDevice) ?? 'var(--app-c1)' }}
                    >
                      <DeviceGlyph kind={previewDevice.kind} size={86} color={holoColor(previewDevice)} />
                    </div>
                    <div className="hd-scanner__target-meta">
                      <span className="neo-hud">
                        {KIND_LABEL[previewDevice.kind]} · {previewDevice.office}
                      </span>
                      <b className="hd-scanner__target-model">{previewDevice.model}</b>
                      <span className="hd-scanner__target-serial neo-mono">SN {previewDevice.serial}</span>
                      <div className="hd-scanner__target-badges">
                        <span className="hd-devstate" data-status={previewDevice.status}>
                          {DEVICE_STATUS_LABEL[previewDevice.status]}
                        </span>
                        <span
                          className="hd-scanner__health-pill"
                          style={{ ['--hc' as string]: HEALTH_BAND_COLOR[previewBand] }}
                        >
                          Health {previewHealth} · {HEALTH_BAND_LABEL[previewBand]}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom HUD bar */}
            <div className="hd-scanner__hud-foot">
              <span className="hd-scanner__hud-reason">
                <ScanLine size={14} />
                <span>{camReason}</span>
              </span>
              {previewDevice && (
                <button
                  type="button"
                  className="neo-btn neo-btn--plasma neo-btn--xs"
                  onClick={simulateOpticalLock}
                  data-qa="scan-simulate-lock"
                >
                  <Radar /> Lock & open {previewDevice.assetTag}
                </button>
              )}
            </div>
          </div>

          {/* Right: Manual Asset-Tag Entry + Live Match + Quick-Pick Fleet Chips */}
          <div className="hd-scanner__panel">
            <form className="hd-scanner__form" onSubmit={handleSubmit}>
              <label className="neo-field">
                <span className="neo-label">Manual asset tag, 4-digit code or sticker URL</span>
                <div className="hd-scanner__input-row">
                  <input
                    ref={inputRef}
                    className="neo-input neo-mono hd-scanner__input"
                    value={input}
                    onChange={(e) => {
                      setInput(e.target.value);
                      setError('');
                    }}
                    placeholder="HX-MBP-0007 · 0142 · or paste sticker link"
                    spellCheck={false}
                    autoComplete="off"
                    data-qa="scan-input"
                  />
                  <button type="submit" className="neo-btn neo-btn--plasma" data-qa="scan-submit">
                    Open <ArrowRight />
                  </button>
                </div>
                <span className="neo-hint">
                  Accepts <code className="neo-mono">HX-MBP-0007</code>, spaced <code className="neo-mono">hx mbp 142</code>, suffix <code className="neo-mono">0007</code>, or <code className="neo-mono">{deviceUrl('HX-MBP-0007')}</code>
                </span>
              </label>

              {error && (
                <p className="hd-formerr" role="alert" data-qa="scan-error">
                  {error}
                </p>
              )}
            </form>

            {/* Live decoded match card */}
            {previewDevice && (
              <div className="hd-scanner__match" data-qa="scan-match-card">
                <div className="hd-scanner__match-top">
                  <span className="neo-hud">
                    {resolvedInput.device ? (
                      <>
                        <CheckCircle2 size={12} style={{ color: 'var(--hd-ok)' }} /> MATCHED ASSET
                      </>
                    ) : (
                      <>
                        <Cpu size={12} /> TARGET PREVIEW
                      </>
                    )}
                  </span>
                  <span className="neo-mono hd-scanner__match-tag">{previewDevice.assetTag}</span>
                </div>
                <div className="hd-scanner__match-body">
                  <div className="hd-scanner__match-info">
                    <b>{previewDevice.model}</b>
                    <span>
                      {KIND_LABEL[previewDevice.kind]} · {previewDevice.office} · SN {previewDevice.serial}
                    </span>
                    <div className="hd-scanner__match-owner">
                      {previewOwner ? (
                        <Person userId={previewOwner.id} size={22} sub={previewOwner.department} />
                      ) : (
                        <span className="neo-faint">
                          {previewDevice.status === 'in_stock' ? 'In stock at IT bar' : 'Unassigned'}
                        </span>
                      )}
                    </div>
                  </div>
                  <HealthRing score={previewHealth} size={46} />
                </div>
                <button
                  type="button"
                  className="neo-btn neo-btn--soft neo-btn--sm neo-btn--block"
                  onClick={() => openDevice(previewDevice.assetTag)}
                  data-qa="scan-open-matched"
                >
                  Open {previewDevice.assetTag} in Fleet console <ArrowRight />
                </button>
              </div>
            )}

            {/* Quick-pick chips for instant 1-click demo navigation */}
            <div className="hd-scanner__picks">
              <div className="hd-scanner__picks-head">
                <span className="neo-hud">
                  <Sparkles size={11} /> Quick-pick fleet stickers (1-click demo)
                </span>
              </div>
              <div className="hd-scanner__chips" role="list" aria-label="Sample fleet devices">
                {quickPicks.map(({ badge, tone, device: d }) => {
                  const h = deviceHealth(d, now);
                  const isCurrent = previewDevice?.assetTag === d.assetTag;
                  return (
                    <button
                      key={d.assetTag}
                      type="button"
                      role="listitem"
                      className={cx('hd-scanner__chip', isCurrent && 'is-on')}
                      data-tone={tone}
                      onMouseEnter={() => setHoveredTag(d.assetTag)}
                      onFocus={() => setHoveredTag(d.assetTag)}
                      onClick={() => openDevice(d.assetTag)}
                      data-qa={`scan-pick-${d.assetTag}`}
                    >
                      <div className="hd-scanner__chip-top">
                        <span className="neo-mono hd-scanner__chip-tag">{d.assetTag}</span>
                        <span className="hd-scanner__chip-badge" data-tone={tone}>
                          {tone === 'bad' ? <ShieldAlert size={11} /> : tone === 'warn' ? <Wrench size={11} /> : tone === 'info' ? <Truck size={11} /> : null}
                          {badge}
                        </span>
                      </div>
                      <div className="hd-scanner__chip-model truncate">{d.model}</div>
                      <div className="hd-scanner__chip-foot">
                        <span>{d.office}</span>
                        <b className="neo-num" style={{ color: HEALTH_BAND_COLOR[healthBand(h)] }}>
                          {h}%
                        </b>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="hd-scanner__foot">
              <span>
                <Kbd>↵</Kbd> open matched device · <Kbd>Esc</Kbd> close scanner
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
