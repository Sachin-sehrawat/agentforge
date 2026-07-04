import { useEffect, useRef, useState } from 'react';
import useInViewport from '../../useInViewport.jsx';

const DURATION_MS = 1800;

function animateCount(from, to, duration, onTick) {
  const start = performance.now();
  const range = to - from;

  function tick(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    // ease-out cubic
    const eased = 1 - Math.pow(1 - progress, 3);
    onTick(Math.round(from + range * eased));
    if (progress < 1) requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
}

function StatItem({ label, value, animate }) {
  const [displayed, setDisplayed] = useState(0);
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (animate && value !== null && !hasAnimated.current) {
      hasAnimated.current = true;
      animateCount(0, value, DURATION_MS, setDisplayed);
    }
  }, [animate, value]);

  const formatted = value === null ? '—' : displayed.toLocaleString();

  return (
    <div className="stats-bar__item">
      <span className="stats-bar__number">{formatted}</span>
      <span className="stats-bar__label">{label}</span>
    </div>
  );
}

export default function StatsBar() {
  const [ref, inView] = useInViewport({ threshold: 0.2 });
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch('/api/stats')
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(setStats)
      .catch(() => setError(true));
  }, []);

  const items = [
    { key: 'agentsPublished', label: 'agents published' },
    { key: 'forksMade',       label: 'forks made'       },
    { key: 'skillsShared',    label: 'skills shared'    },
  ];

  return (
    <div className="stats-bar" ref={ref}>
      {items.map((item, i) => (
        <div key={item.key} className="stats-bar__row">
          <StatItem
            label={item.label}
            value={error ? null : (stats ? stats[item.key] : 0)}
            animate={inView && !!stats && !error}
          />
          {i < items.length - 1 && <div className="stats-bar__separator" />}
        </div>
      ))}
    </div>
  );
}
