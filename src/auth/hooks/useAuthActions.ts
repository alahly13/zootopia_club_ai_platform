import { useCallback } from 'react';
import {
  User as FirebaseUser,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  sendPasswordResetEmail,
  sendEmailVerification,
  reload,
  signOut,
  updatePassword as firebaseUpdatePassword,
  EmailAuthProvider,
  linkWithCredential,
} from 'firebase/auth';
import { doc, setDoc, getDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../../firebase';
import { User, Activity, cleanObject, UserStatus } from '../../utils';
import { logger } from '../../utils/logger';
import toast from 'react-hot-toast';
import { ADMIN_IDENTITIES, RESERVED_USERNAMES } from '../../constants/admins';
import { defaultPermissions, defaultLimits, defaultUsage, defaultUserSettings } from '../defaults';
import { isUserAdmin, normalizeAdminLevel, normalizeUserRole } from '../accessControl';

const STATUS: Record<string, UserStatus> = {
  PENDING_EMAIL: 'PendingEmailVerification',
  PENDING_APPROVAL: 'PendingAdminApproval',
  ACTIVE: 'Active',
  REJECTED: 'Rejected',
  SUSPENDED: 'Suspended',
  BLOCKED: 'Blocked',
} as const;

const USERNAME_RESOLUTION_TIMEOUT_MS = 8_000;
const ADMIN_CLAIMS_SYNC_TIMEOUT_MS = 8_000;

type LoginIdentifierKind = 'email' | 'username';

type AdminIdentifierLookupResponse = {
  success?: boolean;
  email?: string;
  identifierType?: LoginIdentifierKind;
  resolutionSource?: 'admin_email' | 'username_lower' | 'email_local_part';
  error?: string;
  code?: string;
};

function normalizeAuthProviders(firebaseUser: FirebaseUser, existingProviders: string[] = []): string[] {
  const currentProviders = firebaseUser.providerData.map((p) => p.providerId);
  return Array.from(new Set([...existingProviders, ...currentProviders].filter(Boolean)));
}

function normalizeUserStatus(currentStatus: string | undefined, isVerified: boolean, isAdmin: boolean): UserStatus {
  if (isAdmin) return STATUS.ACTIVE;

  const status = currentStatus?.toLowerCase() || '';

  if (status === 'active') return STATUS.ACTIVE;
  if (status === 'blocked') return STATUS.BLOCKED;
  if (status === 'suspended') return STATUS.SUSPENDED;
  if (status === 'rejected') return STATUS.REJECTED;

  if (!isVerified) return STATUS.PENDING_EMAIL;

  if (status === 'pendingemailverification' || status === 'pending_email_verification') {
    return STATUS.PENDING_APPROVAL;
  }

  const found = Object.values(STATUS).find((s) => s.toLowerCase() === status);
  return found || STATUS.PENDING_EMAIL;
}

function normalizeRoleFromClaimsOrIdentity(
  firebaseUser: FirebaseUser,
  claims: Record<string, unknown>,
  adminIdentity: { email: string; level: string; role: string } | undefined
): {
  isAdminClaim: boolean;
  adminLevel: string | null;
  role: User['role'];
} {
  const claimRole = String(claims.role || '').toLowerCase();
  const isAdminClaim = claimRole === 'admin' || !!adminIdentity;
  const adminLevel = String(claims.adminLevel || adminIdentity?.level || '') || null;

  return {
    isAdminClaim,
    adminLevel,
    role: isAdminClaim ? 'Admin' : 'User',
  };
}

function getRetryDelay(retryCount: number) {
  return 1500 * (retryCount + 1);
}

function waitForRetryDelay(delayMs: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, delayMs);
  });
}

async function getAuthHeaders(firebaseUser: FirebaseUser) {
  const token = await firebaseUser.getIdToken();
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

async function fetchJsonWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
  timeoutMessage: string
) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(input, {
      ...init,
      signal: controller.signal,
    });

    return response;
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new Error(timeoutMessage);
    }

    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function getIdentifierKind(identifier: string): LoginIdentifierKind {
  return identifier.includes('@') ? 'email' : 'username';
}

function normalizeFriendlyAuthMessage(error: any, context: 'user' | 'admin'): string {
  let friendlyMessage = error?.message || 'Authentication failed.';

  if (error?.code === 'auth/user-not-found') {
    friendlyMessage =
      context === 'admin'
        ? 'No admin account was found with this email.'
        : 'No account found with this email.';
  }
  if (
    error?.code === 'auth/wrong-password' ||
    error?.code === 'auth/invalid-credential' ||
    error?.code === 'auth/invalid-login-credentials'
  ) {
    friendlyMessage = 'Incorrect password.';
  }
  if (error?.code === 'auth/invalid-email') {
    friendlyMessage = 'Invalid email format.';
  }
  if (error?.code === 'auth/network-request-failed') {
    friendlyMessage = 'Network error. Please check your connection.';
  }
  if (error?.code === 'auth/too-many-requests') {
    friendlyMessage = 'Too many login attempts. Please wait a moment and try again.';
  }

  return friendlyMessage;
}

export function useAuthActions(
  logActivity: (
    type: Activity['type'],
    description: string,
    status?: Activity['status'],
    metadata?: any,
    explicitUserId?: string
  ) => void,
  updateUser: (userId: string, updates: Partial<User>) => Promise<void>,
  checkUsernameAvailability: (username: string) => Promise<boolean>,
  clearSessionState: () => void,
  notify: any
) {
  /**
   * ARCHITECTURE GUARD (Auth/Admin Coordination)
   * ------------------------------------------------------------------
   * Frontend auth flows may trigger backend coordination endpoints
   * (claims sync, admin notification). These calls MUST include the
   * current Firebase ID token and remain backend-authorized.
   *
   * Do not downgrade these calls to anonymous requests. UI checks are
   * not security boundaries and cannot replace backend authorization.
   */
  const syncUserWithFirestore = useCallback(
    async (firebaseUser: FirebaseUser, retryCount = 0): Promise<User> => {
      try {
        logger.info('Workspace profile sync begin', {
          area: 'auth',
          event: 'auth-profile-sync-begin',
          currentUserId: firebaseUser.uid,
          retryCount,
        });

        const userDocRef = doc(db, 'users', firebaseUser.uid);
        const docSnap = await getDoc(userDocRef);
        const today = new Date().toISOString().split('T')[0];

        const idTokenResult = await firebaseUser.getIdTokenResult();
        const claims = idTokenResult.claims;
        const adminIdentity = ADMIN_IDENTITIES.find(
          (a) => a.email?.toLowerCase() === firebaseUser.email?.toLowerCase()
        );

        const { isAdminClaim, adminLevel, role } = normalizeRoleFromClaimsOrIdentity(
          firebaseUser,
          claims,
          adminIdentity
        );

        const triggerAdminClaimsSync = async () => {
          if (!adminIdentity || String(claims.role || '').toLowerCase() === 'admin') {
            return;
          }

          try {
            const headers = await getAuthHeaders(firebaseUser);
            const response = await fetchJsonWithTimeout(
              '/api/admin/set-claims',
              {
                method: 'POST',
                headers,
                body: JSON.stringify({ uid: firebaseUser.uid, email: firebaseUser.email }),
              },
              ADMIN_CLAIMS_SYNC_TIMEOUT_MS,
              'Admin claims synchronization timed out.'
            );

            if (!response.ok) {
              const responseText = await response.text().catch(() => '');
              throw new Error(
                responseText || `Admin claims sync failed with status ${response.status}.`
              );
            }

            logger.info('Triggered admin claims sync for reserved admin identity', {
              area: 'auth',
              event: 'admin-claims-sync-triggered',
              email: firebaseUser.email,
              uid: firebaseUser.uid,
            });

            void firebaseUser.getIdToken(true).catch((error) => {
              logger.warn('Failed to refresh Firebase token after admin claims sync', {
                area: 'auth',
                event: 'admin-claims-token-refresh-failed',
                email: firebaseUser.email,
                uid: firebaseUser.uid,
                error,
              });
            });
          } catch (error) {
            logger.warn('Admin claims sync did not complete during profile hydration', {
              area: 'auth',
              event: 'admin-claims-sync-nonblocking-failure',
              email: firebaseUser.email,
              uid: firebaseUser.uid,
              error,
            });
          }
        };

        /**
         * Reserved-admin claim repair is important, but it must never block
         * login/profile hydration. Frontend and backend admin detection both
         * already have reserved-email compatibility paths, so treat claims sync
         * as a bounded background repair task instead of a critical-path await.
         */
        void triggerAdminClaimsSync();

        if (docSnap.exists()) {
          const existingUser = docSnap.data() as User;
          const mergedProviders = normalizeAuthProviders(firebaseUser, existingUser.authProviders);

          const updates: Partial<User> = {
            lastLogin: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            authProviders: mergedProviders,
            isVerified: firebaseUser.emailVerified || existingUser.isVerified,
            name: existingUser.name || firebaseUser.displayName || 'User',
            picture: firebaseUser.photoURL || existingUser.picture,
          };

          updates.status = normalizeUserStatus(existingUser.status, !!updates.isVerified, isAdminClaim);

          if (isAdminClaim) {
            if (normalizeUserRole(existingUser.role) !== 'Admin') updates.role = 'Admin';
            if (normalizeAdminLevel(existingUser.adminLevel) !== adminLevel) updates.adminLevel = adminLevel;
            if (existingUser.plan !== 'enterprise') updates.plan = 'enterprise';
          } else {
            if (normalizeUserRole(existingUser.role) === 'Admin') {
              updates.role = 'User';
              updates.adminLevel = null;
            }
          }

          // Daily reset logic
          if (existingUser.usage?.lastResetDate !== today) {
            const { getPlanById } = await import('../../constants/plans');
            const currentPlan = getPlanById(existingUser.plan || 'free');
            const dailyCredits = currentPlan.creditsPerDay || 5;

            updates.credits = dailyCredits;
            updates.usage = {
              ...existingUser.usage,
              aiRequestsToday: 0,
              quizGenerationsToday: 0,
              uploadsToday: 0,
              lastResetDate: today,
            };

            logActivity(
              'admin_action',
              `Daily credits reset to ${dailyCredits} (${existingUser.plan || 'free'} plan)`,
              'success'
            );
          }

          await updateDoc(userDocRef, cleanObject(updates));
          const finalUser = { ...existingUser, ...updates };

          if (
            finalUser.status === STATUS.ACTIVE &&
            finalUser.statusContext?.pendingReactivationNotice
          ) {
            const reactivationNotice =
              finalUser.statusContext?.reactivationMessage ||
              'Your account has been reactivated. Access is restored.';
            notify.success(reactivationNotice);
            await updateDoc(userDocRef, {
              'statusContext.pendingReactivationNotice': false,
              updatedAt: new Date().toISOString(),
            });
          }

          logActivity(
            'login',
            'User identity synchronized',
            'success',
            { providers: mergedProviders },
            firebaseUser.uid
          );

          if (!existingUser.isVerified && updates.isVerified && updates.status === STATUS.PENDING_APPROVAL) {
            const headers = await getAuthHeaders(firebaseUser);
            // SECURITY NOTE: normal user flows must call the user-scoped notify endpoint.
            // Admin-prefixed routes are reserved for admin-only middleware boundaries.
            fetch('/api/users/notify-admin-of-new-user', {
              method: 'POST',
              headers,
              body: JSON.stringify({
                userId: existingUser.id,
              }),
            }).catch((e) => logger.error('Failed to notify admin of verification:', e));
          }

          logger.info('Workspace profile sync completed', {
            area: 'auth',
            event: 'auth-profile-sync-completed',
            currentUserId: firebaseUser.uid,
            role: finalUser.role,
            status: finalUser.status,
            modeHint:
              finalUser.isTemporaryAccess === true
                ? 'fast_access'
                : finalUser.role === 'Admin'
                  ? 'admin'
                  : 'normal',
          });
          return finalUser;
        } else {
          const newUser: User = {
            id: firebaseUser.uid,
            name: firebaseUser.displayName || 'User',
            email: firebaseUser.email || '',
            username: firebaseUser.email?.split('@')[0] || '',
            usernameLower: (firebaseUser.email?.split('@')[0] || '').toLowerCase(),
            picture: firebaseUser.photoURL || null,
            role,
            adminLevel,
            plan: isAdminClaim ? 'enterprise' : 'free',
            status: isAdminClaim
              ? STATUS.ACTIVE
              : firebaseUser.emailVerified
              ? STATUS.PENDING_APPROVAL
              : STATUS.PENDING_EMAIL,
            firstLoginDate: new Date().toISOString(),
            lastLogin: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            authProviders: normalizeAuthProviders(firebaseUser),
            permissions: isAdminClaim
              ? { ...defaultPermissions, viewAdvancedVisuals: true, accessPremiumTools: true }
              : defaultPermissions,
            limits: isAdminClaim
              ? { aiRequestsPerDay: 9999, quizGenerationsPerDay: 9999, uploadsPerDay: 9999 }
              : defaultLimits,
            usage: {
              ...defaultUsage,
              lastResetDate: today,
            },
            settings: defaultUserSettings,
            credits: isAdminClaim ? 9999 : 5,
            totalUploads: 0,
            totalAIRequests: 0,
            totalQuizzes: 0,
            isVerified: firebaseUser.emailVerified,
            universityCode: '',
            department: '',
            academicYear: '',
            phoneNumber: '',
            dateOfBirth: '',
            gender: '',
            institution: '',
            country: '',
            nationality: '',
          };

          await setDoc(userDocRef, cleanObject(newUser));

          logActivity(
            'login',
            'New user registered and synchronized',
            'success',
            { providers: newUser.authProviders },
            firebaseUser.uid
          );

          toast.success(`Welcome to Zootopia Club, ${newUser.name}!`);

          if (newUser.isVerified && newUser.status === STATUS.PENDING_APPROVAL) {
            const headers = await getAuthHeaders(firebaseUser);
            fetch('/api/users/notify-admin-of-new-user', {
              method: 'POST',
              headers,
              body: JSON.stringify({
                userId: newUser.id,
              }),
            }).catch((e) => logger.error('Failed to notify admin of new registration:', e));
          }

          logger.info('Workspace profile sync completed', {
            area: 'auth',
            event: 'auth-profile-sync-completed',
            currentUserId: firebaseUser.uid,
            role: newUser.role,
            status: newUser.status,
            modeHint: newUser.role === 'Admin' ? 'admin' : 'normal',
          });
          return newUser;
        }
      } catch (error: any) {
        const isConnectionError =
          error?.code === 'unavailable' || error?.message?.includes('unavailable');

        if (isConnectionError && retryCount < 3) {
          logger.warn(`Firestore unavailable, retrying sync (${retryCount + 1}/3)...`);
          await waitForRetryDelay(getRetryDelay(retryCount));
          return syncUserWithFirestore(firebaseUser, retryCount + 1);
        }

        logger.error('Error syncing user with Firestore', { error });

        if (!isConnectionError && error?.code !== 'invalid-argument' && retryCount < 2) {
          await waitForRetryDelay(1_000);
          return syncUserWithFirestore(firebaseUser, retryCount + 1);
        }

        if (!isConnectionError) {
          toast.error('Authentication sync failed. Please refresh and try again.');
        }

        throw error instanceof Error ? error : new Error('Authentication sync failed.');
      }
    },
    [logActivity, notify]
  );

  const login = useCallback(async (firebaseUser: FirebaseUser) => {
    return firebaseUser;
  }, []);

  const loginWithIdentifier = useCallback(async (identifier: string, password: string) => {
    try {
      let email = identifier;

      if (!identifier.includes('@')) {
        try {
          const response = await fetchJsonWithTimeout(
            `/api/resolve-username?username=${encodeURIComponent(identifier)}`,
            {
              method: 'GET',
            },
            USERNAME_RESOLUTION_TIMEOUT_MS,
            'Username lookup timed out. Please try again or use your email.'
          );
          if (!response.ok) {
            if (response.status === 404) {
              throw new Error('No account found with this username.');
            }
            throw new Error('Unable to verify username. Please try again later.');
          }
          const data = await response.json();
          email = data.email;
        } catch (error: any) {
          if (error.message === 'No account found with this username.') throw error;
          throw new Error('Unable to connect to the server. Please check your connection or use your email.');
        }
      }

      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      return userCredential.user;
    } catch (error: any) {
      logger.error('Login error', { error });
      throw new Error(normalizeFriendlyAuthMessage(error, 'user'));
    }
  }, []);

  const sendVerificationEmailSafe = useCallback(async (firebaseUser: FirebaseUser) => {
    try {
      await sendEmailVerification(firebaseUser);
      toast.success('Verification email sent.');
    } catch (error: any) {
      logger.error('Error sending verification email', { error });
      toast.error('Failed to send verification email.');
    }
  }, []);

  const resendVerificationEmail = useCallback(async () => {
    if (!auth.currentUser) return;
    await sendVerificationEmailSafe(auth.currentUser);
  }, [sendVerificationEmailSafe]);

  const checkEmailVerificationStatus = useCallback(async () => {
    if (!auth.currentUser) return;

    await reload(auth.currentUser);

    if (auth.currentUser.emailVerified) {
      await updateUser(auth.currentUser.uid, { isVerified: true });
      toast.success('Email verified successfully!');

      const userRef = doc(db, 'users', auth.currentUser.uid);
      const userSnap = await getDoc(userRef);

      if (userSnap.exists()) {
        const userData = userSnap.data() as User;
        const normalizedStatus = normalizeUserStatus(userData.status, true, isUserAdmin(userData));

        if (userData.status !== normalizedStatus) {
          await updateUser(userData.id, { status: normalizedStatus });
        }

        if (normalizedStatus === STATUS.PENDING_APPROVAL) {
          const headers = await getAuthHeaders(auth.currentUser);
          fetch('/api/users/notify-admin-of-new-user', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              userId: userData.id,
            }),
          }).catch((e) => logger.error('Failed to notify admin of verification status change:', e));
        }
      }
    } else {
      toast('Email not verified yet.');
    }
  }, [updateUser]);

  const forgotPassword = useCallback(async (email: string) => {
    try {
      await sendPasswordResetEmail(auth, email);
      toast.success('Password reset email sent.');
    } catch (error: any) {
      logger.error('Error sending password reset email', { error });
      toast.error('Failed to send password reset email.');
      throw error;
    }
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    if (!auth.currentUser) throw new Error('No user logged in');

    try {
      await firebaseUpdatePassword(auth.currentUser, password);
      toast.success('Password updated successfully');
      logActivity('profile_update', 'User updated password', 'success');
    } catch (error: any) {
      logger.error('Password update error', { error });
      toast.error(error.message || 'Failed to update password. You may need to re-authenticate.');
      throw error;
    }
  }, [logActivity]);

  const linkAccount = useCallback(async (email: string, password: string) => {
    if (!auth.currentUser) throw new Error('No user logged in');

    try {
      const credential = EmailAuthProvider.credential(email, password);
      await linkWithCredential(auth.currentUser, credential);

      const normalizedProviders = normalizeAuthProviders(auth.currentUser);
      await updateUser(auth.currentUser.uid, { authProviders: normalizedProviders });

      toast.success('Password set successfully. You can now sign in with email/password.');
      logActivity('profile_update', 'User linked email/password account', 'success', {
        providers: normalizedProviders,
      });
    } catch (error: any) {
      logger.error('Account linking error', { error });

      let friendlyMessage = error.message;
      if (error.code === 'auth/credential-already-in-use') {
        friendlyMessage = 'This email is already linked to another account.';
      } else if (error.code === 'auth/requires-recent-login') {
        friendlyMessage = 'Please sign out and sign back in before linking your account.';
      } else if (error.code === 'auth/email-already-in-use') {
        friendlyMessage = 'This email is already in use by another account.';
      }

      toast.error(friendlyMessage);
      throw new Error(friendlyMessage);
    }
  }, [updateUser, logActivity]);

  const register = useCallback(async (email: string, password: string, userData: Partial<User>) => {
    try {
      if (ADMIN_IDENTITIES.some((a) => a.email.toLowerCase() === email.toLowerCase())) {
        throw new Error('This account is already registered and reserved.');
      }

      if (userData.username) {
        if (RESERVED_USERNAMES.includes(userData.username.toLowerCase())) {
          throw new Error('This username is already reserved.');
        }

        const isAvailable = await checkUsernameAvailability(userData.username);
        if (!isAvailable) {
          throw new Error('This username is already taken.');
        }
      }

      const userCredential = await createUserWithEmailAndPassword(auth, email, password);

      if (userData.name) {
        await updateProfile(userCredential.user, { displayName: userData.name });
      }

      await sendVerificationEmailSafe(userCredential.user);

      const today = new Date().toISOString().split('T')[0];
      const newUser: User = {
        id: userCredential.user.uid,
        name: userData.name || 'User',
        email,
        username: userData.username || '',
        usernameLower: (userData.username || '').toLowerCase(),
        universityCode: userData.universityCode || '',
        department: userData.department || '',
        academicYear: userData.academicYear || '',
        phoneNumber: userData.phoneNumber || '',
        dateOfBirth: userData.dateOfBirth || '',
        gender: userData.gender || '',
        institution: userData.institution || '',
        country: userData.country || '',
        nationality: userData.nationality || '',
        studyInterests: userData.studyInterests || [],
        picture: userCredential.user.photoURL || null,
        role: 'User',
        plan: 'free',
        status: STATUS.PENDING_EMAIL,
        firstLoginDate: new Date().toISOString(),
        lastLogin: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        authProviders: ['password'],
        permissions: defaultPermissions,
        limits: defaultLimits,
        usage: {
          ...defaultUsage,
          lastResetDate: today,
        },
        settings: defaultUserSettings,
        credits: 5,
        totalUploads: 0,
        totalAIRequests: 0,
        totalQuizzes: 0,
        isVerified: false,
      };

      const userDocRef = doc(db, 'users', newUser.id);
      await setDoc(userDocRef, cleanObject(newUser));

      await signOut(auth);
      logActivity('login', 'New user registered via Email, verification sent', 'success', undefined, newUser.id);
      toast.success('Registration successful! Please check your email to verify your account.');
    } catch (error: any) {
      logger.error('Registration error', { error });
      throw error;
    }
  }, [checkUsernameAvailability, sendVerificationEmailSafe, logActivity]);

  const adminLogin = useCallback(async (identifier: string, password: string): Promise<FirebaseUser> => {
    const normalizedIdentifier = identifier.trim();
    const identifierKind = getIdentifierKind(normalizedIdentifier);

    try {
      logger.info('Admin identifier lookup started', {
        area: 'auth',
        event: 'admin-login-lookup-start',
        identifierKind,
      });

      const lookupResponse = await fetchJsonWithTimeout(
        `/api/auth/admin/resolve-identifier?identifier=${encodeURIComponent(normalizedIdentifier)}`,
        {
          method: 'GET',
        },
        USERNAME_RESOLUTION_TIMEOUT_MS,
        identifierKind === 'username'
          ? 'Admin username lookup timed out. Please try again or use your email.'
          : 'Admin identity verification timed out. Please try again.'
      );

      const lookupPayload = await lookupResponse
        .json()
        .catch(() => ({} as AdminIdentifierLookupResponse)) as AdminIdentifierLookupResponse;

      if (!lookupResponse.ok || !lookupPayload.email) {
        throw new Error(
          lookupPayload.error ||
            (lookupResponse.status === 404
              ? identifierKind === 'username'
                ? 'No admin account was found with this username.'
                : 'No admin account was found with this email.'
              : 'Unable to verify your admin identity right now. Please try again shortly.')
        );
      }

      logger.info('Admin identifier lookup resolved', {
        area: 'auth',
        event: 'admin-login-lookup-resolved',
        identifierKind: lookupPayload.identifierType || identifierKind,
        resolutionSource: lookupPayload.resolutionSource || 'admin_email',
      });

      const email = lookupPayload.email;

      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      return userCredential.user;
    } catch (error: any) {
      logger.error('Admin login failed', {
        area: 'auth',
        event: 'admin-login-failed',
        identifierKind,
        error,
      });

      throw new Error(normalizeFriendlyAuthMessage(error, 'admin'));
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      if (auth.currentUser) {
        await logActivity('logout', 'User logged out', 'success', undefined, auth.currentUser.uid);
      }
      await signOut(auth);
      clearSessionState();
      toast.success('Logged out successfully');
    } catch (error) {
      logger.error('Logout error', { error });
      toast.error('Logout failed');
    }
  }, [logActivity, clearSessionState]);

  return {
    login,
    loginWithIdentifier,
    register,
    adminLogin,
    logout,
    forgotPassword,
    updatePassword,
    linkAccount,
    sendVerificationEmail: sendVerificationEmailSafe,
    resendVerificationEmail,
    checkEmailVerificationStatus,
    syncUserWithFirestore,
  };
}
