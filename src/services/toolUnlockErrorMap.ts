const TOOL_UNLOCK_ERROR_MESSAGES: Record<string, string> = {
  expired: 'This code has expired.',
  'wrong-purpose': 'This code is not an unlock code for tools.',
  'already-used': 'This code was already used.',
  'usage-limit-reached': 'This code has reached its maximum usage.',
  'code-status-revoked': 'This code has been revoked by admin.',
  'code-status-paused': 'This code is paused and cannot be used right now.',
  'wrong-tool': 'This code does not unlock this tool.',
  'code-not-found': 'Code not found. Please check and try again.',
  'invalid-tool-id': 'This tool cannot be unlocked with this flow.',
};

export function mapToolUnlockRedeemError(errorCodeOrMessage: string): string {
  const normalized = String(errorCodeOrMessage || '').trim();
  if (!normalized) {
    return 'Failed to redeem code.';
  }
  return TOOL_UNLOCK_ERROR_MESSAGES[normalized] || normalized;
}
