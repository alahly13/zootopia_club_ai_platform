type IdleTaskCallback = () => void;

type IdleCallbackHandle =
  | {
      kind: 'idle';
      id: number;
    }
  | {
      kind: 'timeout';
      id: number;
    }
  | null;

type IdleCapableWindow = Window &
  typeof globalThis & {
    requestIdleCallback?: (
      callback: () => void,
      options?: {
        timeout?: number;
      }
    ) => number;
    cancelIdleCallback?: (handle: number) => void;
  };

export function scheduleNonCriticalTask(
  callback: IdleTaskCallback,
  timeoutMs = 1500
): IdleCallbackHandle {
  if (typeof window === 'undefined') {
    callback();
    return null;
  }

  const idleWindow = window as IdleCapableWindow;

  if (typeof idleWindow.requestIdleCallback === 'function') {
    return {
      kind: 'idle',
      id: idleWindow.requestIdleCallback(callback, { timeout: timeoutMs }),
    };
  }

  return {
    kind: 'timeout',
    id: window.setTimeout(callback, Math.min(timeoutMs, 400)),
  };
}

export function cancelScheduledTask(handle: IdleCallbackHandle) {
  if (!handle || typeof window === 'undefined') {
    return;
  }

  const idleWindow = window as IdleCapableWindow;

  if (handle.kind === 'idle' && typeof idleWindow.cancelIdleCallback === 'function') {
    idleWindow.cancelIdleCallback(handle.id);
    return;
  }

  if (handle.kind === 'timeout') {
    window.clearTimeout(handle.id);
  }
}
