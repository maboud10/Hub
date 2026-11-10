/**
 * Helix Projects — custom futuristic 24×24 SVG icons for the Mission Orbit
 * rail, headers and project view switcher.
 *
 * Matches `src/projects/sigils.tsx`: 1.6 stroke, round caps/joins, orbital /
 * geometric / circuit motifs using `currentColor` + subtle secondary opacity.
 */
import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

function Svg({ children, className, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
      {...rest}
    >
      {children}
    </svg>
  );
}

/* ───────────────────────── Rail & Brand ───────────────────────── */

/** Brand mark — twin counter-tilted orbital rings around a glowing core. */
export function BrandMissionOrbit(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="3.4" />
      <circle cx="12" cy="12" r="1.25" fill="currentColor" stroke="none" />
      <ellipse cx="12" cy="12" rx="9.6" ry="3.8" transform="rotate(-26 12 12)" />
      <ellipse cx="12" cy="12" rx="9.2" ry="3.4" transform="rotate(34 12 12)" opacity={0.48} />
      <circle cx="19.6" cy="7.3" r="1.35" fill="currentColor" stroke="none" />
      <circle cx="5.2" cy="15.8" r="1.05" fill="currentColor" stroke="none" opacity={0.7} />
    </Svg>
  );
}

/** My Work — orbital focus reticle with a crisp check vector. */
export function IconMyWork(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M20.2 11.2a8.2 8.2 0 1 1-4.9-6.7" />
      <ellipse cx="12" cy="12" rx="9.6" ry="3.5" transform="rotate(-24 12 12)" opacity={0.45} />
      <path d="m8.7 12.2 2.3 2.3 5.4-5.4" />
      <circle cx="19.2" cy="6.2" r="1.3" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** Inbox — signal receiver tray with incoming telemetry waves. */
export function IconInbox(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3.6 13.2h4.6l1.6 2.4h4.4l1.6-2.4h4.6" />
      <path d="M5.4 6.2h13.2a1.8 1.8 0 0 1 1.7 1.3l1.3 5.7v4.6a2 2 0 0 1-2 2H4.4a2 2 0 0 1-2-2v-4.6l1.3-5.7a1.8 1.8 0 0 1 1.7-1.3Z" />
      <path d="M9.2 9.5a4 4 0 0 1 5.6 0" opacity={0.55} />
      <circle cx="12" cy="11.4" r="1.2" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** Projects — 2×2 modular mission matrix with an active hex/orbital node. */
export function IconProjectsGrid(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3.5" y="3.5" width="7.2" height="7.2" rx="2" />
      <rect x="3.5" y="13.3" width="7.2" height="7.2" rx="2" />
      <rect x="13.3" y="13.3" width="7.2" height="7.2" rx="2" />
      <path d="M16.9 3.1 20.6 5.2v4.3l-3.7 2.1-3.7-2.1V5.2Z" />
      <circle cx="16.9" cy="7.35" r="1.15" fill="currentColor" stroke="none" />
      <path d="M10.7 7.1h2.5M7.1 10.7v2.6" opacity={0.48} />
    </Svg>
  );
}

/** Portfolios — stacked isometric programme planes with an alignment spine. */
export function IconPortfolios(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3.3 20.4 7.8 12 12.3 3.6 7.8Z" />
      <path d="m3.6 12.2 8.4 4.5 8.4-4.5" opacity={0.75} />
      <path d="m3.6 16.4 8.4 4.5 8.4-4.5" opacity={0.5} />
      <circle cx="12" cy="7.8" r="1.25" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** Workload — precision telemetry arc gauge with needle and harmonic ticks. */
export function IconWorkload(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4.2 17.6a8.8 8.8 0 1 1 15.6 0" />
      <path d="M7.2 15.8a5.6 5.6 0 0 1 9.6 0" opacity={0.45} />
      <path d="M12 15.4 16.2 9.6" />
      <circle cx="12" cy="15.4" r="1.5" fill="currentColor" stroke="none" />
      <path d="M5.6 18.8h12.8" opacity={0.5} />
    </Svg>
  );
}

/* ───────────────────────── Project Views ───────────────────────── */

/** Overview — mission compass / orbital telemetry brief. */
export function IconViewOverview(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.6" />
      <ellipse cx="12" cy="12" rx="8.6" ry="3.3" transform="rotate(-28 12 12)" opacity={0.48} />
      <path d="M14.9 9.1 13.1 13.1 9.1 14.9l1.8-4Z" />
      <circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** List — structured task tracks with status nodes. */
export function IconViewList(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="5.2" cy="6.8" r="1.6" />
      <path d="m4.2 12 1.2 1.2 2.2-2.3" />
      <circle cx="5.2" cy="17.2" r="1.3" fill="currentColor" stroke="none" opacity={0.6} />
      <path d="M9.6 6.8h10.6M9.6 12h10.6" />
      <path d="M9.6 17.2h7.2" opacity={0.55} />
    </Svg>
  );
}

/** Board — three holographic kanban lanes with active cards. */
export function IconViewBoard(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3.4" y="4.2" width="4.6" height="15.6" rx="1.5" />
      <rect x="9.7" y="4.2" width="4.6" height="11.2" rx="1.5" />
      <rect x="16" y="4.2" width="4.6" height="13.4" rx="1.5" opacity={0.6} />
      <circle cx="12" cy="18.6" r="1.2" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** Timeline — Gantt phase bars linked across a live time axis. */
export function IconViewTimeline(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3.6v16.8" opacity={0.42} strokeDasharray="1.8 2.4" />
      <rect x="3.4" y="5.2" width="8.6" height="3.2" rx="1.6" />
      <rect x="8.2" y="10.4" width="9.4" height="3.2" rx="1.6" />
      <rect x="12.6" y="15.6" width="7.8" height="3.2" rx="1.6" opacity={0.75} />
      <circle cx="12" cy="3.6" r="1.2" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** Calendar — precision schedule matrix with a glowing milestone day. */
export function IconViewCalendar(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.4" />
      <path d="M7.8 3.2v3.2M16.2 3.2v3.2M3.5 9.4h17" />
      <circle cx="8.4" cy="13.3" r="1" fill="currentColor" stroke="none" opacity={0.55} />
      <circle cx="12" cy="13.3" r="1" fill="currentColor" stroke="none" opacity={0.55} />
      <path d="M15.6 11.9 17.2 13.5 15.6 15.1 14 13.5Z" fill="currentColor" stroke="none" />
      <path d="M8.4 17h5.2" opacity={0.55} />
    </Svg>
  );
}

/** Dashboard — telemetry bars + ascending trajectory curve + beacon node. */
export function IconViewDashboard(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5.2 19.4v-4.2M9.8 19.4v-6.8M14.4 19.4v-5M19 19.4v-8.4" opacity={0.6} />
      <path d="m4.4 11.4 4.5-3.4 4.2 2.4 5.5-4.8" />
      <circle cx="19" cy="5.2" r="1.45" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** Graph — dependency constellation DAG with critical-path flow. */
export function IconViewGraph(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M7.3 7.2 14.5 5.8M7.3 8.4l7.2 3.8M7.3 16.4l7.2-3.2" opacity={0.55} />
      <circle cx="5.4" cy="7.8" r="2.1" />
      <circle cx="5.4" cy="16.8" r="2.1" opacity={0.75} />
      <circle cx="16.6" cy="5.4" r="2.1" opacity={0.75} />
      <circle cx="16.6" cy="12.6" r="2.2" />
      <circle cx="16.6" cy="12.6" r="0.95" fill="currentColor" stroke="none" />
      <path d="m18.8 12.6 2.2 0" />
    </Svg>
  );
}

/** Files — layered data artifact shard with circuit corner and pin node. */
export function IconViewFiles(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6.2 3.8h7.4l4.6 4.6v10.2a1.8 1.8 0 0 1-1.8 1.8H6.2a1.8 1.8 0 0 1-1.8-1.8V5.6a1.8 1.8 0 0 1 1.8-1.8Z" />
      <path d="M13.4 3.8v4.2a.6.6 0 0 0 .6.6h4.2" opacity={0.6} />
      <path d="M8.2 12.6h6.2M8.2 15.8h4" opacity={0.65} />
      <circle cx="15.2" cy="15.8" r="1.15" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** Automations — lightning core flanked by circuit arcs. */
export function IconViewAutomations(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M13.2 3.2 6.6 12.8h5l-.8 8 6.6-9.6h-5Z" />
      <path d="M4.2 8.8a8.6 8.6 0 0 1 3.8-4.2M19.8 15.2a8.6 8.6 0 0 1-3.8 4.2" opacity={0.5} />
      <circle cx="4.2" cy="8.8" r="1.05" fill="currentColor" stroke="none" opacity={0.65} />
      <circle cx="19.8" cy="15.2" r="1.05" fill="currentColor" stroke="none" opacity={0.65} />
    </Svg>
  );
}
