import * as React from 'react';
import type { PopupFlowPriority } from '../constants/popupFlows';
import {
  initialPopupFlowState,
  isBlockingAttentionActive,
  reconcilePopupFlowState,
  selectActivePopupFlow,
  type PopupFlowDescriptor,
  type PopupFlowState,
} from '../orchestration/popupFlow';

type PopupFlowRegistration = {
  id: string;
  priority: PopupFlowPriority;
  canPreempt?: boolean;
};

type PopupOrchestratorAction =
  | { type: 'request'; payload: PopupFlowRegistration; requestedAt: number }
  | { type: 'cancel-request'; id: string }
  | { type: 'register-blocker'; payload: PopupFlowRegistration; requestedAt: number }
  | { type: 'unregister-blocker'; id: string };

type PopupOrchestratorContextValue = {
  activeFlowId: string | null;
  activeFlow: PopupFlowDescriptor | null;
  isAttentionLocked: boolean;
  requestFlow: (input: PopupFlowRegistration) => void;
  cancelFlow: (id: string) => void;
  registerBlocker: (input: PopupFlowRegistration) => void;
  unregisterBlocker: (id: string) => void;
  isFlowActive: (id: string) => boolean;
  hasPendingRequest: (id: string) => boolean;
};

const PopupOrchestratorContext = React.createContext<PopupOrchestratorContextValue | null>(null);

function popupOrchestratorReducer(
  state: PopupFlowState,
  action: PopupOrchestratorAction
): PopupFlowState {
  switch (action.type) {
    case 'request': {
      const existing = state.requests[action.payload.id];
      const nextState: PopupFlowState = {
        ...state,
        requests: {
          ...state.requests,
          [action.payload.id]: {
            id: action.payload.id,
            priority: action.payload.priority,
            canPreempt: action.payload.canPreempt,
            requestedAt: existing?.requestedAt ?? action.requestedAt,
            source: 'request',
          },
        },
      };

      return reconcilePopupFlowState(nextState);
    }

    case 'cancel-request': {
      if (!state.requests[action.id]) {
        return state;
      }

      const nextRequests = { ...state.requests };
      delete nextRequests[action.id];

      return reconcilePopupFlowState({
        ...state,
        requests: nextRequests,
      });
    }

    case 'register-blocker': {
      const existing = state.blockers[action.payload.id];
      const nextState: PopupFlowState = {
        ...state,
        blockers: {
          ...state.blockers,
          [action.payload.id]: {
            id: action.payload.id,
            priority: action.payload.priority,
            canPreempt: action.payload.canPreempt,
            requestedAt: existing?.requestedAt ?? action.requestedAt,
            source: 'blocker',
          },
        },
      };

      return reconcilePopupFlowState(nextState);
    }

    case 'unregister-blocker': {
      if (!state.blockers[action.id]) {
        return state;
      }

      const nextBlockers = { ...state.blockers };
      delete nextBlockers[action.id];

      return reconcilePopupFlowState({
        ...state,
        blockers: nextBlockers,
      });
    }

    default:
      return state;
  }
}

export const PopupOrchestratorProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [state, dispatch] = React.useReducer(
    popupOrchestratorReducer,
    initialPopupFlowState
  );

  const requestFlow = React.useCallback((input: PopupFlowRegistration) => {
    dispatch({
      type: 'request',
      payload: input,
      requestedAt: Date.now(),
    });
  }, []);

  const cancelFlow = React.useCallback((id: string) => {
    dispatch({
      type: 'cancel-request',
      id,
    });
  }, []);

  const registerBlocker = React.useCallback((input: PopupFlowRegistration) => {
    dispatch({
      type: 'register-blocker',
      payload: input,
      requestedAt: Date.now(),
    });
  }, []);

  const unregisterBlocker = React.useCallback((id: string) => {
    dispatch({
      type: 'unregister-blocker',
      id,
    });
  }, []);

  const activeFlow = React.useMemo(() => selectActivePopupFlow(state), [state]);

  const value = React.useMemo<PopupOrchestratorContextValue>(
    () => ({
      activeFlowId: state.activeFlowId,
      activeFlow,
      isAttentionLocked: isBlockingAttentionActive(state),
      requestFlow,
      cancelFlow,
      registerBlocker,
      unregisterBlocker,
      isFlowActive: (id: string) => state.activeFlowId === id,
      hasPendingRequest: (id: string) => Boolean(state.requests[id]),
    }),
    [activeFlow, cancelFlow, registerBlocker, requestFlow, state, unregisterBlocker]
  );

  return (
    <PopupOrchestratorContext.Provider value={value}>
      {children}
    </PopupOrchestratorContext.Provider>
  );
};

export function usePopupOrchestrator() {
  const context = React.useContext(PopupOrchestratorContext);

  if (!context) {
    throw new Error('usePopupOrchestrator must be used within PopupOrchestratorProvider.');
  }

  return context;
}

export function usePopupBlocker(input: {
  id: string;
  isActive: boolean;
  priority: PopupFlowPriority;
  canPreempt?: boolean;
}) {
  const { registerBlocker, unregisterBlocker } = usePopupOrchestrator();
  const { canPreempt = false, id, isActive, priority } = input;

  React.useEffect(() => {
    if (!isActive) {
      unregisterBlocker(id);
      return;
    }

    /**
     * Local dialogs still manage their own render state, but they publish their
     * attention claim here so lower-priority flows like the welcome sequence
     * can wait instead of visually racing them.
     */
    registerBlocker({
      id,
      priority,
      canPreempt,
    });

    return () => {
      unregisterBlocker(id);
    };
  }, [canPreempt, id, isActive, priority, registerBlocker, unregisterBlocker]);
}
