export const POPUP_FLOW_PRIORITY = {
  requiredAction: 1,
  criticalBlocking: 2,
  welcome: 3,
  secondarySupport: 4,
  helper: 5,
} as const;

export type PopupFlowPriority =
  (typeof POPUP_FLOW_PRIORITY)[keyof typeof POPUP_FLOW_PRIORITY];

export const REQUIRED_ACCOUNT_COMPLETION_FLOW_ID = 'required-account-completion';
export const WELCOME_AUTO_FLOW_ID = 'welcome-auto';
export const WELCOME_MANUAL_FLOW_ID = 'welcome-manual';
export const CREDIT_REQUEST_FLOW_ID = 'credit-request';
export const NOTIFICATION_DROPDOWN_FLOW_ID = 'notification-dropdown';
export const RESULT_PREVIEW_FLOW_ID = 'result-preview';
export const MODEL_ACCESS_MODAL_FLOW_ID = 'model-access-modal';
export const TOOL_UNLOCK_FLOW_ID = 'tool-unlock';
export const ACCOUNT_DELETE_FLOW_ID = 'account-delete';

export function isWelcomeFlowId(flowId: string | null | undefined) {
  return flowId === WELCOME_AUTO_FLOW_ID || flowId === WELCOME_MANUAL_FLOW_ID;
}
