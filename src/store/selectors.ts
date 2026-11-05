/**
 * React hooks over the hub store. Selectors return stable references; derived
 * collections are memoised to avoid re-render loops.
 */
import { useMemo } from 'react';
import { useHub } from './hub';
import { defaultPrefs } from '@/data/seed';
import { ADMIN_PERMISSIONS, appPermissionId } from '@/data/permissions';
import {
  canReviewRequest,
  clearanceOf,
  computeAppAccess,
  effectivePermissions,
  hasAll,
  hasAny,
  hasPermission,
  primaryRole,
} from '@/lib/rbac';
import { useNow } from '@/hooks/useNow';
import type { Announcement, AppWithAccess, HubNotification, UserPrefs } from '@/types';

const FALLBACK_PREFS: UserPrefs = defaultPrefs();

export function useSessionUser() {
  return useHub((s) => s.users.find((u) => u.id === s.sessionUserId) ?? null);
}

export function useUserById(id: string | undefined | null) {
  return useHub((s) => (id ? (s.users.find((u) => u.id === id) ?? null) : null));
}

export function useRoles() {
  return useHub((s) => s.roles);
}

/** Effective permission set for the signed-in user (re-evaluated each minute so grants expire live). */
export function usePermissions() {
  const user = useSessionUser();
  const roles = useRoles();
  const minute = useNow(60_000);
  return useMemo(() => effectivePermissions(user, roles), [user, roles, minute]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** `useCan('hub.users.manage')` or `useCan(['a','b'], 'all')`. */
export function useCan(required: string | readonly string[], mode: 'any' | 'all' = 'any') {
  const perms = usePermissions();
  if (typeof required === 'string') return hasPermission(perms, required);
  return mode === 'all' ? hasAll(perms, required) : hasAny(perms, required);
}

export function useIsAdminArea() {
  return useCan(ADMIN_PERMISSIONS);
}

export function useClearance() {
  const user = useSessionUser();
  const roles = useRoles();
  return useMemo(() => clearanceOf(user, roles), [user, roles]);
}

export function usePrimaryRole() {
  const user = useSessionUser();
  const roles = useRoles();
  return useMemo(() => (user ? primaryRole(user, roles) : undefined), [user, roles]);
}

export function usePrefs(): UserPrefs {
  return useHub((s) => (s.sessionUserId ? s.prefs[s.sessionUserId] : undefined)) ?? FALLBACK_PREFS;
}

/** Every app with the current user's access state (granted / pending / locked / disabled). */
export function useAppAccess(): AppWithAccess[] {
  const user = useSessionUser();
  const roles = useRoles();
  const apps = useHub((s) => s.apps);
  const requests = useHub((s) => s.requests);
  const minute = useNow(60_000);
  return useMemo(() => computeAppAccess(user, roles, apps, requests), [user, roles, apps, requests, minute]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function useAppAccessMap() {
  const list = useAppAccess();
  return useMemo(() => new Map(list.map((a) => [a.app.id, a])), [list]);
}

export function useMyNotifications(): HubNotification[] {
  const id = useHub((s) => s.sessionUserId);
  const all = useHub((s) => s.notifications);
  return useMemo(() => all.filter((n) => n.userId === id).sort((a, b) => b.at - a.at), [all, id]);
}

export function useUnreadCount() {
  const list = useMyNotifications();
  return list.filter((n) => !n.read).length;
}

/** Announcements targeted at the current user (publishers see everything). */
export function useVisibleAnnouncements(): Announcement[] {
  const user = useSessionUser();
  const all = useHub((s) => s.announcements);
  const canPublish = useCan('hub.news.publish');
  return useMemo(() => {
    if (!user) return [];
    return all
      .filter((a) => canPublish || !a.audienceRoleIds.length || a.audienceRoleIds.some((r) => user.roleIds.includes(r)))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt - a.createdAt);
  }, [all, user, canPublish]);
}

/** Pending requests the current user is allowed to decide on. */
export function useReviewableRequests() {
  const user = useSessionUser();
  const requests = useHub((s) => s.requests);
  const perms = usePermissions();
  return useMemo(
    () =>
      requests.filter(
        (r) => r.status === 'pending' && r.userId !== user?.id && canReviewRequest(perms, r.appId).ok,
      ),
    [requests, perms, user],
  );
}

export function useMyRequests() {
  const id = useHub((s) => s.sessionUserId);
  const requests = useHub((s) => s.requests);
  return useMemo(() => requests.filter((r) => r.userId === id).sort((a, b) => b.createdAt - a.createdAt), [requests, id]);
}

export function useHasApp(appId: string) {
  return useCan(appPermissionId(appId));
}
