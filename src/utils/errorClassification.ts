import { ErrorCategory } from '../types/status';

type ClassificationResult = { category: ErrorCategory; message: string };

type ErrorRule = {
  match: (input: string) => boolean;
  result: ClassificationResult;
};

const containsWholeWord = (input: string, word: string) => {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`).test(input);
};

const STRUCTURED_TO_STATUS_CATEGORY: Record<string, ErrorCategory> = {
  validation: 'validation_error',
  input: 'input_error',
  auth: 'auth_error',
  permission: 'permission_error',
  network: 'network_error',
  timeout: 'timeout_error',
  provider: 'provider_error',
  routing: 'backend_error',
  cache: 'backend_error',
  parsing: 'parsing_error',
  storage: 'backend_error',
  communication: 'backend_error',
  internal: 'backend_error',
};

const FIRESTORE_CODE_MAP: Record<string, ClassificationResult> = {
  'permission-denied': {
    category: 'permission_error',
    message: 'You do not have permission to access this data.',
  },
  unauthenticated: {
    category: 'auth_error',
    message: 'Your session is not authenticated. Please log in and try again.',
  },
  unavailable: {
    category: 'network_error',
    message: 'Service is temporarily unavailable. Please try again shortly.',
  },
  deadline_exceeded: {
    category: 'timeout_error',
    message: 'The request timed out. Please retry.',
  },
  'resource-exhausted': {
    category: 'recoverable_error',
    message: 'System quota is currently exhausted. Please try again later.',
  },
};

const CLASSIFICATION_RULES: ErrorRule[] = [
  {
    match: input => input.includes('pdf') || input.includes('extract') || input.includes('document preparation failed') || input.includes('file processing timed out') || input.includes('parsing failed'),
    result: { category: 'parsing_error', message: '' },
  },
  {
    match: input => input.includes('permission') || input.includes('access denied') || input.includes('forbidden'),
    result: { category: 'permission_error', message: 'You do not have permission to perform this action.' },
  },
  {
    match: input =>
      input.includes('wrong password') ||
      input.includes('incorrect password') ||
      input.includes('invalid credential') ||
      input.includes('invalid-login-credentials') ||
      input.includes('user-not-found') ||
      input.includes('no account found') ||
      input.includes('no account was found') ||
      input.includes('no admin account') ||
      input.includes('invalid username') ||
      input.includes('invalid email') ||
      input.includes('not authorized for admin access') ||
      input.includes('session expired') ||
      input.includes('session invalidated'),
    result: { category: 'auth_error', message: '' },
  },
  {
    match: input => input.includes('auth') || input.includes('login') || input.includes('unauthorized') || input.includes('unauthenticated'),
    result: { category: 'auth_error', message: 'Please log in to continue.' },
  },
  {
    match: input => input.includes('network') || input.includes('fetch') || input.includes('failed to fetch') || input.includes('unavailable'),
    result: { category: 'network_error', message: 'Network connection issue. Please check your internet.' },
  },
  {
    match: input => input.includes('timeout') || input.includes('deadline exceeded'),
    result: { category: 'timeout_error', message: 'The request timed out. Please try again.' },
  },
  {
    match: input => input.includes('validation') || input.includes('invalid'),
    result: { category: 'validation_error', message: '' },
  },
  {
    match: input => input.includes('schema') || input.includes('parse') || input.includes('json'),
    result: { category: 'parsing_error', message: 'The response format was invalid. Please retry.' },
  },
  {
    match: input =>
      input.includes('model') ||
      input.includes('gemini') ||
      input.includes('qwen') ||
      input.includes('llm') ||
      input.includes('ai provider') ||
      input.includes('provider runtime') ||
      containsWholeWord(input, 'ai'),
    result: { category: 'model_error', message: 'The AI model encountered an issue. Please try again.' },
  },
  {
    match: input => input.includes('quota') || input.includes('limit') || input.includes('resource-exhausted'),
    result: { category: 'recoverable_error', message: 'Usage limit reached. Please try again later.' },
  },
];

const safeParseJson = (value: string): Record<string, unknown> | null => {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // not JSON payload, continue with plain-text rules
  }
  return null;
};

const classifyFirestorePayload = (payload: Record<string, unknown>): ClassificationResult | null => {
  const code = String(payload.code || '').toLowerCase();
  if (!code) return null;
  return FIRESTORE_CODE_MAP[code] || null;
};

export const classifyError = (error: any): { category: ErrorCategory; message: string } => {
  const structured = error?.errorInfo || error?.details?.errorInfo;
  if (structured?.category) {
    return {
      category: STRUCTURED_TO_STATUS_CATEGORY[structured.category] || 'backend_error',
      message: structured.userMessage || structured.message || 'An unexpected error occurred. Please try again.',
    };
  }

  const errorMessage = error?.message || String(error);
  const lower = errorMessage.toLowerCase();

  // Compatibility note:
  // Some Firestore handlers still throw JSON-stringified error info. We detect
  // that shape first so classification remains deterministic and future-safe.
  const firestorePayload = safeParseJson(errorMessage);
  if (firestorePayload) {
    const firestoreClassification = classifyFirestorePayload(firestorePayload);
    if (firestoreClassification) {
      return firestoreClassification;
    }
  }

  for (const rule of CLASSIFICATION_RULES) {
    if (rule.match(lower)) {
      if (
        (
          rule.result.category === 'validation_error' ||
          rule.result.category === 'parsing_error' ||
          rule.result.category === 'auth_error'
        ) &&
        !rule.result.message
      ) {
        return {
          category: rule.result.category,
          message: errorMessage,
        };
      }

      return rule.result;
    }
  }

  return { category: 'backend_error', message: 'An unexpected error occurred. Please try again.' };
};
