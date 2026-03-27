export type InboxType = 'user' | 'admin';
export type MessageType = 'message' | 'notification' | 'popup' | 'toast';
export type MessagePurpose = 
  | 'gift_code' 
  | 'secret_code' 
  | 'model_unlock' 
  | 'tool_unlock' 
  | 'approval_request' 
  | 'billing_notice' 
  | 'announcement' 
  | 'system_alert';

export interface InboxMessage {
  id: string;
  recipientUserId: string;
  senderId: string;
  senderType: 'system' | 'admin' | 'user';
  inboxType: InboxType;
  messageType: MessageType;
  purpose: MessagePurpose;
  subject: string;
  body: string;
  codeValue?: string;
  metadata?: Record<string, any>;
  status: 'unread' | 'read' | 'archived';
  createdAt: any;
  readAt?: any;
  archivedAt?: any;
  relatedRequestId?: string;
  relatedCodeId?: string;
}
