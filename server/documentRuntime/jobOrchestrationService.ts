import { runtimeStateService } from './runtimeStateService.js';
import { DocumentActorContext, DocumentOperationState } from './types.js';

/**
 * BullMQ is intentionally not introduced in this phase because the current
 * extraction path still completes inside the request lifecycle and there is no
 * dedicated worker process in the existing deployment contract. This service
 * centralizes operation-state orchestration so a BullMQ-backed worker can take
 * over later without changing route handlers or tool-facing responses.
 */
export class JobOrchestrationService {
  async start(actor: DocumentActorContext, operation: DocumentOperationState): Promise<void> {
    await runtimeStateService.setOperationState(actor, operation);
  }

  async patch(
    actor: DocumentActorContext,
    operationId: string,
    patch: Partial<DocumentOperationState>
  ): Promise<DocumentOperationState | null> {
    return runtimeStateService.patchOperationState(actor, operationId, patch);
  }

  async fail(
    actor: DocumentActorContext,
    operationId: string,
    input: {
      stage: DocumentOperationState['stage'];
      message: string;
      errorCode: string;
    }
  ): Promise<DocumentOperationState | null> {
    return runtimeStateService.patchOperationState(actor, operationId, {
      stage: input.stage,
      status: 'failed',
      message: input.message,
      errorCode: input.errorCode,
    });
  }

  async cancel(
    actor: DocumentActorContext,
    operationId: string,
    input: {
      stage: DocumentOperationState['stage'];
      message: string;
    }
  ): Promise<DocumentOperationState | null> {
    return runtimeStateService.patchOperationState(actor, operationId, {
      stage: input.stage,
      status: 'cancelled',
      message: input.message,
    });
  }
}

export const jobOrchestrationService = new JobOrchestrationService();
