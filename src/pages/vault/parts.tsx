/**
 * Aegis Vault — Shared UI Primitives
 * Includes the signature Aegis Hexagonal Shield Hero, Live 30s TOTP Ring,
 * Hold-to-Reveal Secret Box with 30s Auto-Clear Clipboard countdown, and Password Generator.
 */
import { createContext, useContext, useEffect, useState } from 'react';
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  Fingerprint,
  Lock,
  Plane,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Wand2,
} from 'lucide-react';
import { Bar, Chip, Meter, Ring } from '@/components/neo';
import { useNow } from '@/hooks/useNow';
import { toast } from '@/store/toast';
import {
  computeTotp,
  estimatePasswordEntropy,
  generateCredential,
   type FullVaultHygiene,
} from '@/vault/engine';
import { useVault } from '@/vault/store';
import type { PasswordGenOptions, WatchtowerRisk } from '@/vault/types';

export interface VaultUiContextValue {
  openNewItem: (genOnly?: boolean) => void;
  openShareModal: (itemId?: string) => void;
  openJitModal: (breakGlass?: boolean) => void;
  openUnlockRitual: () => void;
}

export const VaultUiCtx = createContext<VaultUiContextValue>({
  openNewItem: () => {},
  openShareModal: () => {},
  openJitModal: () => {},
  openUnlockRitual: () => {},
});

export const useVaultUi = () => useContext(VaultUiCtx);

/* ───────────────────── Signature Aegis Hexagonal Shield Hero ───────────────────── */

export function AegisShieldHero({
  hygiene,
  chainValid,
  chainCount,
  onRemediateAll,
}: {
  hygiene: FullVaultHygiene;
  chainValid: boolean;
  chainCount: number;
  onRemediateAll: () => void;
}) {
  const travelMode = useVault((s) => s.travelMode);
  const toggleTravelMode = useVault((s) => s.toggleTravelMode);
  const { openUnlockRitual, openNewItem, openShareModal } = useVaultUi();

  const riskCount = hygiene.exposed + hygiene.reused + hygiene.weak;
  const scoreTone =
    hygiene.score >= 85 ? 'var(--success)' : hygiene.score >= 65 ? '#facc15' : 'var(--danger)';

  return (
    <section className="vault-hero neo-spot" aria-label="Aegis Vault Posture">
      <div className="vault-hero__shield-wrap">
        <div className="vault-shield" role="img" aria-label={`Aegis Hygiene Score ${hygiene.score} out of 100`}>
          <svg viewBox="0 0 180 180" className="vault-shield__svg" aria-hidden="true">
            <defs>
              <linearGradient id="aegisHexGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#facc15" />
                <stop offset="100%" stopColor="#f59e0b" />
              </linearGradient>
            </defs>
            <polygon
              points="90,10 160,50 160,130 90,170 20,130 20,50"
              className="vault-shield__outer"
            />
            <polygon
              points="90,24 148,57 148,123 90,156 32,123 32,57"
              className="vault-shield__inner"
            />
          </svg>
          <div className="vault-shield__ring">
            <Ring value={hygiene.score / 100} size={112} stroke={8} color={scoreTone}>
              <div className="vault-shield__score">
                <strong className="neo-mono">{hygiene.score}</strong>
                <span>AEGIS</span>
              </div>
            </Ring>
          </div>
        </div>
      </div>

      <div className="vault-hero__body">
        <div className="vault-hero__badges">
          <Chip tone="amber" icon={<ShieldCheck size={13} />}>
            End-to-end encrypted · zero-knowledge
          </Chip>
          <Chip tone={chainValid ? 'emerald' : 'rose'} icon={chainValid ? <ShieldCheck size={13} /> : <ShieldAlert size={13} />}>
            <span>{chainValid ? 'SHA-256 Chain Verified' : 'Audit Chain Alert'}</span>
            <b className="neo-mono">#{chainCount}</b>
          </Chip>
          {travelMode && (
            <Chip tone="cyan" icon={<Plane size={13} />}>
              Travel Mode Active
            </Chip>
          )}
        </div>

        <h2 className="vault-hero__title">
          {riskCount > 0
            ? 'Watchtower flagged credentials ready for zero-downtime rotation'
            : 'All personal and team vault enclaves are cryptographically sealed'}
        </h2>
        <p className="vault-hero__sub">
          Hardware-backed FIDO2 passkeys, RFC 6238 TOTP rings, ephemeral database leases, and a tamper-evident FIPS 180-4 SHA-256 audit ledger.
        </p>

        <div className="vault-hero__actions">
          {riskCount > 0 && (
            <button type="button" className="neo-btn neo-btn--plasma neo-btn--sm" onClick={onRemediateAll}>
              <Wand2 size={14} />
              <span>Auto-rotate vulnerable credentials</span>
              <b className="neo-mono">({riskCount})</b>
            </button>
          )}
          <button type="button" className="neo-btn neo-btn--soft neo-btn--sm" onClick={() => openNewItem(true)}>
            <Sparkles size={14} />
            <span>Password Generator</span>
          </button>
          <button type="button" className="neo-btn neo-btn--soft neo-btn--sm" onClick={() => openShareModal()}>
            <span>Create 1-View Share Link</span>
          </button>
          <button
            type="button"
            className={`neo-btn neo-btn--sm ${travelMode ? 'neo-btn--plasma' : 'neo-btn--ghost'}`}
            onClick={() => toggleTravelMode()}
            title="Cloak border-sensitive vaults while travelling internationally"
          >
            <Plane size={14} />
            <span>{travelMode ? 'Disable Travel Mode' : 'Travel Mode'}</span>
          </button>
          <button type="button" className="neo-btn neo-btn--ghost neo-btn--sm" onClick={openUnlockRitual}>
            <Fingerprint size={14} />
            <span>Biometric Ritual</span>
          </button>
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────── Live 30s TOTP Ring ───────────────────────── */

export function TotpLiveWidget({
  secretB32,
  compact = false,
}: {
  secretB32: string;
  compact?: boolean;
}) {
  const now = useNow(1000);
  const { code, formatted, remainingSec, progress } = computeTotp(secretB32, now);
  const [copied, setCopied] = useState(false);

  const copyTotp = (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      navigator.clipboard?.writeText(code);
    } catch {
      // ignore
    }
    setCopied(true);
    toast.success('TOTP code copied', `${formatted} (valid for ${remainingSec}s)`);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const ringColor = remainingSec <= 6 ? 'var(--danger)' : remainingSec <= 12 ? 'var(--warning)' : 'var(--app-c1)';

  if (compact) {
    return (
      <button
        type="button"
        className="vault-totp-pill"
        onClick={copyTotp}
        title="Copy 6-digit TOTP authenticator code"
      >
        <Ring value={progress} size={26} stroke={3} color={ringColor}>
          <span className="neo-mono" style={{ fontSize: 9 }}>
            {remainingSec}
          </span>
        </Ring>
        <span className="neo-mono vault-totp-pill__code" data-no-translate>
          {formatted}
        </span>
        {copied ? <Check size={12} /> : <Copy size={12} />}
      </button>
    );
  }

  return (
    <div className="vault-totp-card">
      <Ring value={progress} size={46} stroke={4.5} color={ringColor}>
        <span className="neo-mono" style={{ fontSize: 11 }}>
          {remainingSec}s
        </span>
      </Ring>
      <div className="vault-totp-card__info">
        <div className="neo-hud">RFC 6238 TOTP · 30s Window</div>
        <div className="vault-totp-card__code neo-mono" data-no-translate>
          {formatted}
        </div>
      </div>
      <button type="button" className="neo-btn neo-btn--soft neo-btn--sm" onClick={copyTotp}>
        {copied ? <Check size={14} /> : <Copy size={14} />}
        <span>{copied ? 'Copied' : 'Copy OTP'}</span>
      </button>
    </div>
  );
}

/* ───────────── Hold-to-Reveal & 30s Auto-Clear Clipboard Box ───────────── */

export function SecretRevealBox({
  itemId,
  label = 'Secret / Password',
  value,
}: {
  itemId: string;
  label?: string;
  value: string;
}) {
  const recordAccess = useVault((s) => s.recordItemAccess);
  const [revealed, setRevealed] = useState(false);
  const [clearSec, setClearSec] = useState<number | null>(null);

  useEffect(() => {
    setRevealed(false);
    setClearSec(null);
  }, [itemId]);

  useEffect(() => {
    if (clearSec === null) return;
    if (clearSec <= 0) {
      try {
        navigator.clipboard?.writeText('');
      } catch {
        // ignore
      }
      setClearSec(null);
      return;
    }
    const id = window.setTimeout(() => setClearSec((c) => (c !== null ? c - 1 : null)), 1000);
    return () => window.clearTimeout(id);
  }, [clearSec]);

  const toggleReveal = () => {
    const next = !revealed;
    setRevealed(next);
    if (next) recordAccess(itemId, 'reveal');
  };

  const handleCopy = () => {
    try {
      navigator.clipboard?.writeText(value);
    } catch {
      // ignore
    }
    recordAccess(itemId, 'copy');
    setClearSec(30);
    toast.info('Copied to clipboard', 'Auto-scrubbing clipboard in 30 seconds');
  };

  const entropy = estimatePasswordEntropy(value);

  return (
    <div className="vault-secret-box">
      <div className="vault-secret-box__head">
        <span className="neo-hud">{label}</span>
        <span className="vault-secret-box__entropy">
          <span>{entropy.label}</span>
          <b className="neo-mono">{entropy.bits} bits</b>
        </span>
      </div>

      <div className="vault-secret-box__row">
        <code className="vault-secret-box__val neo-mono" data-no-translate>
          {revealed ? value : '••••••••••••••••••••••••'}
        </code>
        <button
          type="button"
          className="neo-iconbtn neo-iconbtn--sm"
          onClick={toggleReveal}
          onMouseDown={() => {
            if (!revealed) {
              setRevealed(true);
              recordAccess(itemId, 'reveal');
            }
          }}
          aria-label={revealed ? 'Hide secret' : 'Reveal secret'}
          title={revealed ? 'Hide secret' : 'Hold or click to reveal secret'}
        >
          {revealed ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
        <button
          type="button"
          className="neo-btn neo-btn--soft neo-btn--xs"
          onClick={handleCopy}
          title="Copy with 30-second clipboard auto-scrub"
        >
          <Copy size={13} />
          <span>{clearSec !== null ? 'Scrubbing' : 'Copy'}</span>
          {clearSec !== null && <b className="neo-mono">{clearSec}s</b>}
        </button>
      </div>

      <Bar
        value={entropy.score / 100}
        height={5}
        fill={
          entropy.score >= 80
            ? 'var(--success)'
            : entropy.score >= 50
              ? 'var(--warning)'
              : 'var(--danger)'
        }
        label="Credential entropy strength"
      />
    </div>
  );
}

/* ───────────────────── Risk Chip Helper ───────────────────── */

export function RiskBadges({ risks }: { risks: WatchtowerRisk[] }) {
  if (risks.length === 0) {
    return (
      <Chip tone="emerald" size="sm" icon={<ShieldCheck size={12} />}>
        Quantum-Safe
      </Chip>
    );
  }
  return (
    <div className="vault-risk-row">
      {risks.includes('exposed') && (
        <Chip tone="rose" size="sm" icon={<ShieldAlert size={12} />}>
          Exposed in Breach
        </Chip>
      )}
      {risks.includes('reused') && (
        <Chip tone="amber" size="sm">
          Reused Secret
        </Chip>
      )}
      {risks.includes('weak') && (
        <Chip tone="orange" size="sm">
          Low Entropy
        </Chip>
      )}
      {risks.includes('expiring') && (
        <Chip tone="amber" size="sm">
          Expiring Soon
        </Chip>
      )}
      {risks.includes('no_2fa') && (
        <Chip tone="violet" size="sm">
          2FA Available
        </Chip>
      )}
      {risks.includes('stale') && (
        <Chip tone="slate" size="sm">
          Stale (&gt;180d)
        </Chip>
      )}
    </div>
  );
}

/* ───────────── Interactive Password & Passphrase Generator ───────────── */

export function PasswordGeneratorCard({
  onApplySecret,
}: {
  onApplySecret?: (value: string) => void;
}) {
  const [opts, setOpts] = useState<PasswordGenOptions>({
    mode: 'password',
    length: 24,
    uppercase: true,
    lowercase: true,
    digits: true,
    symbols: true,
    wordCount: 5,
    separator: '-',
  });

  const [generated, setGenerated] = useState(() => generateCredential(opts));

  const regenerate = (nextOpts: PasswordGenOptions = opts) => {
    setGenerated(generateCredential(nextOpts));
  };

  const updateOpts = (patch: Partial<PasswordGenOptions>) => {
    const merged = { ...opts, ...patch };
    setOpts(merged);
    regenerate(merged);
  };

  const copyGenerated = () => {
    try {
      navigator.clipboard?.writeText(generated.value);
    } catch {
      // ignore
    }
    toast.success('Generated credential copied', `${generated.entropy.bits} bits of entropy`);
  };

  const meterSegments = Math.max(1, Math.min(5, Math.ceil(generated.entropy.score / 20)));

  return (
    <div className="vault-gen-card">
      <div className="vault-gen-card__top">
        <div className="vault-gen-card__modes" role="tablist" aria-label="Generator mode">
          <button
            type="button"
            role="tab"
            aria-selected={opts.mode === 'password'}
            className={`neo-btn neo-btn--xs ${opts.mode === 'password' ? 'neo-btn--plasma' : 'neo-btn--ghost'}`}
            onClick={() => updateOpts({ mode: 'password' })}
          >
            <Lock size={12} />
            <span>Random Password</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={opts.mode === 'passphrase'}
            className={`neo-btn neo-btn--xs ${opts.mode === 'passphrase' ? 'neo-btn--plasma' : 'neo-btn--ghost'}`}
            onClick={() => updateOpts({ mode: 'passphrase' })}
          >
            <Sparkles size={12} />
            <span>Diceware Passphrase</span>
          </button>
        </div>
        <button
          type="button"
          className="neo-iconbtn neo-iconbtn--sm"
          onClick={() => regenerate()}
          aria-label="Regenerate credential"
          title="Regenerate credential"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      <div className="vault-gen-card__output">
        <code className="neo-mono" data-no-translate>
          {generated.value}
        </code>
      </div>

      <div className="vault-gen-card__meta">
        <Meter value={meterSegments} segments={5} label={generated.entropy.label} />
        <span className="neo-hud">{generated.entropy.label}</span>
        <span className="neo-mono">{generated.entropy.bits} bits</span>
        <span className="vault-gen-card__crack" data-no-translate>
          {generated.entropy.crackTime}
        </span>
      </div>

      {opts.mode === 'password' ? (
        <div className="vault-gen-card__controls">
          <label className="vault-gen-card__slider">
            <span>Length</span>
            <input
              type="range"
              min={10}
              max={48}
              value={opts.length}
              onChange={(e) => updateOpts({ length: Number(e.target.value) })}
            />
            <b className="neo-mono">{opts.length}</b>
          </label>
          <div className="vault-gen-card__toggles">
            <Chip
              tone={opts.uppercase ? 'amber' : 'slate'}
              size="sm"
              pressed={opts.uppercase}
              onClick={() => updateOpts({ uppercase: !opts.uppercase })}
            >
              A–Z
            </Chip>
            <Chip
              tone={opts.lowercase ? 'amber' : 'slate'}
              size="sm"
              pressed={opts.lowercase}
              onClick={() => updateOpts({ lowercase: !opts.lowercase })}
            >
              a–z
            </Chip>
            <Chip
              tone={opts.digits ? 'amber' : 'slate'}
              size="sm"
              pressed={opts.digits}
              onClick={() => updateOpts({ digits: !opts.digits })}
            >
              0–9
            </Chip>
            <Chip
              tone={opts.symbols ? 'amber' : 'slate'}
              size="sm"
              pressed={opts.symbols}
              onClick={() => updateOpts({ symbols: !opts.symbols })}
            >
              !@#$
            </Chip>
          </div>
        </div>
      ) : (
        <div className="vault-gen-card__controls">
          <label className="vault-gen-card__slider">
            <span>Words</span>
            <input
              type="range"
              min={3}
              max={8}
              value={opts.wordCount}
              onChange={(e) => updateOpts({ wordCount: Number(e.target.value) })}
            />
            <b className="neo-mono">{opts.wordCount}</b>
          </label>
          <div className="vault-gen-card__toggles">
            {(['-', '.', '_'] as const).map((sep) => (
              <Chip
                key={sep}
                tone={opts.separator === sep ? 'amber' : 'slate'}
                size="sm"
                pressed={opts.separator === sep}
                onClick={() => updateOpts({ separator: sep })}
              >
                Sep {sep}
              </Chip>
            ))}
          </div>
        </div>
      )}

      <div className="vault-gen-card__actions">
        <button type="button" className="neo-btn neo-btn--soft neo-btn--sm" onClick={copyGenerated}>
          <Copy size={13} />
          <span>Copy Credential</span>
        </button>
        {onApplySecret && (
          <button
            type="button"
            className="neo-btn neo-btn--plasma neo-btn--sm"
            onClick={() => onApplySecret(generated.value)}
          >
            <Wand2 size={13} />
            <span>Apply to Selected Item</span>
          </button>
        )}
      </div>
    </div>
  );
}
