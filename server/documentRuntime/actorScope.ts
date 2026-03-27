import { DocumentActorContext } from './types.js';

export function createActorContext(input: {
  uid: string;
  role?: string | null;
  email?: string | null;
  adminLevel?: string | null;
  isAdmin?: boolean;
  authType?: 'normal' | 'fast_access' | 'admin';
}): DocumentActorContext {
  const normalizedRole =
    String(input.role || '').trim().toLowerCase() === 'admin' || input.isAdmin
      ? 'Admin'
      : 'User';
  const normalizedAuthType =
    input.authType === 'admin' || input.authType === 'fast_access' || input.authType === 'normal'
      ? input.authType
      : normalizedRole === 'Admin'
        ? 'admin'
        : 'normal';

  return {
    actorId: input.uid,
    actorRole: normalizedRole,
    scope: normalizedRole === 'Admin' ? 'admin' : 'user',
    authType: normalizedAuthType,
    adminLevel: input.adminLevel || null,
    email: input.email || null,
  };
}

export function buildActorNamespace(actor: DocumentActorContext): string {
  return actor.scope === 'admin'
    ? `admins/${actor.actorId}`
    : `users/${actor.actorId}`;
}

export function assertActorOwnsResource(
  actor: DocumentActorContext,
  ownerActorId: string,
  workspaceScope: DocumentActorContext['scope']
): void {
  const sameActor = actor.actorId === ownerActorId && actor.scope === workspaceScope;
  if (!sameActor) {
    throw new Error('DOCUMENT_ACCESS_DENIED');
  }
}
