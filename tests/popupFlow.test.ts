import assert from 'node:assert/strict';
import test from 'node:test';
import { POPUP_FLOW_PRIORITY } from '../src/constants/popupFlows';
import {
  chooseNextPopupFlow,
  reconcilePopupFlowState,
  type PopupFlowState,
} from '../src/orchestration/popupFlow';

test('keeps the current active request until it is released', () => {
  const state: PopupFlowState = {
    activeFlowId: 'welcome',
    requests: {
      welcome: {
        id: 'welcome',
        priority: POPUP_FLOW_PRIORITY.welcome,
        requestedAt: 1,
        source: 'request',
      },
      support: {
        id: 'support',
        priority: POPUP_FLOW_PRIORITY.secondarySupport,
        requestedAt: 2,
        source: 'request',
      },
    },
    blockers: {},
  };

  const nextState = reconcilePopupFlowState(state);
  assert.equal(nextState.activeFlowId, 'welcome');
});

test('prefers blockers over queued requests until the blocker clears', () => {
  const stateWithBlocker: PopupFlowState = {
    activeFlowId: 'notification',
    requests: {
      welcome: {
        id: 'welcome',
        priority: POPUP_FLOW_PRIORITY.welcome,
        requestedAt: 2,
        source: 'request',
      },
    },
    blockers: {
      notification: {
        id: 'notification',
        priority: POPUP_FLOW_PRIORITY.helper,
        requestedAt: 1,
        source: 'blocker',
      },
    },
  };

  assert.equal(chooseNextPopupFlow(stateWithBlocker)?.id, 'notification');

  const clearedState = reconcilePopupFlowState({
    ...stateWithBlocker,
    activeFlowId: null,
    blockers: {},
  });

  assert.equal(clearedState.activeFlowId, 'welcome');
});

test('preemptive required blockers can replace a lower-priority active flow', () => {
  const nextState = reconcilePopupFlowState({
    activeFlowId: 'welcome',
    requests: {
      welcome: {
        id: 'welcome',
        priority: POPUP_FLOW_PRIORITY.welcome,
        requestedAt: 1,
        source: 'request',
      },
    },
    blockers: {
      required: {
        id: 'required',
        priority: POPUP_FLOW_PRIORITY.requiredAction,
        requestedAt: 2,
        source: 'blocker',
        canPreempt: true,
      },
    },
  });

  assert.equal(nextState.activeFlowId, 'required');
});
