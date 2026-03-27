import { useCallback } from 'react';
import {
  User,
  UserRole,
  UserStatus,
  UserPermissions,
  UserLimits,
  UserUsage,
  UserSettings,
  AdminSettings,
  Activity,
  cleanObject,
} from '../../utils';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db, auth } from '../../firebase';
import { logger } from '../../utils/logger';
import toast from 'react-hot-toast';
import {
  defaultPermissions,
  defaultLimits,
  defaultUsage,
  defaultUserSettings,
} from '../defaults';
import { isPrimaryAdminUser, isUserAdmin, normalizeUserRole } from '../accessControl';

/**
 * IMPORTANT ARCHITECTURE RULES
 * ------------------------------------------------------------------
 * 1. Keep this hook focused on user-management operations only.
 * 2. Preserve current public function names for compatibility.
 * 3. Do not silently escalate privileges from client-side input.
 * 4. Prefer explicit guards, clear logs, and stable merge updates.
 * 5. Build on top of this structure instead of rewriting business rules elsewhere.
 */

type FirestoreOperation = 'create' | 'read' | 'update' | 'delete';

const OWNER_EMAILS = new Set([
  'alahlyeagle13@gmail.com',
  'alahlyeagle@gmail.com',
  'elmahdy@admin.com',
]);

const DEFAULT_PREFERRED_MODEL_ID = 'gemini-3-flash-preview';

function nowIso() {
  return new Date().toISOString();
}

function normalizeUsername(username?: string) {
  return username?.trim().toLowerCase() || '';
}

function isFacultyFastAccessManagedUser(targetUser: Partial<User> | null | undefined) {
  return !!targetUser && (
    targetUser.isTemporaryAccess === true ||
    targetUser.accountScope === 'faculty_science_fast_access' ||
    targetUser.temporaryAccessType === 'FacultyOfScienceFastAccess'
  );
}

function sanitizeReason(prefix: string, reason?: string, fallback?: string) {
  if (reason?.trim()) return `${prefix}: ${reason.trim()}`;
  return fallback || '';
}

function buildDefaultSettings(
  incoming?: Partial<UserSettings>
): UserSettings {
  return {
    ...defaultUserSettings,
    ...incoming,
    preferredModelId:
      incoming?.preferredModelId || DEFAULT_PREFERRED_MODEL_ID,
    quizDefaults: {
      ...defaultUserSettings.quizDefaults,
      ...incoming?.quizDefaults,
    },
    notifications: {
      ...defaultUserSettings.notifications,
      ...incoming?.notifications,
    },
  };
}

function buildSafeUserPayload(
  userId: string,
  userData: Partial<User>
): User {
  const createdAt = nowIso();

  return {
    id: userId,
    name: userData.name?.trim() || 'New User',
    email: userData.email?.trim() || '',
    role: (userData.role || 'User') as UserRole,
    status: (userData.status || 'Active') as UserStatus,
    firstLoginDate: createdAt,
    lastLogin: createdAt,
    createdAt,
    updatedAt: createdAt,
    permissions: userData.permissions || defaultPermissions,
    limits: userData.limits || defaultLimits,
    usage: userData.usage || defaultUsage,
    totalUploads: userData.totalUploads ?? 0,
    totalQuizzes: userData.totalQuizzes ?? 0,
    totalAIRequests: userData.totalAIRequests ?? 0,
    credits: userData.credits ?? 100,
    settings: buildDefaultSettings(userData.settings),
    picture: userData.picture || '',
    username: userData.username?.trim() || '',
    usernameLower: normalizeUsername(userData.username),
    adminSettings: userData.adminSettings,
    adminNotes: userData.adminNotes || '',
    authProviders: userData.authProviders || [],
    isVerified: userData.isVerified ?? false,
  } as User;
}

export function useUserManagement(
  user: User | null,
  logActivity: (
    type: Activity['type'],
    description: string,
    status?: Activity['status'],
    metadata?: any
  ) => void,
  handleFirestoreError: (
    error: unknown,
    operationType: string,
    path: string | null,
    silent?: boolean
  ) => void
) {
  const isAdmin = isUserAdmin(user);
  const isPrimaryAdmin = isPrimaryAdminUser(user);

  const ensureAdmin = useCallback(() => {
    if (!isAdmin) {
      toast.error('Only admins can perform this action.');
      throw new Error('Admin permission required.');
    }
  }, [isAdmin]);

  const ensurePrimaryAdmin = useCallback(() => {
    if (!isPrimaryAdmin) {
      toast.error('Only the primary admin can perform this action.');
      throw new Error('Primary admin permission required.');
    }
  }, [isPrimaryAdmin]);

  const ensureGenericAdminRouteTarget = useCallback((targetUser: Partial<User> | null | undefined, actionLabel: string) => {
    if (!isFacultyFastAccessManagedUser(targetUser)) {
      return true;
    }

    toast.error(`Use the Faculty Fast Access manager to ${actionLabel} temporary student accounts.`);
    return false;
  }, []);

  const getAdminHeaders = useCallback(async () => {
    const token = await auth.currentUser?.getIdToken();
    if (!token) {
      throw new Error('Missing authentication token. Please sign in again.');
    }

    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }, []);

  const callAdminUserApi = useCallback(
    async <T = any>(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: Record<string, unknown>) => {
      ensureAdmin();
      const headers = await getAdminHeaders();

      const response = await fetch(path, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      const json = await response.json().catch(() => ({}));
      if (!response.ok || json?.success === false) {
        const message = json?.error || json?.message || 'Admin operation failed.';
        throw new Error(message);
      }

      return json as T;
    },
    [ensureAdmin, getAdminHeaders]
  );

  const updateUser = useCallback(
    async (userId: string, updates: Partial<User>) => {
      const userDocRef = doc(db, 'users', userId);

      try {
        const isAdminUpdatingAnotherUser = isAdmin && user?.id !== userId;

        const safeUpdates = cleanObject({
          ...updates,
          ...(updates.username !== undefined
            ? { usernameLower: normalizeUsername(updates.username) }
            : {}),
          updatedAt: nowIso(),
        });

        if (isAdminUpdatingAnotherUser) {
          const targetSnap = await getDoc(userDocRef);
          if (!targetSnap.exists()) {
            throw new Error('User not found.');
          }

          if (!ensureGenericAdminRouteTarget(targetSnap.data() as User, 'edit')) {
            return;
          }

          await callAdminUserApi(`/api/admin/users/${encodeURIComponent(userId)}`, 'PATCH', safeUpdates as Record<string, unknown>);
        } else {
          await setDoc(userDocRef, safeUpdates, { merge: true });
        }

        logger.info('User updated', { userId, updates: safeUpdates });
      } catch (error) {
        logger.error('Failed to update user', { userId, error });
        toast.error('Failed to update user');
        throw error;
      }
    },
    [isAdmin, user?.id, callAdminUserApi, ensureGenericAdminRouteTarget]
  );

  const deleteUser = useCallback(
    async (userId: string) => {
      try {
        ensureAdmin();

        const userDocRef = doc(db, 'users', userId);
        const docSnap = await getDoc(userDocRef);

        if (!docSnap.exists()) {
          toast.error('User not found.');
          return;
        }

        const targetUser = docSnap.data() as User;

        if (!ensureGenericAdminRouteTarget(targetUser, 'delete')) {
          return;
        }

        if (OWNER_EMAILS.has(targetUser.email)) {
          toast.error('You cannot delete the owner account.');
          return;
        }

        if (targetUser.id === user?.id) {
          toast.error('You cannot delete your own account from here.');
          return;
        }

        if (isUserAdmin(targetUser) && !isPrimaryAdmin) {
          toast.error('You do not have permission to delete admin accounts.');
          return;
        }

        await callAdminUserApi(`/api/admin/users/${encodeURIComponent(userId)}`, 'DELETE');

        logActivity(
          'admin_action',
          `User deleted: ${targetUser.email || targetUser.id}`,
          'success',
          { targetUserId: targetUser.id }
        );

        toast.success('User deleted successfully');
      } catch (error: any) {
        handleFirestoreError(error, 'delete', `users/${userId}`);
      }
    },
    [ensureAdmin, isPrimaryAdmin, user?.id, logActivity, handleFirestoreError, callAdminUserApi, ensureGenericAdminRouteTarget]
  );

  const createUser = useCallback(
    async (userData: Partial<User>, password?: string) => {
      ensureAdmin();

      if (!userData.email?.trim()) {
        toast.error('Email is required.');
        return;
      }

      try {
        const normalizedEmail = userData.email.trim().toLowerCase();

        const normalizedRequestedRole = normalizeUserRole(userData.role || 'User');
        const role =
          normalizedRequestedRole === 'Admin' && !isPrimaryAdmin
            ? 'User'
            : normalizedRequestedRole;

        const newUser = buildSafeUserPayload('pending-server-id', {
          ...userData,
          email: normalizedEmail,
          role,
        });

        const response = await callAdminUserApi<{ success: boolean; user: User }>('/api/admin/users', 'POST', {
          ...newUser,
          password,
        } as unknown as Record<string, unknown>);

        const createdUserId = response.user?.id;

        logActivity(
          'admin_action',
          `User created: ${response.user?.email || newUser.email || newUser.name}`,
          'success',
          {
            createdUserId,
            createdUserRole: newUser.role,
          }
        );

        toast.success('User created successfully');
      } catch (error: any) {
        logger.error('Failed to create user', { error, email: userData.email });
        handleFirestoreError(error, 'create', 'users');
      }
    },
    [ensureAdmin, isPrimaryAdmin, logActivity, handleFirestoreError, callAdminUserApi]
  );

  const updateUserProfile = useCallback(
    async (userData: Partial<User>) => {
      if (!user) return;

      try {
        if (userData.username) {
          const username = userData.username.trim();

          if (username.length < 3) {
            throw new Error('Username must be at least 3 characters');
          }

          if (!/^[a-zA-Z0-9_]+$/.test(username)) {
            throw new Error(
              'Username can only contain letters, numbers, and underscores'
            );
          }

          userData.username = username;
        }

        if (
          userData.phoneNumber &&
          !/^\+?[0-9]{10,15}$/.test(userData.phoneNumber)
        ) {
          throw new Error('Invalid phone number format');
        }

        await updateUser(user.id, userData);

        toast.success('Profile updated successfully');

        logActivity(
          'profile_update',
          `User updated profile: ${Object.keys(userData).join(', ')}`,
          'success'
        );
      } catch (error: any) {
        logger.error('Failed to update profile', { error });
        toast.error(error.message || 'Failed to update profile');
        throw error;
      }
    },
    [user, updateUser, logActivity]
  );

  const checkUsernameAvailability = useCallback(
    async (username: string): Promise<boolean> => {
      if (!username?.trim()) return false;

      try {
        const response = await fetch(
          `/api/check-username?username=${encodeURIComponent(username.trim())}`
        );

        if (!response.ok) {
          throw new Error('Server error while checking username.');
        }

        const data = await response.json();
        return !!data.available;
      } catch (error: any) {
        logger.error('Error checking username availability', { error });
        throw new Error(
          'Unable to check username availability. Please check your connection.'
        );
      }
    },
    []
  );

  const updateUserSettings = useCallback(
    async (settings: Partial<UserSettings>) => {
      if (!user) return;

      try {
        const mergedSettings = {
          ...buildDefaultSettings(user.settings),
          ...settings,
          quizDefaults: {
            ...buildDefaultSettings(user.settings).quizDefaults,
            ...settings.quizDefaults,
          },
          notifications: {
            ...buildDefaultSettings(user.settings).notifications,
            ...settings.notifications,
          },
        };

        await setDoc(
          doc(db, 'users', user.id),
          {
            settings: mergedSettings,
            updatedAt: nowIso(),
          },
          { merge: true }
        );

        logger.info('User settings updated', { userId: user.id });
      } catch (error) {
        logger.error('Failed to update user settings', { error, userId: user.id });
        throw error;
      }
    },
    [user]
  );

  const updateAdminSettings = useCallback(
    async (settings: Partial<AdminSettings>) => {
      try {
        ensureAdmin();

        const newSettings = {
          ...(user?.adminSettings || {}),
          ...settings,
        } as AdminSettings;

        await updateUser(user!.id, { adminSettings: newSettings });

        logActivity(
          'settings_update',
          'Admin updated panel settings',
          'success'
        );

        toast.success('Admin settings updated');
      } catch (error) {
        toast.error('Failed to update admin settings');
      }
    },
    [ensureAdmin, user, updateUser, logActivity]
  );

  const notifyUserStatus = useCallback(
    async (targetUser: User, status: string, reason?: string) => {
      try {
        await callAdminUserApi(`/api/admin/users/${encodeURIComponent(targetUser.id)}/status`, 'POST', {
          status,
          reason,
          notifyUser: true,
        });
      } catch (error) {
        logger.error('Failed to notify user of status change', {
          error,
          targetUserId: targetUser.id,
          status,
        });
      }
    },
    [callAdminUserApi]
  );

  const protectSensitiveTarget = useCallback(
    (targetUser: User) => {
      if (OWNER_EMAILS.has(targetUser.email)) {
        toast.error('This account is protected.');
        return false;
      }

      if (isUserAdmin(targetUser) && !isPrimaryAdmin) {
        toast.error('Only the primary admin can manage another admin.');
        return false;
      }

      return true;
    },
    [isPrimaryAdmin]
  );

  const approveUser = useCallback(
    async (targetUser: User) => {
      try {
        ensureAdmin();
        if (!ensureGenericAdminRouteTarget(targetUser, 'approve')) return;
        if (!protectSensitiveTarget(targetUser)) return;

        await notifyUserStatus(targetUser, 'Active');

        logActivity('admin_action', `User approved: ${targetUser.id}`, 'success');
        toast.success('User approved successfully');
      } catch (error: any) {
        handleFirestoreError(error, 'update', `users/${targetUser.id}`);
      }
    },
    [
      ensureAdmin,
      ensureGenericAdminRouteTarget,
      protectSensitiveTarget,
      notifyUserStatus,
      logActivity,
      handleFirestoreError,
    ]
  );

  const rejectUser = useCallback(
    async (targetUser: User, reason?: string) => {
      try {
        ensureAdmin();
        if (!ensureGenericAdminRouteTarget(targetUser, 'reject')) return;
        if (!protectSensitiveTarget(targetUser)) return;

        await notifyUserStatus(targetUser, 'Rejected', reason);

        logActivity('admin_action', `User rejected: ${targetUser.id}`, 'success');
        toast.success('User rejected successfully');
      } catch (error: any) {
        handleFirestoreError(error, 'update', `users/${targetUser.id}`);
      }
    },
    [
      ensureAdmin,
      ensureGenericAdminRouteTarget,
      protectSensitiveTarget,
      notifyUserStatus,
      logActivity,
      handleFirestoreError,
    ]
  );

  const suspendUser = useCallback(
    async (targetUser: User, reason?: string) => {
      try {
        ensureAdmin();
        if (!ensureGenericAdminRouteTarget(targetUser, 'suspend')) return;
        if (!protectSensitiveTarget(targetUser)) return;

        await notifyUserStatus(targetUser, 'Suspended', reason);

        logActivity('admin_action', `User suspended: ${targetUser.id}`, 'success');
        toast.success('User suspended successfully');
      } catch (error: any) {
        handleFirestoreError(error, 'update', `users/${targetUser.id}`);
      }
    },
    [
      ensureAdmin,
      ensureGenericAdminRouteTarget,
      protectSensitiveTarget,
      notifyUserStatus,
      logActivity,
      handleFirestoreError,
    ]
  );

  const blockUser = useCallback(
    async (targetUser: User, reason?: string) => {
      try {
        ensureAdmin();
        if (!ensureGenericAdminRouteTarget(targetUser, 'block')) return;
        if (!protectSensitiveTarget(targetUser)) return;

        await notifyUserStatus(targetUser, 'Blocked', reason);

        logActivity('admin_action', `User blocked: ${targetUser.id}`, 'success');
        toast.success('User blocked successfully');
      } catch (error: any) {
        handleFirestoreError(error, 'update', `users/${targetUser.id}`);
      }
    },
    [
      ensureAdmin,
      ensureGenericAdminRouteTarget,
      protectSensitiveTarget,
      notifyUserStatus,
      logActivity,
      handleFirestoreError,
    ]
  );

  const reactivateUser = useCallback(
    async (targetUser: User) => {
      try {
        ensureAdmin();
        if (!ensureGenericAdminRouteTarget(targetUser, 'reactivate')) return;
        if (!protectSensitiveTarget(targetUser)) return;

        await notifyUserStatus(targetUser, 'Active');

        logActivity('admin_action', `User reactivated: ${targetUser.id}`, 'success');
        toast.success('User reactivated successfully');
      } catch (error: any) {
        handleFirestoreError(error, 'update', `users/${targetUser.id}`);
      }
    },
    [
      ensureAdmin,
      ensureGenericAdminRouteTarget,
      protectSensitiveTarget,
      notifyUserStatus,
      logActivity,
      handleFirestoreError,
    ]
  );

  const updateUserCredits = useCallback(
    async (userId: string, credits: number) => {
      try {
        ensureAdmin();

        if (credits < 0) {
          toast.error('Credits cannot be negative.');
          return;
        }

        const targetSnap = await getDoc(doc(db, 'users', userId));
        if (!targetSnap.exists()) {
          toast.error('User not found.');
          return;
        }

        if (!ensureGenericAdminRouteTarget(targetSnap.data() as User, 'adjust credits for')) {
          return;
        }

        await updateUser(userId, { credits });

        logActivity(
          'admin_action',
          `Credits updated for ${userId}: ${credits}`,
          'success'
        );

        toast.success('Credits updated successfully');
      } catch (error: any) {
        handleFirestoreError(error, 'update', `users/${userId}`);
      }
    },
    [ensureAdmin, updateUser, logActivity, handleFirestoreError, ensureGenericAdminRouteTarget]
  );

  return {
    updateUser,
    deleteUser,
    createUser,
    updateUserProfile,
    checkUsernameAvailability,
    updateUserSettings,
    updateAdminSettings,
    approveUser,
    rejectUser,
    suspendUser,
    blockUser,
    reactivateUser,
    updateUserCredits,
  };
}
