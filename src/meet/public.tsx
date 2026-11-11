/**
 * Public App Bridge for Helix Meet (see src/lib/appBridge.ts).
 *
 * Powers the global ⌘K Command Palette and Settings → Reset demo for
 * HoloMeet spatial rooms, AI Recording Vault, and Async Video Clips.
 */
import { Activity, Disc, Film, Radio, Sparkles, Video } from 'lucide-react';
import type { AppPublicApi, BridgeViewer, PaletteEntry } from '@/lib/appBridge';
import { useMeet } from './store';

function hasMeetAccess(viewer: BridgeViewer): boolean {
  return viewer.perms.has('*') || viewer.perms.has('app:meet');
}

export const api: AppPublicApi = {
  appId: 'meet',

  paletteEntries(viewer) {
    if (!hasMeetAccess(viewer)) return [];
    const st = useMeet.getState();
    const out: PaletteEntry[] = [];
    const action = (id: string, title: string, to: string, icon: PaletteEntry['icon'], keywords: string[], subtitle?: string) =>
      out.push({ id: `meet:${id}`, group: 'Actions', title, subtitle, to, icon, keywords: ['meet', 'holomeet', 'video', 'call', ...keywords], hint: 'Open' });

    action('lobby', 'HoloMeet Command & Pre-Flight Lobby', '/meet', <Video />, ['lobby', 'green room', 'camera', 'mic', 'upcoming'], 'Hardware check, noise suppression & upcoming rooms');
    action('stage', 'Join Live Spatial Meeting Stage', '/meet/room', <Radio />, ['room', 'live', 'stage', 'scribe', 'captions', 'arabic'], 'Spatial orbit stage + live bilingual Nova Scribe');
    action('recordings', 'AI Recordings & Decision Vault', '/meet/recordings', <Disc />, ['recordings', 'vault', 'transcript', 'chapters', 'summary'], 'Chaptered replays, sentiment waveform & action items');
    action('clips', 'Async Video Clips Studio', '/meet/clips', <Film />, ['clips', 'async', 'loom', 'screen', 'walkthrough'], 'Record & watch 3-min async updates to replace meetings');
    action('analytics', 'Meeting Pulse & Talk-Time Telemetry', '/meet/analytics', <Activity />, ['analytics', 'talk time', 'equity', 'deflection'], 'Talk-time inclusion radar & async hours saved');
    action('instant', 'Launch Instant Spatial Room', '/meet/room?instant=1', <Sparkles />, ['instant', 'start meeting', 'war room', 'jam'], 'Spin up an ad-hoc HoloMeet room now');

    for (const r of st.rooms) {
      out.push({
        id: `meet:room:${r.id}`,
        group: 'Work',
        title: `${r.code} · ${r.title}`,
        subtitle: `LIVE · ${r.participants.length} participants · ${r.decisions.length} decisions captured`,
        icon: <Video />,
        glyphColor: r.color,
        keywords: ['meet', 'room', 'live', r.code.toLowerCase(), r.title.toLowerCase()],
        hint: 'Join room',
        to: `/meet/room?room=${r.id}`,
      });
    }

    for (const rec of st.recordings) {
      out.push({
        id: `meet:rec:${rec.id}`,
        group: 'Work',
        title: `${rec.code} · ${rec.title}`,
        subtitle: `${rec.durationLabel} · ${rec.recordedAtLabel} · ${rec.decisions.length} decisions`,
        icon: <Disc />,
        glyphColor: rec.color,
        keywords: ['meet', 'recording', 'replay', rec.code.toLowerCase(), rec.title.toLowerCase()],
        hint: 'Watch recap',
        to: `/meet/recordings?rec=${rec.id}`,
      });
    }

    for (const c of st.clips) {
      out.push({
        id: `meet:clip:${c.id}`,
        group: 'Work',
        title: `${c.code} · ${c.title}`,
        subtitle: `Async Clip (${c.durationLabel}) · ${c.views} views · ${c.hoursSavedTotal}h saved`,
        icon: <Film />,
        glyphColor: c.color,
        keywords: ['meet', 'clip', 'async', c.code.toLowerCase(), c.title.toLowerCase()],
        hint: 'Play clip',
        to: `/meet/clips?clip=${c.id}`,
      });
    }

    return out;
  },

  resetDemo() {
    useMeet.getState().resetMeet();
  },
};
