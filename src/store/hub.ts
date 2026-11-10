/**
 * NEXUS central store.
 *
 * Every mutating action behaves like an API endpoint: it re-checks the session
 * user's permissions (the UI hiding a button is only UX, never security),
 * validates input, writes an audit entry and fans out notifications.
 * Swap the bodies for `fetch()` calls to put a real backend behind it.
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type {
  ActionResult,
  AnnouncementCategory,
  AnnouncementPriority,
  AppCategory,
  AuditEntry,
  Clearance,
  Department,
  GrantDuration,
  HubApp,
  HubData,
  HubNotification,
  KudosValue,
  Presence,
  Role,
  User,
  UserPrefs,
} from '@/types';
import type { IconName } from '@/icons';
import { createSeed, DATA_VERSION, defaultPrefs } from '@/data/seed';
import { hrNotifications, learningNotifications, performanceNotifications, spendPayrollNotifications, talentNotifications, workNotifications } from '@/data/content';
import { appPermissionId } from '@/data/permissions';
import { SUPER_ADMIN_ROLE_ID } from '@/data/roles';
import {
  canAssignRole,
  canReviewRequest,
  clearanceOf,
  DURATION_LABEL,
  effectivePermissions,
  expiryFor,
  hasPermission,
  usersWithPermission,
} from '@/lib/rbac';
import { uid } from '@/lib/id';
import { todayKey } from '@/lib/format';

export interface NewAppInput {
  name: string;
  tagline: string;
  description: string;
  category: AppCategory;
  icon: IconName;
  gradient: [string, string];
  url: string;
  discoverable: boolean;
  badge?: 'new' | 'beta' | null;
}

export interface NewRoleInput {
  name: string;
  description: string;
  clearance: Clearance;
  color: string;
  permissions?: string[];
}

export interface NewAnnouncementInput {
  title: string;
  body: string;
  category: AnnouncementCategory;
  priority: AnnouncementPriority;
  audienceRoleIds: string[];
  pinned: boolean;
}

/** New-hire account created from an HR Portal onboarding journey. */
export interface ProvisionUserInput {
  name: string;
  title: string;
  department: Department;
  location: string;
  managerId?: string;
  /** ISO date of day one. */
  startDate: string;
  avatarHue: number;
  skills: string[];
  /** Defaults to Employee (+ Engineering for engineering hires). */
  roleIds?: string[];
}

export type ProvisionResult = { ok: true; message: string; userId: string; email: string } | { ok: false; error: string };

export interface HubActions {
  login(userId: string): ActionResult;
  logout(): void;
  updatePrefs(patch: Partial<UserPrefs>): void;
  togglePin(appId: string): ActionResult;
  reorderPins(ids: string[]): void;
  recordLaunch(appId: string): ActionResult;
  requestAccess(appId: string, reason: string, duration: GrantDuration): ActionResult;
  cancelRequest(requestId: string): ActionResult;
  reviewRequest(requestId: string, decision: 'approved' | 'denied', opts?: { note?: string; duration?: GrantDuration }): ActionResult;
  setUserRoles(userId: string, roleIds: string[]): ActionResult;
  setUserActive(userId: string, active: boolean): ActionResult;
  grantAccess(userId: string, permission: string, duration: GrantDuration, reason?: string): ActionResult;
  revokeGrant(userId: string, permission: string): ActionResult;
  setRolePermission(roleId: string, permission: string, enabled: boolean): ActionResult;
  createRole(input: NewRoleInput): ActionResult;
  updateRole(roleId: string, patch: Partial<Pick<Role, 'name' | 'description' | 'clearance' | 'color'>>): ActionResult;
  deleteRole(roleId: string): ActionResult;
  updateApp(appId: string, patch: Partial<Omit<HubApp, 'id'>>): ActionResult;
  createApp(input: NewAppInput, roleIds: string[]): ActionResult;
  deleteApp(appId: string): ActionResult;
  publishAnnouncement(input: NewAnnouncementInput): ActionResult;
  deleteAnnouncement(id: string): ActionResult;
  togglePinAnnouncement(id: string): ActionResult;
  reactToAnnouncement(id: string, emoji: string): void;
  markNotificationRead(id: string): void;
  markAllNotificationsRead(): void;
  setPresence(presence: Presence, statusMessage?: string): void;
  giveKudos(toId: string, value: KudosValue, message: string): ActionResult;
  votePulse(mood: 1 | 2 | 3 | 4 | 5): void;
  resetDemo(): void;
  // ── cross-module hooks (Talent Hub, HR Portal) ──
  /** Append to the shared security audit trail (actor defaults to the session user). */
  logAudit(entry: Omit<AuditEntry, 'id' | 'at' | 'actorId'> & { actorId?: string }): void;
  /** Deliver in-app notifications to users. */
  pushNotifications(userIds: string[], n: Omit<HubNotification, 'id' | 'userId' | 'at' | 'read'>): void;
  /** Create a NEXUS account for a new hire (requires `hub.users.manage`, roles within your clearance). */
  provisionUser(input: ProvisionUserInput): ProvisionResult;
}

export type HubStore = HubData & HubActions;

/** Immersive workspace apps whose catalog visuals always follow the seed (declared before the store hydrates). */
const WORKSPACE_APPS = new Set(['projects', 'drive', 'chat', 'helpdesk', 'performance', 'procurement', 'crm', 'analytics']);

const ok = (message?: string): ActionResult => ({ ok: true, message });
const fail = (error: string): ActionResult => ({ ok: false, error });

const SENSITIVE_APPS = new Set(['security', 'vault', 'payroll', 'cloud']);
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 24) || 'item';

export const useHub = create<HubStore>()(
  persist(
    (set, get) => {
      // ───────────────────────── helpers ─────────────────────────
      const me = () => {
        const s = get();
        return s.users.find((u) => u.id === s.sessionUserId) ?? null;
      };
      const permsOf = (u: User | null) => effectivePermissions(u, get().roles);
      const userName = (id: string) => get().users.find((u) => u.id === id)?.name ?? 'Unknown user';
      const appName = (id: string) => get().apps.find((a) => a.id === id)?.name ?? id;

      const audit = (e: Omit<AuditEntry, 'id' | 'at' | 'actorId'> & { actorId?: string }) =>
        set((s) => ({
          audit: [{ id: uid('au'), at: Date.now(), actorId: e.actorId ?? s.sessionUserId ?? 'system', ...e }, ...s.audit].slice(0, 500),
        }));

      const notify = (userIds: string[], n: Omit<HubNotification, 'id' | 'userId' | 'at' | 'read'>) => {
        const ids = [...new Set(userIds)];
        if (!ids.length) return;
        set((s) => ({
          notifications: [
            ...ids.map((userId) => ({ id: uid('n'), userId, at: Date.now(), read: false, ...n })),
            ...s.notifications,
          ].slice(0, 400),
        }));
      };

      /** Server-style permission gate. Logs denied attempts to the audit trail. */
      const requirePerm = (perm: string, action: string, target: string): { user: User } | { error: ActionResult } => {
        const user = me();
        if (!user) return { error: fail('You are not signed in.') };
        if (!hasPermission(permsOf(user), perm)) {
          audit({ action, target, detail: `Missing permission ${perm}`, outcome: 'denied', severity: 'warning' });
          return { error: fail('You don’t have permission to do that.') };
        }
        return { user };
      };

      const updateUser = (id: string, fn: (u: User) => User) => set((s) => ({ users: s.users.map((u) => (u.id === id ? fn(u) : u)) }));

      const updateMyPrefs = (fn: (p: UserPrefs) => UserPrefs) =>
        set((s) => {
          const id = s.sessionUserId;
          if (!id) return {};
          return { prefs: { ...s.prefs, [id]: fn(s.prefs[id] ?? defaultPrefs()) } };
        });

      const activeAdmins = (excludeId?: string) =>
        get().users.filter((u) => u.active && u.id !== excludeId && u.roleIds.includes(SUPER_ADMIN_ROLE_ID));

      return {
        ...createSeed(),

        // ───────────────────────── session ─────────────────────────
        login(userId) {
          const user = get().users.find((u) => u.id === userId);
          if (!user) return fail('Unknown identity.');
          if (!user.active) {
            audit({ actorId: userId, action: 'session.login', target: user.name, detail: 'Account deactivated', outcome: 'denied', severity: 'warning' });
            return fail('This account is deactivated. Contact IT.');
          }
          set((s) => ({
            sessionUserId: userId,
            prefs: s.prefs[userId] ? s.prefs : { ...s.prefs, [userId]: defaultPrefs() },
          }));
          updateUser(userId, (u) => ({ ...u, lastActiveAt: Date.now(), presence: u.presence === 'offline' ? 'online' : u.presence }));
          audit({ actorId: userId, action: 'session.login', target: user.name, detail: 'Passkey + device trust', outcome: 'success', severity: 'info' });
          return ok();
        },

        logout() {
          const user = me();
          if (user) audit({ action: 'session.logout', target: user.name, outcome: 'success', severity: 'info' });
          set({ sessionUserId: null });
        },

        updatePrefs(patch) {
          updateMyPrefs((p) => ({ ...p, ...patch }));
        },

        // ───────────────────────── launchpad ─────────────────────────
        togglePin(appId) {
          const user = me();
          if (!user) return fail('Not signed in.');
          const prefs = get().prefs[user.id] ?? defaultPrefs();
          const pinned = prefs.pinned.includes(appId);
          if (!pinned) {
            if (!hasPermission(permsOf(user), appPermissionId(appId))) return fail('You can only pin apps you have access to.');
            if (prefs.pinned.length >= 12) return fail('Your dock is full (12 apps). Unpin something first.');
          }
          updateMyPrefs((p) => ({ ...p, pinned: pinned ? p.pinned.filter((id) => id !== appId) : [...p.pinned, appId] }));
          return ok(pinned ? `Unpinned ${appName(appId)}` : `Pinned ${appName(appId)} to your dock`);
        },

        reorderPins(ids) {
          updateMyPrefs((p) => ({ ...p, pinned: ids }));
        },

        recordLaunch(appId) {
          const user = me();
          if (!user) return fail('Not signed in.');
          const app = get().apps.find((a) => a.id === appId);
          if (!app || !app.enabled) return fail('This app is unavailable.');
          if (!hasPermission(permsOf(user), appPermissionId(appId))) {
            audit({ action: 'app.launch', target: app.name, detail: 'Launch blocked — no access', outcome: 'denied', severity: 'warning' });
            return fail(`You don’t have access to ${app.name}.`);
          }
          updateMyPrefs((p) => ({
            ...p,
            recents: [{ appId, at: Date.now() }, ...p.recents.filter((r) => r.appId !== appId)].slice(0, 8),
            launchCounts: { ...p.launchCounts, [appId]: (p.launchCounts[appId] ?? 0) + 1 },
          }));
          if (SENSITIVE_APPS.has(appId)) {
            audit({ action: 'app.launch', target: app.name, detail: 'Sensitive app session opened', outcome: 'success', severity: 'info' });
          }
          return ok();
        },

        // ───────────────────────── access requests ─────────────────────────
        requestAccess(appId, reason, duration) {
          const user = me();
          if (!user) return fail('Not signed in.');
          const app = get().apps.find((a) => a.id === appId);
          if (!app || !app.enabled) return fail('This app is unavailable.');
          const perm = appPermissionId(appId);
          if (hasPermission(permsOf(user), perm)) return fail(`You already have access to ${app.name}.`);
          if (get().requests.some((r) => r.userId === user.id && r.appId === appId && r.status === 'pending'))
            return fail('You already have a pending request for this app.');
          if (reason.trim().length < 10) return fail('Please add a short justification (10+ characters).');

          const request = { id: uid('r'), userId: user.id, appId, reason: reason.trim(), duration, status: 'pending' as const, createdAt: Date.now() };
          set((s) => ({ requests: [request, ...s.requests] }));

          // Route to reviewers who can actually approve (delegated approval), else to admins.
          const { users, roles } = get();
          let reviewers = usersWithPermission(users, roles, 'hub.requests.review').filter(
            (u) => u.id !== user.id && hasPermission(effectivePermissions(u, roles), perm),
          );
          if (!reviewers.length) reviewers = activeAdmins(user.id);
          notify(
            reviewers.map((u) => u.id),
            { kind: 'request', title: 'New access request', body: `${user.name} requested ${app.name} for ${DURATION_LABEL[duration].toLowerCase()}.`, link: '/admin/requests' },
          );
          notify([user.id], { kind: 'access', title: 'Request submitted', body: `${app.name} · routed to ${reviewers.length} reviewer${reviewers.length === 1 ? '' : 's'}.`, link: '/settings' });
          audit({ action: 'access.request.created', target: `${user.name} → ${app.name}`, detail: `${DURATION_LABEL[duration]} · “${reason.trim().slice(0, 80)}”`, outcome: 'success', severity: 'info' });
          return ok(`Request sent to ${reviewers.length} reviewer${reviewers.length === 1 ? '' : 's'}`);
        },

        cancelRequest(requestId) {
          const user = me();
          const req = get().requests.find((r) => r.id === requestId);
          if (!user || !req) return fail('Request not found.');
          if (req.userId !== user.id) return fail('You can only cancel your own requests.');
          if (req.status !== 'pending') return fail('Only pending requests can be cancelled.');
          set((s) => ({ requests: s.requests.map((r) => (r.id === requestId ? { ...r, status: 'cancelled' } : r)) }));
          audit({ action: 'access.request.cancelled', target: `${user.name} → ${appName(req.appId)}`, outcome: 'success', severity: 'info' });
          return ok('Request cancelled');
        },

        reviewRequest(requestId, decision, opts = {}) {
          const req = get().requests.find((r) => r.id === requestId);
          const target = req ? `${userName(req.userId)} → ${appName(req.appId)}` : requestId;
          const g = requirePerm('hub.requests.review', `access.request.${decision}`, target);
          if ('error' in g) return g.error;
          const reviewer = g.user;
          if (!req || req.status !== 'pending') return fail('This request is no longer pending.');
          if (req.userId === reviewer.id) {
            audit({ action: `access.request.${decision}`, target, detail: 'Self-approval blocked (separation of duties)', outcome: 'denied', severity: 'critical' });
            return fail('Separation of duties: you can’t review your own request.');
          }
          const requester = get().users.find((u) => u.id === req.userId);
          if (!requester || !requester.active) {
            return fail('Cannot review a request for a deactivated or missing user.');
          }
          const check = canReviewRequest(permsOf(reviewer), req.appId);
          if (!check.ok) {
            audit({ action: `access.request.${decision}`, target, detail: check.reason, outcome: 'denied', severity: 'warning' });
            return fail(check.reason ?? 'Not allowed.');
          }

          const duration = opts.duration ?? req.duration;
          const now = Date.now();
          if (decision === 'approved') {
            const perm = appPermissionId(req.appId);
            const alreadyHasViaRole = get()
              .roles.filter((r) => requester.roleIds.includes(r.id))
              .some((r) => hasPermission(new Set(r.permissions), perm));
            if (!alreadyHasViaRole) {
              updateUser(req.userId, (u) => ({
                ...u,
                grants: [
                  ...u.grants.filter((gr) => gr.permission !== perm),
                  { permission: perm, grantedBy: reviewer.id, grantedAt: now, expiresAt: expiryFor(duration, now), reason: req.reason },
                ],
              }));
            }
          }
          set((s) => ({
            requests: s.requests.map((r) =>
              r.id === requestId
                ? { ...r, status: decision, reviewedBy: reviewer.id, reviewedAt: now, reviewNote: opts.note?.trim() || undefined, grantedDuration: decision === 'approved' ? duration : undefined }
                : r,
            ),
          }));
          notify([req.userId], {
            kind: 'access',
            title: decision === 'approved' ? `Access granted: ${appName(req.appId)}` : `Request declined: ${appName(req.appId)}`,
            body:
              decision === 'approved'
                ? `Approved by ${reviewer.name}${duration === 'permanent' ? '' : ` · expires in ${DURATION_LABEL[duration].toLowerCase()}`}.`
                : `${reviewer.name}: ${opts.note?.trim() || 'No reason given.'}`,
            link: decision === 'approved' ? '/apps' : '/settings',
          });
          audit({
            action: `access.request.${decision}`,
            target,
            detail: decision === 'approved' ? `Time-boxed: ${DURATION_LABEL[duration]}` : opts.note?.trim(),
            outcome: 'success',
            severity: decision === 'approved' && duration === 'permanent' ? 'warning' : 'info',
          });
          return ok(decision === 'approved' ? `Approved · ${DURATION_LABEL[duration]}` : 'Request declined');
        },

        // ───────────────────────── users ─────────────────────────
        setUserRoles(userId, roleIds) {
          const target = get().users.find((u) => u.id === userId);
          const g = requirePerm('hub.users.manage', 'user.roles.update', target?.name ?? userId);
          if ('error' in g) return g.error;
          const actor = g.user;
          if (!target) return fail('User not found.');
          if (!roleIds.length) return fail('Users need at least one role.');
          const { roles } = get();
          const myClearance = clearanceOf(actor, roles);
          if (clearanceOf(target, roles) > myClearance) {
            audit({
              action: 'user.roles.blocked',
              target: target.name,
              detail: `Target clearance L${clearanceOf(target, roles)} exceeds actor clearance L${myClearance}`,
              outcome: 'denied',
              severity: 'critical',
            });
            return fail('You can’t modify roles on an account with higher clearance than yours.');
          }
          const added = roleIds.filter((id) => !target.roleIds.includes(id));
          const removed = target.roleIds.filter((id) => !roleIds.includes(id));
          for (const id of [...added, ...removed]) {
            const role = roles.find((r) => r.id === id);
            if (role && !canAssignRole(myClearance, role)) {
              audit({
                action: 'user.roles.blocked',
                target: target.name,
                detail: `Attempted to ${added.includes(id) ? 'assign' : 'remove'} ${role.name} (L${role.clearance}) above own clearance (L${myClearance})`,
                outcome: 'denied',
                severity: 'critical',
              });
              return fail(`Privilege escalation blocked: ${role.name} is L${role.clearance}, your clearance is L${myClearance}.`);
            }
          }
          if (removed.includes(SUPER_ADMIN_ROLE_ID)) {
            if (target.id === actor.id) return fail('Lockout protection: you can’t remove your own System Admin role.');
            if (!activeAdmins(target.id).length) return fail('At least one active System Admin is required.');
          }
          updateUser(userId, (u) => ({ ...u, roleIds: [...roleIds] }));
          const names = (ids: string[]) => ids.map((id) => roles.find((r) => r.id === id)?.name ?? id).join(', ');
          const detail = [added.length && `Added ${names(added)}`, removed.length && `Removed ${names(removed)}`].filter(Boolean).join(' · ');
          audit({ action: 'user.roles.updated', target: target.name, detail: detail || 'No change', outcome: 'success', severity: 'warning' });
          if (target.id !== actor.id) notify([target.id], { kind: 'access', title: 'Your roles were updated', body: `${detail} by ${actor.name}.`, link: '/settings' });
          return ok(`Roles updated for ${target.name}`);
        },

        setUserActive(userId, active) {
          const target = get().users.find((u) => u.id === userId);
          const g = requirePerm('hub.users.manage', active ? 'user.reactivated' : 'user.deactivated', target?.name ?? userId);
          if ('error' in g) return g.error;
          const actor = g.user;
          if (!target) return fail('User not found.');
          if (target.id === actor.id) return fail('You can’t deactivate your own account.');
          const { roles } = get();
          if (clearanceOf(target, roles) > clearanceOf(actor, roles)) {
            audit({ action: 'user.deactivated', target: target.name, detail: 'Target has higher clearance', outcome: 'denied', severity: 'critical' });
            return fail('You can’t change accounts with higher clearance than yours.');
          }
          if (!active && target.roleIds.includes(SUPER_ADMIN_ROLE_ID) && !activeAdmins(target.id).length)
            return fail('At least one active System Admin is required.');
          updateUser(userId, (u) => ({ ...u, active, presence: 'offline' }));
          audit({ action: active ? 'user.reactivated' : 'user.deactivated', target: target.name, outcome: 'success', severity: 'warning' });
          return ok(`${target.name} ${active ? 'reactivated' : 'deactivated'}`);
        },

        grantAccess(userId, permission, duration, reason) {
          const target = get().users.find((u) => u.id === userId);
          const g = requirePerm('hub.users.manage', 'user.grant.added', target?.name ?? userId);
          if ('error' in g) return g.error;
          const actor = g.user;
          if (!target) return fail('User not found.');
          if (!hasPermission(permsOf(actor), permission)) {
            audit({ action: 'user.grant.added', target: target.name, detail: `Tried to grant ${permission} without holding it`, outcome: 'denied', severity: 'critical' });
            return fail('You can’t grant access you don’t hold yourself.');
          }
          const now = Date.now();
          updateUser(userId, (u) => ({
            ...u,
            grants: [...u.grants.filter((gr) => gr.permission !== permission), { permission, grantedBy: actor.id, grantedAt: now, expiresAt: expiryFor(duration, now), reason }],
          }));
          const label = permission.startsWith('app:') ? appName(permission.slice(4)) : permission;
          audit({ action: 'user.grant.added', target: `${target.name} · ${label}`, detail: DURATION_LABEL[duration], outcome: 'success', severity: 'warning' });
          notify([target.id], { kind: 'access', title: `Access granted: ${label}`, body: `Granted by ${actor.name} · ${DURATION_LABEL[duration]}.`, link: '/apps' });
          return ok(`Granted ${label} to ${target.name}`);
        },

        revokeGrant(userId, permission) {
          const target = get().users.find((u) => u.id === userId);
          const g = requirePerm('hub.users.manage', 'user.grant.revoked', target?.name ?? userId);
          if ('error' in g) return g.error;
          if (!target) return fail('User not found.');
          updateUser(userId, (u) => ({ ...u, grants: u.grants.filter((gr) => gr.permission !== permission) }));
          const label = permission.startsWith('app:') ? appName(permission.slice(4)) : permission;
          audit({ action: 'user.grant.revoked', target: `${target.name} · ${label}`, outcome: 'success', severity: 'warning' });
          notify([target.id], { kind: 'access', title: `Access removed: ${label}`, body: `Revoked by ${g.user.name}.`, link: '/settings' });
          return ok(`Revoked ${label}`);
        },

        // ───────────────────────── roles ─────────────────────────
        setRolePermission(roleId, permission, enabled) {
          const role = get().roles.find((r) => r.id === roleId);
          const label = permission.startsWith('app:') ? appName(permission.slice(4)) : permission;
          const g = requirePerm('hub.roles.manage', 'role.permission.update', `${role?.name ?? roleId} · ${label}`);
          if ('error' in g) return g.error;
          const actor = g.user;
          if (!role) return fail('Role not found.');
          if (role.locked) return fail(`${role.name} is locked and always has full access.`);
          const myClearance = clearanceOf(actor, get().roles);
          if (role.clearance > myClearance) {
            audit({ action: 'role.permission.blocked', target: `${role.name} · ${label}`, detail: `Role L${role.clearance} above own clearance L${myClearance}`, outcome: 'denied', severity: 'critical' });
            return fail(`You can’t edit ${role.name} (L${role.clearance}) — above your clearance.`);
          }
          if (enabled && !hasPermission(permsOf(actor), permission)) {
            audit({ action: 'role.permission.blocked', target: `${role.name} · ${label}`, detail: 'Cannot grant a permission you do not hold', outcome: 'denied', severity: 'critical' });
            return fail('You can’t grant a permission you don’t hold yourself.');
          }
          set((s) => ({
            roles: s.roles.map((r) =>
              r.id === roleId
                ? { ...r, permissions: enabled ? [...new Set([...r.permissions, permission])] : r.permissions.filter((p) => p !== permission) }
                : r,
            ),
          }));
          audit({ action: enabled ? 'role.permission.granted' : 'role.permission.revoked', target: `${role.name} · ${label}`, outcome: 'success', severity: 'warning' });
          return ok(`${enabled ? 'Granted' : 'Revoked'} ${label} ${enabled ? 'to' : 'from'} ${role.name}`);
        },

        createRole(input) {
          const g = requirePerm('hub.roles.manage', 'role.created', input.name);
          if ('error' in g) return g.error;
          const name = input.name.trim();
          if (name.length < 3) return fail('Role name must be at least 3 characters.');
          if (get().roles.some((r) => r.name.toLowerCase() === name.toLowerCase())) return fail('A role with that name already exists.');
          const myClearance = clearanceOf(g.user, get().roles);
          if (input.clearance > myClearance) return fail(`You can only create roles up to L${myClearance}.`);
          const role: Role = {
            id: `${slug(name)}-${Math.random().toString(36).slice(2, 5)}`,
            name,
            description: input.description.trim() || 'Custom role',
            clearance: input.clearance,
            color: input.color,
            permissions: (input.permissions ?? []).filter((p) => hasPermission(permsOf(g.user), p)),
          };
          set((s) => ({ roles: [...s.roles, role] }));
          audit({ action: 'role.created', target: role.name, detail: `Clearance L${role.clearance}`, outcome: 'success', severity: 'warning' });
          return ok(`Role “${role.name}” created`);
        },

        updateRole(roleId, patch) {
          const role = get().roles.find((r) => r.id === roleId);
          const g = requirePerm('hub.roles.manage', 'role.updated', role?.name ?? roleId);
          if ('error' in g) return g.error;
          if (!role) return fail('Role not found.');
          const myClearance = clearanceOf(g.user, get().roles);
          if (role.clearance > myClearance || (patch.clearance && patch.clearance > myClearance))
            return fail('That change exceeds your clearance.');
          if (role.locked && patch.clearance && patch.clearance !== role.clearance) return fail('Locked roles keep their clearance.');
          set((s) => ({ roles: s.roles.map((r) => (r.id === roleId ? { ...r, ...patch } : r)) }));
          audit({ action: 'role.updated', target: role.name, detail: Object.keys(patch).join(', '), outcome: 'success', severity: 'info' });
          return ok('Role updated');
        },

        deleteRole(roleId) {
          const role = get().roles.find((r) => r.id === roleId);
          const g = requirePerm('hub.roles.manage', 'role.deleted', role?.name ?? roleId);
          if ('error' in g) return g.error;
          if (!role) return fail('Role not found.');
          if (role.system) return fail('Built-in roles can’t be deleted.');
          if (role.clearance > clearanceOf(g.user, get().roles)) return fail('That role is above your clearance.');
          set((s) => ({
            roles: s.roles.filter((r) => r.id !== roleId),
            users: s.users.map((u) => {
              if (!u.roleIds.includes(roleId)) return u;
              const next = u.roleIds.filter((id) => id !== roleId);
              return { ...u, roleIds: next.length ? next : ['employee'] };
            }),
            announcements: s.announcements.map((a) => ({ ...a, audienceRoleIds: a.audienceRoleIds.filter((id) => id !== roleId) })),
          }));
          audit({ action: 'role.deleted', target: role.name, outcome: 'success', severity: 'critical' });
          return ok(`Role “${role.name}” deleted`);
        },

        // ───────────────────────── apps ─────────────────────────
        updateApp(appId, patch) {
          const app = get().apps.find((a) => a.id === appId);
          const g = requirePerm('hub.apps.manage', 'app.updated', app?.name ?? appId);
          if ('error' in g) return g.error;
          if (!app) return fail('App not found.');
          set((s) => ({ apps: s.apps.map((a) => (a.id === appId ? { ...a, ...patch } : a)) }));
          const detail = Object.entries(patch)
            .map(([k, v]) => `${k} → ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
            .join(', ');
          audit({ action: 'app.updated', target: app.name, detail, outcome: 'success', severity: 'info' });
          if (patch.status && patch.status !== 'operational' && patch.status !== app.status) {
            const watchers = Object.entries(get().prefs)
              .filter(([, p]) => p.pinned.includes(appId))
              .map(([uidKey]) => uidKey)
              .filter((id) => id !== g.user.id);
            notify(watchers, {
              kind: 'system',
              title: `${app.name} is ${patch.status === 'maintenance' ? 'under maintenance' : 'degraded'}`,
              body: 'You pinned this app — we’ll keep you posted.',
              link: '/apps',
            });
          }
          return ok(`${app.name} updated`);
        },

        createApp(input, roleIds) {
          const g = requirePerm('hub.apps.manage', 'app.created', input.name);
          if ('error' in g) return g.error;
          const name = input.name.trim();
          if (name.length < 2) return fail('App name is required.');
          if (!/^https?:\/\//i.test(input.url.trim())) return fail('URL must start with http:// or https://');
          if (roleIds.length && !hasPermission(permsOf(g.user), 'hub.roles.manage'))
            return fail('Assigning roles requires “Manage roles & permissions”.');
          let id = slug(name);
          if (get().apps.some((a) => a.id === id)) id = `${id}-${Math.random().toString(36).slice(2, 5)}`;
          const app: HubApp = {
            id,
            ...input,
            name,
            url: input.url.trim(),
            keywords: name.toLowerCase().split(/\s+/),
            status: 'operational',
            enabled: true,
            owner: g.user.department,
            addedAt: Date.now(),
            custom: true,
            badge: input.badge ?? 'new',
          };
          const perm = appPermissionId(id);
          set((s) => ({
            apps: [...s.apps, app],
            roles: s.roles.map((r) => (roleIds.includes(r.id) && !r.locked ? { ...r, permissions: [...r.permissions, perm] } : r)),
          }));
          audit({ action: 'app.created', target: app.name, detail: `Access: ${roleIds.length ? roleIds.join(', ') : 'admins only'}`, outcome: 'success', severity: 'info' });
          return ok(`${app.name} registered`);
        },

        deleteApp(appId) {
          const app = get().apps.find((a) => a.id === appId);
          const g = requirePerm('hub.apps.manage', 'app.deleted', app?.name ?? appId);
          if ('error' in g) return g.error;
          if (!app) return fail('App not found.');
          if (!app.custom) return fail('Built-in apps can be disabled, not deleted.');
          const perm = appPermissionId(appId);
          set((s) => ({
            apps: s.apps.filter((a) => a.id !== appId),
            roles: s.roles.map((r) => ({ ...r, permissions: r.permissions.filter((p) => p !== perm) })),
            users: s.users.map((u) => ({ ...u, grants: u.grants.filter((gr) => gr.permission !== perm) })),
            prefs: Object.fromEntries(Object.entries(s.prefs).map(([k, p]) => [k, { ...p, pinned: p.pinned.filter((id) => id !== appId) }])),
          }));
          audit({ action: 'app.deleted', target: app.name, outcome: 'success', severity: 'warning' });
          return ok(`${app.name} removed`);
        },

        // ───────────────────────── news ─────────────────────────
        publishAnnouncement(input) {
          const g = requirePerm('hub.news.publish', 'news.published', input.title);
          if ('error' in g) return g.error;
          if (input.title.trim().length < 4) return fail('Give your announcement a title (4+ characters).');
          if (input.body.trim().length < 10) return fail('Add a little more detail (10+ characters).');
          const a = { id: uid('a'), ...input, title: input.title.trim(), body: input.body.trim(), authorId: g.user.id, createdAt: Date.now(), reactions: {} };
          set((s) => ({ announcements: [a, ...s.announcements] }));
          const audience = get().users.filter(
            (u) => u.active && u.id !== g.user.id && (!input.audienceRoleIds.length || u.roleIds.some((r) => input.audienceRoleIds.includes(r))),
          );
          notify(
            audience.map((u) => u.id),
            { kind: 'announcement', title: input.priority === 'critical' ? `Critical: ${a.title}` : a.title, body: `${g.user.name} · ${input.category}`, link: '/news' },
          );
          audit({ action: 'news.published', target: a.title, detail: `Audience: ${input.audienceRoleIds.length ? input.audienceRoleIds.join(', ') : 'everyone'} (${audience.length})`, outcome: 'success', severity: 'info' });
          return ok(`Published to ${audience.length} people`);
        },

        deleteAnnouncement(id) {
          const a = get().announcements.find((x) => x.id === id);
          const g = requirePerm('hub.news.publish', 'news.deleted', a?.title ?? id);
          if ('error' in g) return g.error;
          set((s) => ({ announcements: s.announcements.filter((x) => x.id !== id) }));
          audit({ action: 'news.deleted', target: a?.title ?? id, outcome: 'success', severity: 'info' });
          return ok('Announcement removed');
        },

        togglePinAnnouncement(id) {
          const a = get().announcements.find((x) => x.id === id);
          const g = requirePerm('hub.news.publish', 'news.pinned', a?.title ?? id);
          if ('error' in g) return g.error;
          if (!a) return fail('Not found.');
          set((s) => ({ announcements: s.announcements.map((x) => (x.id === id ? { ...x, pinned: !x.pinned } : x)) }));
          return ok(a.pinned ? 'Unpinned' : 'Pinned to top');
        },

        reactToAnnouncement(id, emoji) {
          const user = me();
          if (!user) return;
          set((s) => ({
            announcements: s.announcements.map((a) => {
              if (a.id !== id) return a;
              const list = a.reactions[emoji] ?? [];
              const next = list.includes(user.id) ? list.filter((x) => x !== user.id) : [...list, user.id];
              return { ...a, reactions: { ...a.reactions, [emoji]: next } };
            }),
          }));
        },

        // ───────────────────────── notifications ─────────────────────────
        markNotificationRead(id) {
          const uidNow = get().sessionUserId;
          set((s) => ({ notifications: s.notifications.map((n) => (n.id === id && n.userId === uidNow ? { ...n, read: true } : n)) }));
        },

        markAllNotificationsRead() {
          const uidNow = get().sessionUserId;
          set((s) => ({ notifications: s.notifications.map((n) => (n.userId === uidNow ? { ...n, read: true } : n)) }));
        },

        // ───────────────────────── presence & engagement ─────────────────────────
        setPresence(presence, statusMessage) {
          const user = me();
          if (!user) return;
          updateUser(user.id, (u) => ({ ...u, presence, statusMessage: statusMessage ?? u.statusMessage }));
        },

        giveKudos(toId, value, message) {
          const g = requirePerm('hub.kudos.give', 'kudos.given', userName(toId));
          if ('error' in g) return g.error;
          if (toId === g.user.id) return fail('Nice try — kudos are for others 😄');
          if (message.trim().length < 5) return fail('Say a little more (5+ characters).');
          const recipient = get().users.find((u) => u.id === toId);
          if (!recipient) return fail('Recipient not found.');
          set((s) => ({ kudos: [{ id: uid('k'), fromId: g.user.id, toId, value, message: message.trim(), at: Date.now() }, ...s.kudos] }));
          notify([toId], { kind: 'kudos', title: 'You received kudos 🎉', body: `${g.user.name}: “${message.trim().slice(0, 80)}”`, link: '/' });
          return ok(`Kudos sent to ${recipient.name.split(' ')[0]}!`);
        },

        votePulse(mood) {
          const id = get().sessionUserId;
          if (!id) return;
          set((s) => ({ pulse: { ...s.pulse, [id]: { date: todayKey(), mood } } }));
        },

        resetDemo() {
          const session = get().sessionUserId;
          const seed = createSeed();
          set({ ...seed, sessionUserId: seed.users.some((u) => u.id === session) ? session : null });
          audit({ action: 'demo.reset', target: 'Workspace', detail: 'Demo data restored', outcome: 'success', severity: 'info' });
        },

        // ───────────────────────── cross-module hooks ─────────────────────────
        logAudit(entry) {
          audit(entry);
        },

        pushNotifications(userIds, n) {
          notify(userIds, n);
        },

        provisionUser(input) {
          const pfail = (error: string): ProvisionResult => ({ ok: false, error });
          const g = requirePerm('hub.users.manage', 'user.provisioned', input.name);
          if ('error' in g) return pfail(g.error.ok ? 'Not allowed.' : g.error.error);
          const actor = g.user;
          const { users, roles } = get();
          const name = input.name.trim();
          if (name.split(/\s+/).length < 2) return pfail('Enter the new hire’s full name.');
          const roleIds = input.roleIds?.length
            ? [...new Set(input.roleIds)]
            : input.department === 'Engineering'
              ? ['engineering', 'employee']
              : input.department === 'Finance'
                ? ['finance', 'employee']
                : ['employee'];
          const myClearance = clearanceOf(actor, roles);
          for (const id of roleIds) {
            const role = roles.find((r) => r.id === id);
            if (!role) return pfail(`Unknown role “${id}”.`);
            if (!canAssignRole(myClearance, role)) {
              audit({ action: 'user.provisioned', target: name, detail: `Role ${role.name} (L${role.clearance}) above own clearance`, outcome: 'denied', severity: 'critical' });
              return pfail(`Privilege escalation blocked: ${role.name} is above your clearance.`);
            }
          }
          const [first, ...rest] = name.split(/\s+/);
          const last = rest[rest.length - 1];
          const base = `${first}.${last}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z.]/g, '');
          let email = `${base}@helix.co`;
          for (let i = 2; users.some((u) => u.email === email); i += 1) email = `${base}${i}@helix.co`;
          if (users.some((u) => u.name.toLowerCase() === name.toLowerCase() && u.active && u.startDate === input.startDate))
            return pfail(`${name} already has a NEXUS account.`);
          const nextId = Math.max(0, ...users.map((u) => Number(u.employeeId.replace(/\D/g, '')) || 0)) + 1;
          const TZ: [RegExp, string][] = [
            [/dubai|abu dhabi|sharjah|uae/i, 'Asia/Dubai'],
            [/riyadh|jeddah|saudi/i, 'Asia/Riyadh'],
            [/london|uk/i, 'Europe/London'],
            [/berlin|germany/i, 'Europe/Berlin'],
            [/lisbon|portugal/i, 'Europe/Lisbon'],
            [/singapore/i, 'Asia/Singapore'],
            [/bengaluru|bangalore|india/i, 'Asia/Kolkata'],
            [/accra|ghana/i, 'Africa/Accra'],
            [/cairo|egypt/i, 'Africa/Cairo'],
          ];
          let userId = `u-${slug(first)}`;
          if (users.some((u) => u.id === userId)) userId = `u-${slug(first)}-${slug(last)}`;
          if (users.some((u) => u.id === userId)) userId = uid('u');
          const user: User = {
            id: userId,
            name,
            email,
            title: input.title,
            department: input.department,
            location: input.location,
            timezone: TZ.find(([re]) => re.test(input.location))?.[1] ?? 'Asia/Dubai',
            roleIds,
            grants: [],
            active: true,
            presence: 'offline',
            statusMessage: `Joining on ${input.startDate} 👋`,
            avatarHue: input.avatarHue,
            skills: input.skills.slice(0, 6),
            managerId: input.managerId,
            phone: '—',
            employeeId: `HX-${String(nextId).padStart(4, '0')}`,
            startDate: input.startDate,
          };
          set((s) => ({ users: [...s.users, user], prefs: { ...s.prefs, [userId]: defaultPrefs() } }));
          const roleNames = roleIds.map((id) => roles.find((r) => r.id === id)?.name ?? id).join(', ');
          audit({ action: 'user.provisioned', target: name, detail: `${email} · ${roleNames} · starts ${input.startDate}`, outcome: 'success', severity: 'warning' });
          if (input.managerId && input.managerId !== actor.id)
            notify([input.managerId], { kind: 'talent', title: `NEXUS account ready for ${first}`, body: `${email} · ${roleNames}. Access activates on day one.`, link: '/people' });
          return { ok: true, message: `Account created: ${email}`, userId, email };
        },
      };
    },
    {
      name: 'nexus-hub',
      version: DATA_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (s): HubData => ({
        version: s.version,
        sessionUserId: s.sessionUserId,
        users: s.users,
        roles: s.roles,
        apps: s.apps,
        requests: s.requests,
        audit: s.audit,
        announcements: s.announcements,
        notifications: s.notifications,
        kudos: s.kudos,
        prefs: s.prefs,
        pulse: s.pulse,
      }),
      migrate: (persisted, version) => {
        let s = persisted as HubData;
        if (version === DATA_VERSION) {
          // Safety net: re-apply the latest migration if workspace-app routes went missing or roster is still present.
          const missing =
            ['projects', 'drive', 'chat', 'helpdesk', 'performance', 'procurement', 'crm', 'analytics'].some((id) => !s?.apps?.find((a) => a.id === id)?.route) ||
            Boolean(s?.apps?.some((a) => a.id === 'roster'));
          return missing ? migrateV6toV7(s) : s;
        }
        if (version === 1) s = migrateV1toV2(s);
        if (version === 1 || version === 2) s = migrateV2toV3(s);
        if (version === 1 || version === 2 || version === 3) s = migrateV3toV4(s);
        if (version === 1 || version === 2 || version === 3 || version === 4) s = migrateV4toV5(s);
        if (version >= 1 && version <= 5) s = migrateV5toV6(s);
        if (version >= 1 && version <= 6) return migrateV6toV7(s);
        return createSeed();
      },
      merge: (persisted, current) => {
        const p = (persisted as Partial<HubData> | undefined) ?? {};
        const seedById = new Map(current.apps.map((a) => [a.id, a]));
        const apps = (p.apps ?? current.apps)
          .filter((a) => a.id !== 'roster')
          .map((a) => {
            const fresh = seedById.get(a.id);
            if (!fresh) return a;
            return {
              ...a,
              url: a.id === 'finance' ? fresh.url : (a.url ?? fresh.url),
              route: fresh.route ?? a.route,
              gradient: WORKSPACE_APPS.has(a.id) ? fresh.gradient : a.gradient,
              keywords: WORKSPACE_APPS.has(a.id) ? fresh.keywords : a.keywords,
              quickActions: fresh.quickActions ?? a.quickActions,
              tagline: fresh.tagline ?? a.tagline,
              description: fresh.description ?? a.description,
              badge: fresh.badge ?? a.badge,
            };
          });
        const roles = (p.roles ?? current.roles).map((r) => {
          if (r.id !== 'employee') return r;
          const cleaned = r.permissions.filter((perm) => perm !== 'app:roster');
          return cleaned.includes('app:procurement') ? { ...r, permissions: cleaned } : { ...r, permissions: [...cleaned, 'app:procurement'] };
        });
        return { ...current, ...p, apps, roles };
      },
    },
  ),
);

/**
 * v1 → v2: adds Talent Hub + HR Portal without wiping the user's workspace —
 * in-app routes on the two tiles, talent permissions on built-in roles,
 * the new notification kind and starter hiring notifications.
 */
export function migrateV1toV2(s: HubData): HubData {
  const seed = createSeed();
  const seedApp = new Map(seed.apps.map((a) => [a.id, a]));
  const apps = s.apps.map((a) => {
    const fresh = seedApp.get(a.id);
    if (!fresh || (a.id !== 'recruit' && a.id !== 'hr')) return a;
    return { ...a, route: fresh.route, tagline: fresh.tagline, description: fresh.description, keywords: fresh.keywords, quickActions: fresh.quickActions, badge: fresh.badge ?? a.badge };
  });
  const seedRole = new Map(seed.roles.map((r) => [r.id, r]));
  const roles = s.roles.map((r) => {
    const fresh = seedRole.get(r.id);
    if (!fresh || !r.system || r.locked) return r;
    const add = fresh.permissions.filter((p) => (p.startsWith('talent.') || p.startsWith('hr.')) && !r.permissions.includes(p));
    return add.length ? { ...r, permissions: [...r.permissions, ...add] } : r;
  });
  const seedUser = new Map(seed.users.map((u) => [u.id, u]));
  const users = s.users.map((u) => (u.id === 'u-kwame' && seedUser.get(u.id) ? { ...u, startDate: seedUser.get(u.id)!.startDate } : u));
  const known = new Set(s.notifications.map((n) => n.id));
  const notifications = [...talentNotifications().filter((n) => !known.has(n.id)), ...s.notifications].slice(0, 400);
  const prefs = Object.fromEntries(Object.entries(s.prefs).map(([id, p]) => [id, { ...p, notifyKinds: { ...p.notifyKinds, talent: p.notifyKinds?.talent ?? true } }]));
  return { ...s, version: 2, apps, roles, users, notifications, prefs };
}

/**
 * v2 → v3: the full HR Portal (time off, benefits, documents, People Ops).
 * Adds `hr.*` permissions to built-in roles, the HR tile's new quick actions,
 * the `hr` notification kind and starter HR notifications, without a reset.
 */
export function migrateV2toV3(s: HubData): HubData {
  const seed = createSeed();
  const seedRole = new Map(seed.roles.map((r) => [r.id, r]));
  const roles = s.roles.map((r) => {
    const fresh = seedRole.get(r.id);
    if (!fresh || !r.system || r.locked) return r;
    const add = fresh.permissions.filter((p) => p.startsWith('hr.') && !r.permissions.includes(p));
    return add.length ? { ...r, permissions: [...r.permissions, ...add] } : r;
  });
  const hrApp = seed.apps.find((a) => a.id === 'hr');
  const apps = s.apps.map((a) =>
    a.id === 'hr' && hrApp ? { ...a, route: hrApp.route, tagline: hrApp.tagline, description: hrApp.description, keywords: hrApp.keywords, quickActions: hrApp.quickActions } : a,
  );
  const known = new Set(s.notifications.map((n) => n.id));
  const notifications = [...hrNotifications().filter((n) => !known.has(n.id)), ...s.notifications].slice(0, 400);
  const prefs = Object.fromEntries(Object.entries(s.prefs).map(([id, p]) => [id, { ...p, notifyKinds: { ...p.notifyKinds, hr: p.notifyKinds?.hr ?? true } }]));
  return { ...s, version: 3, roles, apps, notifications, prefs };
}

/**
 * v3 → v4: Knowledge Base (/wiki) + Academy (/academy) in-app modules,
 * `wiki.*` and `academy.*` capabilities, and the `learning` notification kind.
 */
export function migrateV3toV4(s: HubData): HubData {
  const seed = createSeed();
  const seedRole = new Map(seed.roles.map((r) => [r.id, r]));
  const roles = s.roles.map((r) => {
    const fresh = seedRole.get(r.id);
    if (!fresh || !r.system || r.locked) return r;
    const add = fresh.permissions.filter((p) => (p.startsWith('wiki.') || p.startsWith('academy.')) && !r.permissions.includes(p));
    return add.length ? { ...r, permissions: [...r.permissions, ...add] } : r;
  });
  const seedApp = new Map(seed.apps.map((a) => [a.id, a]));
  const apps = s.apps.map((a) => {
    const fresh = seedApp.get(a.id);
    if (!fresh || (a.id !== 'wiki' && a.id !== 'learning')) return a;
    return {
      ...a,
      route: fresh.route,
      tagline: fresh.tagline,
      description: fresh.description,
      keywords: fresh.keywords,
      quickActions: fresh.quickActions,
      badge: fresh.badge ?? a.badge,
      notifications: fresh.notifications ?? a.notifications,
    };
  });
  const known = new Set(s.notifications.map((n) => n.id));
  const notifications = [...learningNotifications().filter((n) => !known.has(n.id)), ...s.notifications].slice(0, 400);
  const prefs = Object.fromEntries(Object.entries(s.prefs).map(([id, p]) => [id, { ...p, notifyKinds: { ...p.notifyKinds, learning: p.notifyKinds?.learning ?? true } }]));
  return { ...s, version: 4, roles, apps, notifications, prefs };
}

/**
 * v4 → v5: Travel & Expenses (/expenses, /travel) + Payroll Console (/payroll),
 * `expenses.*` and `payroll.*` permissions, operational Travel tile, and starter spend/payroll notifications.
 */
export function migrateV4toV5(s: HubData): HubData {
  const seed = createSeed();
  const seedRole = new Map(seed.roles.map((r) => [r.id, r]));
  const roles = s.roles.map((r) => {
    const fresh = seedRole.get(r.id);
    if (!fresh || !r.system || r.locked) return r;
    const add = fresh.permissions.filter(
      (p) =>
        (p.startsWith('expenses.') || p.startsWith('payroll.') || p === 'hub.people.view' || p === 'talent.comp.view') &&
        !r.permissions.includes(p),
    );
    return add.length ? { ...r, permissions: [...r.permissions, ...add] } : r;
  });
  const seedApp = new Map(seed.apps.map((a) => [a.id, a]));
  const apps = s.apps.map((a) => {
    const fresh = seedApp.get(a.id);
    if (!fresh || (a.id !== 'expenses' && a.id !== 'travel' && a.id !== 'payroll')) return a;
    return {
      ...a,
      route: fresh.route,
      status: fresh.status,
      discoverable: fresh.discoverable,
      tagline: fresh.tagline,
      description: fresh.description,
      keywords: fresh.keywords,
      quickActions: fresh.quickActions,
      badge: fresh.badge ?? a.badge,
      notifications: fresh.notifications ?? a.notifications,
    };
  });
  const known = new Set(s.notifications.map((n) => n.id));
  const notifications = [...spendPayrollNotifications().filter((n) => !known.has(n.id)), ...s.notifications].slice(0, 400);
  return { ...s, version: 5, roles, apps, notifications };
}

/**
 * v5 → v6: Projects (/projects), Drive (/drive), Pulse Chat (/chat) & IT Helpdesk (/helpdesk) in-app modules,
 * `projects.manage`, `drive.manage`, `helpdesk.manage`, the `work` notification kind and starter notifications.
 */
export function migrateV5toV6(s: HubData): HubData {
  const seed = createSeed();
  const seedRole = new Map(seed.roles.map((r) => [r.id, r]));
  const roles = s.roles.map((r) => {
    const fresh = seedRole.get(r.id);
    if (!fresh || !r.system || r.locked) return r;
    const add = fresh.permissions.filter((p) => (p.startsWith('projects.') || p.startsWith('drive.') || p.startsWith('helpdesk.')) && !r.permissions.includes(p));
    return add.length ? { ...r, permissions: [...r.permissions, ...add] } : r;
  });
  const seedApp = new Map(seed.apps.map((a) => [a.id, a]));
  const apps = s.apps.map((a) => {
    const fresh = seedApp.get(a.id);
    if (!fresh || (a.id !== 'projects' && a.id !== 'drive' && a.id !== 'chat' && a.id !== 'helpdesk')) return a;
    return { ...a, route: fresh.route, tagline: fresh.tagline, description: fresh.description, keywords: fresh.keywords, quickActions: fresh.quickActions, badge: fresh.badge ?? a.badge, notifications: fresh.notifications ?? a.notifications };
  });
  const existingIds = new Set(s.notifications.map((n) => n.id));
  const notifications = [...workNotifications().filter((n) => !existingIds.has(n.id)), ...s.notifications].slice(0, 400);
  const prefs = Object.fromEntries(Object.entries(s.prefs).map(([id, p]) => [id, { ...p, notifyKinds: { ...p.notifyKinds, work: p.notifyKinds?.work ?? true } }]));
  return { ...s, version: 6, roles, apps, notifications, prefs };
}


/**
 * v6 → v7: rebuilt workspace apps + the new Performance & OKRs app (/performance):
 * refreshed catalog entries, `performance.*` permissions on built-in roles and
 * starter performance notifications.
 */
export function migrateV6toV7(s: HubData): HubData {
  const seed = createSeed();
  const seedRole = new Map(seed.roles.map((r) => [r.id, r]));
  const roles = s.roles.map((r) => {
    const fresh = seedRole.get(r.id);
    if (!fresh || !r.system || r.locked) return r;
    const basePerms = r.permissions.filter((p) => p !== 'app:roster');
    const add = fresh.permissions.filter((p) => (p.startsWith('performance.') || p === 'app:performance' || p === 'app:procurement') && !basePerms.includes(p));
    return { ...r, permissions: [...basePerms, ...add] };
  });
  const seedApp = new Map(seed.apps.map((a) => [a.id, a]));
  const apps = s.apps
    .filter((a) => a.id !== 'roster')
    .map((a) => {
      const fresh = seedApp.get(a.id);
      if (!fresh) return a;
      if (a.id === 'finance') return { ...a, url: fresh.url };
      if (!WORKSPACE_APPS.has(a.id)) return a;
      return {
        ...a,
        route: fresh.route,
        tagline: fresh.tagline,
        description: fresh.description,
        keywords: fresh.keywords,
        gradient: fresh.gradient,
        quickActions: fresh.quickActions,
        badge: fresh.badge ?? a.badge,
        notifications: fresh.notifications ?? a.notifications,
      };
    });
  const existingIds = new Set(s.notifications.map((n) => n.id));
  const notifications = [...performanceNotifications().filter((n) => !existingIds.has(n.id)), ...s.notifications].slice(0, 400);
  return { ...s, version: DATA_VERSION, roles, apps, notifications };
}
