import { Fragment } from 'react';
import { Keyboard } from 'lucide-react';
import { useIsAdminArea } from '@/store/selectors';
import { useUI } from '@/store/ui';
import { SettingsSection } from './SettingsSection';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.userAgent);
const MOD = isMac ? '⌘' : 'Ctrl';

interface Shortcut {
  /** Each step is a chord of keys pressed together; steps are pressed in sequence. */
  steps: string[][];
  label: string;
  /** Render steps as a range (1–9) instead of a sequence. */
  range?: boolean;
  adminOnly?: boolean;
}

const GROUPS: { title: string; items: Shortcut[] }[] = [
  {
    title: 'Anywhere',
    items: [
      { steps: [[MOD, 'K']], label: 'Command palette' },
      { steps: [['/']], label: 'Search everything' },
      { steps: [['?']], label: 'Show shortcuts' },
      { steps: [['Esc']], label: 'Close dialogs & panels' },
    ],
  },
  {
    title: 'Go to',
    items: [
      { steps: [['G'], ['H']], label: 'Home' },
      { steps: [['G'], ['A']], label: 'Apps' },
      { steps: [['G'], ['P']], label: 'People' },
      { steps: [['G'], ['N']], label: 'Newsroom' },
      { steps: [['G'], ['S']], label: 'Settings' },
      { steps: [['G'], ['X']], label: 'Control Center', adminOnly: true },
    ],
  },
  {
    title: 'Actions',
    items: [
      { steps: [['T']], label: 'Toggle light / dark theme' },
      { steps: [['L']], label: 'Toggle Arabic (RTL) / English (LTR)' },
      { steps: [['F']], label: 'Start / stop focus timer' },
      { steps: [['N']], label: 'Open notifications' },
      { steps: [['1'], ['9']], label: 'Launch pinned app 1–9', range: true },
    ],
  },
];

export function ShortcutsSection() {
  const isAdmin = useIsAdminArea();
  const openOverlay = useUI((s) => s.setShortcutsOpen);

  return (
    <SettingsSection
      id="shortcuts"
      icon={<Keyboard />}
      title="Keyboard shortcuts"
      description={
        <>
          Fly through NEXUS without touching the mouse. Press <kbd className="kbd">?</kbd> anywhere for the cheat sheet.
        </>
      }
      aside={
        <button type="button" className="btn btn--ghost btn--sm set-aside__btn" onClick={() => openOverlay(true)}>
          <Keyboard /> Cheat sheet
        </button>
      }
    >
      <p className="set-touch-note">Shortcuts need a hardware keyboard — attach one to use them on a tablet.</p>
      <div className="set-shortcuts">
        {GROUPS.map((g) => (
          <div key={g.title} className="set-shortcuts__group">
            <div className="stat-label">{g.title}</div>
            <ul>
              {g.items.map((s) => (
                <li key={s.label} className={s.adminOnly && !isAdmin ? 'is-dim' : undefined}>
                  <span className="set-shortcuts__label">
                    {s.label}
                    {s.adminOnly && !isAdmin && <span className="faint text-xs"> · needs Control Center access</span>}
                  </span>
                  <span className="set-shortcuts__keys">
                    <span className="sr-only">{describe(s)}</span>
                    {s.steps.map((chord, i) => (
                      <Fragment key={i}>
                        {i > 0 && (
                          <span className="set-shortcuts__sep" aria-hidden="true">
                            {s.range ? '–' : 'then'}
                          </span>
                        )}
                        {chord.map((k) => (
                          <kbd key={k} className="kbd" aria-hidden="true">
                            {k}
                          </kbd>
                        ))}
                      </Fragment>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </SettingsSection>
  );
}

function describe(s: Shortcut): string {
  const name = (k: string) => (k === '⌘' ? 'Command' : k === 'Esc' ? 'Escape' : k);
  const chords = s.steps.map((c) => c.map(name).join(' + '));
  return s.range ? chords.join(' to ') : chords.join(', then ');
}
