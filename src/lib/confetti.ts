/** Lightweight CSS confetti burst — no dependencies, skipped for reduced motion. */
export function burstConfetti(origin?: { x: number; y: number }) {
  if (document.documentElement.dataset.motion === 'reduced') return;
  const colors = ['#22d3ee', '#8b5cf6', '#f472b6', '#fbbf24', '#a3e635', '#fb7185'];
  const layer = document.createElement('div');
  layer.className = 'confetti';
  const x = origin?.x ?? window.innerWidth / 2;
  const y = origin?.y ?? window.innerHeight / 2;
  for (let i = 0; i < 46; i++) {
    const p = document.createElement('i');
    const angle = Math.random() * Math.PI * 2;
    const dist = 90 + Math.random() * 220;
    p.style.left = `${x}px`;
    p.style.top = `${y}px`;
    p.style.background = colors[i % colors.length];
    p.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
    p.style.setProperty('--dy', `${Math.sin(angle) * dist - 120}px`);
    p.style.setProperty('--rot', `${Math.random() * 720 - 360}deg`);
    p.style.animationDelay = `${Math.random() * 80}ms`;
    if (i % 3 === 0) p.style.borderRadius = '50%';
    layer.appendChild(p);
  }
  document.body.appendChild(layer);
  window.setTimeout(() => layer.remove(), 1600);
}
