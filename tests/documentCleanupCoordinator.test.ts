import test from 'node:test';
import assert from 'node:assert/strict';
import { CleanupCoordinator } from '../server/documentRuntime/cleanupCoordinator';
import { runtimeStateService } from '../server/documentRuntime/runtimeStateService';
import { jobOrchestrationService } from '../server/documentRuntime/jobOrchestrationService';
import type { DocumentActorContext } from '../server/documentRuntime/types';

const actor: DocumentActorContext = {
  actorId: 'user-cleanup',
  actorRole: 'User',
  scope: 'user',
};

test('cancelOperation requests cancellation, marks the document cancelled, and clears active runtime state', async () => {
  const calls: string[] = [];
  const store = {
    async markCancelled(receivedActor: DocumentActorContext, documentId: string) {
      calls.push(`markCancelled:${receivedActor.actorId}:${documentId}`);
    },
  };

  const originalRequestCancellation = runtimeStateService.requestCancellation;
  const originalClearDocumentState = runtimeStateService.clearDocumentState;
  const originalGetActiveDocument = runtimeStateService.getActiveDocument;
  const originalClearActiveDocument = runtimeStateService.clearActiveDocument;
  const originalCancel = jobOrchestrationService.cancel;

  (runtimeStateService as any).requestCancellation = async (receivedActor: DocumentActorContext, operationId: string) => {
    calls.push(`requestCancellation:${receivedActor.actorId}:${operationId}`);
  };
  (runtimeStateService as any).clearDocumentState = async (receivedActor: DocumentActorContext, documentId: string) => {
    calls.push(`clearDocumentState:${receivedActor.actorId}:${documentId}`);
  };
  (runtimeStateService as any).getActiveDocument = async () => ({
    documentId: 'doc-cleanup',
  });
  (runtimeStateService as any).clearActiveDocument = async (receivedActor: DocumentActorContext) => {
    calls.push(`clearActiveDocument:${receivedActor.actorId}`);
  };
  (jobOrchestrationService as any).cancel = async (receivedActor: DocumentActorContext, operationId: string) => {
    calls.push(`cancelOperationState:${receivedActor.actorId}:${operationId}`);
  };

  try {
    const coordinator = new CleanupCoordinator(store as any);
    await coordinator.cancelOperation(actor, 'doc-cleanup', 'op-cleanup');
  } finally {
    (runtimeStateService as any).requestCancellation = originalRequestCancellation;
    (runtimeStateService as any).clearDocumentState = originalClearDocumentState;
    (runtimeStateService as any).getActiveDocument = originalGetActiveDocument;
    (runtimeStateService as any).clearActiveDocument = originalClearActiveDocument;
    (jobOrchestrationService as any).cancel = originalCancel;
  }

  assert.deepEqual(calls, [
    'requestCancellation:user-cleanup:op-cleanup',
    'cancelOperationState:user-cleanup:op-cleanup',
    'markCancelled:user-cleanup:doc-cleanup',
    'clearDocumentState:user-cleanup:doc-cleanup',
    'clearActiveDocument:user-cleanup',
  ]);
});
