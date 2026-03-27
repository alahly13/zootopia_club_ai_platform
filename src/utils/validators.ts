const PAYMENT_SESSION_KEYS = ['session_id', 'sessionId', 'merchant_order_id', 'merchantOrderId', 'merchantRefNumber', 'order_id', 'id', 'fawryRefNumber'] as const;
const PAYMENT_STATUS_KEYS = ['success', 'status', 'paymentStatus'] as const;

export function cleanString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeEmail(value: unknown): string {
  return cleanString(value).toLowerCase();
}

export function normalizeRecipientEmails(emails: unknown): string[] {
  if (!Array.isArray(emails)) return [];

  return Array.from(
    new Set(
      emails
        .map((email) => normalizeEmail(email))
        .filter(Boolean)
    )
  );
}

export async function safeParseJson<T = unknown>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export function toPositiveInteger(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

export function getPaymentSessionId(params: URLSearchParams): string | null {
  for (const key of PAYMENT_SESSION_KEYS) {
    const value = cleanString(params.get(key));
    if (value) return value;
  }
  return null;
}

export function hasSuccessfulPaymentFlag(params: URLSearchParams): boolean {
  const success = cleanString(params.get(PAYMENT_STATUS_KEYS[0]));
  const status = cleanString(params.get(PAYMENT_STATUS_KEYS[1])).toLowerCase();
  const paymentStatus = cleanString(params.get(PAYMENT_STATUS_KEYS[2])).toUpperCase();
  return success === 'true' || status === 'success' || paymentStatus === 'PAID';
}

export function stripPaymentCallbackParams(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const key of [...PAYMENT_SESSION_KEYS, ...PAYMENT_STATUS_KEYS, 'cancelled']) {
    next.delete(key);
  }
  return next;
}
