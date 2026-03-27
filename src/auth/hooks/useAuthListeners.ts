import { useEffect } from 'react';
import { collection, query, where, onSnapshot, orderBy, limit, QueryDocumentSnapshot, DocumentData, doc } from 'firebase/firestore';
import { db } from '../../firebase';
import { User, Activity, UserRequest } from '../../utils';
import { OperationType } from './useAuthError';
import { fetchAdminAccountDirectory } from '../services/adminAccountDirectoryService';
import { logger } from '../../utils/logger';

function normalizeRole(role: unknown): User['role'] {
  const normalized = String(role || '').trim().toLowerCase();
  return normalized === 'admin' ? 'Admin' : 'User';
}

function normalizeStatus(status: unknown, fallbackAccountStatus: unknown): User['status'] {
  const normalized = String(status || fallbackAccountStatus || '').trim().toLowerCase();

  if (normalized === 'active') return 'Active';
  if (normalized === 'suspended') return 'Suspended';
  if (normalized === 'blocked') return 'Blocked';
  if (normalized === 'rejected') return 'Rejected';
  if (normalized === 'pendingadminapproval' || normalized === 'pending_admin_approval') {
    return 'PendingAdminApproval';
  }
  if (normalized === 'pendingemailverification' || normalized === 'pending_email_verification') {
    return 'PendingEmailVerification';
  }

  return 'PendingAdminApproval';
}

function normalizeUserData(id: string, data: Record<string, unknown>): User {
  return {
    id,
    ...data,
    email: data.email || '',
    name: data.name || data.displayName || '',
    username: data.username || '',
    picture: data.picture || data.photoURL || '',
    authProviders: Array.isArray(data.authProviders) ? data.authProviders.filter(Boolean) : [],
    role: normalizeRole(data.role),
    status: normalizeStatus(data.status, data.accountStatus),
  } as User;
}

/**
 * Normalizes an activity document and ensures the ID is always present.
 */
function normalizeActivityDoc(doc: QueryDocumentSnapshot<DocumentData>): Activity {
  return {
    id: doc.id,
    ...(doc.data() || {}),
  } as Activity;
}

/**
 * Normalizes a request document and ensures the ID is always present.
 */
function normalizeRequestDoc(doc: QueryDocumentSnapshot<DocumentData>): UserRequest {
  return {
    id: doc.id,
    ...(doc.data() || {}),
  } as UserRequest;
}

export function useAuthListeners(
  user: User | null,
  isAdmin: boolean,
  setUser: React.Dispatch<React.SetStateAction<User | null>>,
  setAllUsers: React.Dispatch<React.SetStateAction<User[]>>,
  setActivities: React.Dispatch<React.SetStateAction<Activity[]>>,
  setUserRequests: React.Dispatch<React.SetStateAction<UserRequest[]>>,
  handleFirestoreError: (error: unknown, operationType: string, path: string | null, silent?: boolean) => void,
  handleError: (error: any, category: any, context?: string, uiType?: 'toast' | 'alert' | 'modal') => void
) {
  useEffect(() => {
    if (!user) return;

    const unsubscribers: (() => void)[] = [];
    let isDisposed = false;
    let refreshInFlight: Promise<void> | null = null;

    /**
     * SECURITY-SENSITIVE STATE HYGIENE
     * ------------------------------------------------------------------
     * Clear admin-scoped caches before attaching lower-privilege listeners so
     * stale privileged data never survives role refresh or account switching.
     */
    if (!isAdmin) {
      setAllUsers([]);
      setUserRequests([]);
    }

    const userRef = doc(db, 'users', user.id);
    const unsubCurrentUser = onSnapshot(
      userRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          return;
        }
        const nextUser = normalizeUserData(snapshot.id, (snapshot.data() || {}) as Record<string, unknown>);
        setUser(nextUser);
      },
      (err) => handleFirestoreError(err, OperationType.GET, `users/${user.id}`)
    );
    unsubscribers.push(unsubCurrentUser);

    /**
     * Admin-only account directory feed.
     * ------------------------------------------------------------------
     * Firebase Auth is the identity source of truth, so admin account discovery
     * must come from the backend-admin directory merge rather than a raw
     * Firestore-only listener. We still keep a lightweight Firestore listener
     * as an invalidation trigger so existing admin edits refresh promptly.
     */
    if (isAdmin) {
      const refreshAdminAccounts = async (source: 'initial' | 'firestore-sync' | 'interval') => {
        if (refreshInFlight) {
          return refreshInFlight;
        }

        refreshInFlight = (async () => {
          try {
            const directory = await fetchAdminAccountDirectory();
            if (!isDisposed) {
              setAllUsers(directory.accounts);
            }
          } catch (error) {
            logger.error('Failed to refresh admin account directory.', {
              area: 'auth',
              event: 'admin-account-directory-refresh-failed',
              source,
              error,
            });

            if (!isDisposed && source === 'initial') {
              handleError(error, 'system/internal', 'Admin account directory bootstrap', 'alert');
            }
          } finally {
            refreshInFlight = null;
          }
        })();

        return refreshInFlight;
      };

      void refreshAdminAccounts('initial');

      const usersQuery = query(
        collection(db, 'users'),
        orderBy('createdAt', 'desc')
      );

      const unsubUsers = onSnapshot(
        usersQuery,
        () => {
          void refreshAdminAccounts('firestore-sync');
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'users')
      );

      unsubscribers.push(unsubUsers);

      const refreshInterval = window.setInterval(() => {
        void refreshAdminAccounts('interval');
      }, 60_000);

      unsubscribers.push(() => {
        window.clearInterval(refreshInterval);
      });
    }

    /**
     * Current user's recent activity feed.
     */
    const activitiesQuery = query(
      collection(db, 'activities'),
      where('userId', '==', user.id),
      orderBy('timestamp', 'desc'),
      limit(50)
    );

    const unsubActivities = onSnapshot(
      activitiesQuery,
      (snapshot) => {
        const acts = snapshot.docs.map(normalizeActivityDoc);
        setActivities(acts);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'activities')
    );

    unsubscribers.push(unsubActivities);

    /**
     * Requests listener:
     * - Admin sees all requests
     * - Normal user sees only their own requests
     */
    const requestsQuery = isAdmin
      ? query(collection(db, 'requests'), orderBy('createdAt', 'desc'))
      : query(
          collection(db, 'requests'),
          where('userId', '==', user.id),
          orderBy('createdAt', 'desc')
        );

    const unsubRequests = onSnapshot(
      requestsQuery,
      (snapshot) => {
        const reqs = snapshot.docs.map(normalizeRequestDoc);
        setUserRequests(reqs);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'requests')
    );

    unsubscribers.push(unsubRequests);

    return () => {
      isDisposed = true;
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [user, isAdmin, setUser, setAllUsers, setActivities, setUserRequests, handleFirestoreError, handleError]);
}
