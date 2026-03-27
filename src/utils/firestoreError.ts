import { auth } from '../firebase';
import { logger } from './logger';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  code: string;
  category: 'permission' | 'auth' | 'network' | 'quota' | 'validation' | 'unknown';
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  };
  timestamp: string;
}

type FirebaseLikeError = {
  code?: string;
  message?: string;
  name?: string;
  stack?: string;
};

const normalizeFirestoreCode = (error: unknown): string => {
  const maybeError = error as FirebaseLikeError;
  const code = (maybeError?.code || '').trim().toLowerCase();
  if (!code) return 'unknown';
  if (code.startsWith('firestore/')) {
    return code.slice('firestore/'.length);
  }
  return code;
};

const classifyFirestoreCode = (code: string): FirestoreErrorInfo['category'] => {
  if (code.includes('permission-denied') || code.includes('forbidden')) return 'permission';
  if (code.includes('unauthenticated') || code.includes('auth')) return 'auth';
  if (code.includes('unavailable') || code.includes('deadline') || code.includes('network')) return 'network';
  if (code.includes('resource-exhausted') || code.includes('quota')) return 'quota';
  if (code.includes('invalid') || code.includes('failed-precondition')) return 'validation';
  return 'unknown';
};

const normalizeFirestoreMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  const maybeError = error as FirebaseLikeError;
  if (typeof maybeError?.message === 'string' && maybeError.message.trim()) {
    return maybeError.message;
  }
  return 'Unknown Firestore error';
};

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const code = normalizeFirestoreCode(error);
  const errInfo: FirestoreErrorInfo = {
    code,
    category: classifyFirestoreCode(code),
    error: normalizeFirestoreMessage(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path,
    timestamp: new Date().toISOString(),
  };

  // Keep payload compact and safe for shared diagnostics.
  logger.error('Firestore Error', {
    area: 'firestore',
    event: 'firestore.operation_failed',
    operationType,
    path,
    code: errInfo.code,
    category: errInfo.category,
    authUserId: errInfo.authInfo.userId,
    authTenantId: errInfo.authInfo.tenantId,
    error: errInfo.error,
  });

  // Backward compatibility: some callers expect a JSON-stringified Error payload.
  throw new Error(JSON.stringify(errInfo));
}
