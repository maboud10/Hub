import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useCan, useSessionUser } from '@/store/selectors';
import { AccessDenied } from './AccessDenied';

/**
 * Declarative permission gate.
 *   <Can perm="hub.news.publish">…</Can>
 *   <Can perm={['a', 'b']} mode="all" fallback={<Locked />}>…</Can>
 */
export function Can({
  perm,
  mode = 'any',
  fallback = null,
  children,
}: {
  perm: string | readonly string[];
  mode?: 'any' | 'all';
  fallback?: ReactNode;
  children: ReactNode;
}) {
  return useCan(perm, mode) ? <>{children}</> : <>{fallback}</>;
}

/** Redirects to the sign-in screen when there's no session. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const user = useSessionUser();
  const location = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <>{children}</>;
}

/** Route guard: renders the 403 screen when the permission check fails. */
export function RequirePermission({
  perm,
  mode = 'any',
  area,
  children,
}: {
  perm: string | readonly string[];
  mode?: 'any' | 'all';
  area: string;
  children: ReactNode;
}) {
  const allowed = useCan(perm, mode);
  if (!allowed) return <AccessDenied area={area} required={typeof perm === 'string' ? [perm] : [...perm]} />;
  return <>{children}</>;
}
