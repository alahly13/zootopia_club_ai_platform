import { useCallback, useMemo } from 'react';

/**
 * SECURITY HARDENING NOTE
 * ------------------------------------------------------------------
 * Provider secrets must never be persisted in browser storage.
 * This hook now preserves the older AuthContext shape without storing
 * any live API keys client-side. All real provider credentials remain
 * server-authoritative and env-backed.
 */

const SERVER_MANAGED_QWEN_REGION = 'us-virginia';
const SERVER_MANAGED_QWEN_BASE_URL = 'https://dashscope-us.aliyuncs.com/compatible-mode/v1';

export function useApiKeys() {
  const noop = useCallback((_value: string) => {
    // Intentionally a no-op:
    // live provider credential changes must happen on the server.
  }, []);

  return useMemo(() => ({
    platformApiKey: '',
    setPlatformApiKey: noop,
    qwenApiKey: '',
    setQwenApiKey: noop,
    qwenRegion: SERVER_MANAGED_QWEN_REGION,
    setQwenRegion: noop,
    qwenBaseUrl: SERVER_MANAGED_QWEN_BASE_URL,
    setQwenBaseUrl: noop,
    resetQwenConfig: () => undefined,
    resetAllApiKeys: () => undefined,
  }), [noop]);
}
