import { DocumentArtifactStore } from './documentArtifactStore.js';
import { jobOrchestrationService } from './jobOrchestrationService.js';
import { runtimeStateService } from './runtimeStateService.js';
import { DocumentActorContext } from './types.js';

export class CleanupCoordinator {
  constructor(private readonly artifactStore: DocumentArtifactStore) {}

  async invalidateDocument(actor: DocumentActorContext, documentId: string, reason: string): Promise<void> {
    const document = await this.artifactStore.getOwnedDocument(actor, documentId);
    await runtimeStateService.requestCancellation(actor, document.runtimeOperationId);
    await this.artifactStore.invalidateDocument(actor, documentId, reason);
    await runtimeStateService.clearDocumentState(actor, documentId);
    const active = await runtimeStateService.getActiveDocument(actor);
    if (active?.documentId === documentId) {
      await runtimeStateService.clearActiveDocument(actor);
    }
  }

  async cancelOperation(actor: DocumentActorContext, documentId: string, operationId: string): Promise<void> {
    await runtimeStateService.requestCancellation(actor, operationId);
    await jobOrchestrationService.cancel(actor, operationId, {
      stage: 'cancelled',
      message: 'Document processing was cancelled.',
    });
    await this.artifactStore.markCancelled(actor, documentId);
    await runtimeStateService.clearDocumentState(actor, documentId);
    const active = await runtimeStateService.getActiveDocument(actor);
    if (active?.documentId === documentId) {
      await runtimeStateService.clearActiveDocument(actor);
    }
  }
}
