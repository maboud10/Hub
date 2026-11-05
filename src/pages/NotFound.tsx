import { Link } from 'react-router';
import { ArrowLeft, Orbit } from 'lucide-react';

export function NotFound() {
  return (
    <div className="page denied">
      <div className="denied__card card glow-border hud">
        <div className="denied__lock" aria-hidden="true">
          <span className="denied__ring" />
          <span className="denied__ring denied__ring--2" />
          <Orbit />
        </div>
        <div className="eyebrow">Error 404 · Signal lost</div>
        <h1 className="denied__title" data-text="Lost in orbit">
          Lost in orbit
        </h1>
        <p className="muted" style={{ maxWidth: 420, margin: '10px auto 0' }}>
          This page drifted out of range. Try the command palette (⌘K) or head back to base.
        </p>
        <Link to="/" className="btn btn--primary" style={{ marginTop: 26 }}>
          <ArrowLeft /> Back to home
        </Link>
      </div>
    </div>
  );
}
