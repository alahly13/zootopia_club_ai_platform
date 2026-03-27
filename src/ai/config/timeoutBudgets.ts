/**
 * Shared AI timeout budgets.
 * ------------------------------------------------------------------
 * Keep these values aligned across client UI, client execution wrappers,
 * provider adapters, and server request limits so one layer does not give up
 * long before the others.
 *
 * Intentional structure:
 * - provider execution gets about 5 minutes of actual model time
 * - client/server layers get only small buffers above that for transport
 *   and response finalization
 * - file preparation gets a smaller increase because it is pre-AI work
 */
export const AI_PROVIDER_EXECUTION_TIMEOUT_MS = 300_000;
export const AI_CLIENT_EXECUTION_TIMEOUT_MS = 320_000;
export const AI_UI_EXECUTION_TIMEOUT_MS = 325_000;
export const AI_FILE_PREPARATION_TIMEOUT_MS = 90_000;
export const AI_SERVER_REQUEST_TIMEOUT_MS = 330_000;
export const AI_SERVER_HEADERS_TIMEOUT_MS = 335_000;
