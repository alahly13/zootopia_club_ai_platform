import { POPUP_FLOW_PRIORITY, type PopupFlowPriority } from '../constants/popupFlows';

export type PopupFlowSource = 'request' | 'blocker';

export interface PopupFlowDescriptor {
  id: string;
  priority: PopupFlowPriority;
  requestedAt: number;
  source: PopupFlowSource;
  canPreempt?: boolean;
}

export interface PopupFlowState {
  activeFlowId: string | null;
  requests: Record<string, PopupFlowDescriptor>;
  blockers: Record<string, PopupFlowDescriptor>;
}

export const initialPopupFlowState: PopupFlowState = {
  activeFlowId: null,
  requests: {},
  blockers: {},
};

export function pickHighestPriorityFlow(
  flows: PopupFlowDescriptor[]
): PopupFlowDescriptor | null {
  if (flows.length === 0) {
    return null;
  }

  return [...flows].sort((left, right) => {
    if (left.priority !== right.priority) {
      return left.priority - right.priority;
    }

    return left.requestedAt - right.requestedAt;
  })[0];
}

export function selectActivePopupFlow(
  state: PopupFlowState
): PopupFlowDescriptor | null {
  if (!state.activeFlowId) {
    return null;
  }

  return state.blockers[state.activeFlowId] || state.requests[state.activeFlowId] || null;
}

export function chooseNextPopupFlow(
  state: PopupFlowState
): PopupFlowDescriptor | null {
  const activeBlocker = pickHighestPriorityFlow(Object.values(state.blockers));
  if (activeBlocker) {
    return activeBlocker;
  }

  return pickHighestPriorityFlow(Object.values(state.requests));
}

export function reconcilePopupFlowState(
  state: PopupFlowState
): PopupFlowState {
  const activeFlow = selectActivePopupFlow(state);
  const preemptiveBlocker = pickHighestPriorityFlow(
    Object.values(state.blockers).filter((flow) => flow.canPreempt)
  );

  if (
    activeFlow &&
    preemptiveBlocker &&
    preemptiveBlocker.id !== activeFlow.id &&
    preemptiveBlocker.priority < activeFlow.priority
  ) {
    return {
      ...state,
      activeFlowId: preemptiveBlocker.id,
    };
  }

  if (activeFlow?.source === 'blocker' && state.blockers[activeFlow.id]) {
    return state;
  }

  if (activeFlow?.source === 'request' && state.requests[activeFlow.id]) {
    return state;
  }

  return {
    ...state,
    activeFlowId: chooseNextPopupFlow(state)?.id ?? null,
  };
}

export function isBlockingAttentionActive(state: PopupFlowState) {
  const activeFlow = selectActivePopupFlow(state);
  if (!activeFlow) {
    return false;
  }

  return activeFlow.priority <= POPUP_FLOW_PRIORITY.helper;
}
