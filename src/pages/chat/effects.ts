/**
 * Send-with-effect animations (Confetti, Spotlight, Lasers, Echo). Skipped for reduced motion.
 */
import { burstConfetti } from '@/lib/confetti';
import type { SendEffect } from '@/chat/types';

export const reducedMotion = () => document.documentElement.dataset.motion === 'reduced' || !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function playEffect(effect: SendEffect, el: HTMLElement) {
  if (reducedMotion()) return;
  const list = el.closest('.pc-scroll') as HTMLElement | null;
  switch (effect) {
    case 'confetti': {
      const r = el.getBoundingClientRect();
      burstConfetti({ x: r.left + Math.min(r.width / 2, 260), y: r.top + Math.min(r.height / 2, 60) });
      window.setTimeout(() => burstConfetti({ x: r.left + Math.min(r.width * 0.8, 520), y: r.top + 20 }), 220);
      break;
    }
    case 'spotlight': {
      list?.classList.add('is-spotlight');
      el.classList.add('fx-spotlight');
      window.setTimeout(() => {
        list?.classList.remove('is-spotlight');
        el.classList.remove('fx-spotlight');
      }, 2600);
      break;
    }
    case 'lasers': {
      if (!list) break;
      const layer = document.createElement('div');
      layer.className = 'pc-lasers';
      layer.style.top = `${list.scrollTop}px`;
      layer.style.height = `${list.clientHeight}px`;
      for (let i = 0; i < 6; i++) {
        const beam = document.createElement('i');
        beam.style.setProperty('--d', `${i * 90}ms`);
        beam.style.setProperty('--y', `${12 + i * 15}%`);
        beam.style.setProperty('--rot', `${(i % 2 ? -1 : 1) * (8 + i * 3)}deg`);
        layer.appendChild(beam);
      }
      list.appendChild(layer);
      el.classList.add('fx-lasers');
      window.setTimeout(() => {
        layer.remove();
        el.classList.remove('fx-lasers');
      }, 1900);
      break;
    }
    case 'echo': {
      el.classList.add('fx-echo');
      window.setTimeout(() => el.classList.remove('fx-echo'), 1900);
      break;
    }
  }
}
