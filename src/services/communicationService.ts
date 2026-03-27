/*
 * Copyright (c) Elmahdy Abdallah Youssef. All rights reserved.
 * Developed by Elmahdy Abdallah Youssef, Software Developer.
 * Class of 2022, Faculty of Science, Cairo University, Zoology Department.
 */

import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDocs,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  QueryConstraint,
  Timestamp,
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Purpose } from '../types/communication';
import { cleanString, normalizeEmail } from '../utils/validators';

export type CommunicationSystem = 'internal' | 'email';
export type CommunicationType = 'email' | 'message' | 'notification' | 'popup' | 'toast';

export interface CommunicationTemplate {
  id: string;
  name: string;
  system: CommunicationSystem;
  type: CommunicationType;
  purpose: string;
  variant?: string;
  title?: string;
  subject?: string;
  body: string;
  ctaLabel?: string;
  ctaLink?: string;
  placeholders: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface InternalCommunication {
  id: string;
  userId: string;
  type: 'message' | 'notification' | 'popup' | 'toast';
  purpose: string;
  title: string;
  message: string;
  code?: string;
  ctaLabel?: string;
  ctaLink?: string;
  read: boolean;
  dismissed: boolean;
  createdAt: string;
  expiresAt?: string;
  metadata?: Record<string, unknown>;
}

export interface CommunicationLog {
  id: string;
  system: CommunicationSystem;
  type: string;
  purpose: string;
  templateId?: string;
  senderId: string;
  recipientId?: string;
  recipientEmail?: string;
  status: string;
  sentAt: string;
  details?: Record<string, unknown>;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  };
}

type SendEmailPayload = {
  templateId?: string;
  recipientEmails: string[];
  subject?: string;
  body?: string;
  dynamicData?: Record<string, unknown>;
  purpose: string;
};

type SendInternalInput = Omit<
  InternalCommunication,
  'id' | 'createdAt' | 'read' | 'dismissed'
>;

const COLLECTIONS = {
  templates: 'email_templates',
  inbox: 'inbox',
  adminInbox: 'admin_inbox',
  internalCommunications: 'internal_communications',
  internalCommunicationLogs: 'internal_communication_logs',
  adminChatMessages: 'admin_chat_messages',
} as const;

function normalizeCreatedAt(value: unknown): string {
  if (!value) return new Date(0).toISOString();

  if (typeof value === 'string') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }

  if (typeof value === 'object' && value !== null && typeof (value as any).toDate === 'function') {
    try {
      return (value as any).toDate().toISOString();
    } catch {
      return new Date(0).toISOString();
    }
  }

  return new Date(0).toISOString();
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && String((error as any).code || '') === 'not-found';
}

function normalizeCommunicationDoc(docId: string, raw: Record<string, any>): InternalCommunication {
  const type = cleanString(raw.type) || cleanString(raw.messageType) || 'message';
  const createdAt = normalizeCreatedAt(raw.createdAt || raw.createdAtServer || raw.timestamp);

  return {
    id: docId,
    userId: cleanString(raw.userId) || cleanString(raw.recipientUserId) || '',
    type: (type as InternalCommunication['type']) || 'message',
    purpose: cleanString(raw.purpose) || 'manual',
    title: cleanString(raw.title) || cleanString(raw.subject) || 'Message',
    message: cleanString(raw.message) || cleanString(raw.body) || '',
    code: cleanString(raw.code) || cleanString(raw.codeValue) || undefined,
    ctaLabel: cleanString(raw.ctaLabel) || cleanString(raw.metadata?.ctaLabel) || undefined,
    ctaLink: cleanString(raw.ctaLink) || cleanString(raw.metadata?.ctaAction) || undefined,
    read: raw.read === true || cleanString(raw.status) === 'read',
    dismissed: raw.dismissed === true || cleanString(raw.status) === 'archived',
    createdAt,
    expiresAt: cleanString(raw.expiresAt) || cleanString(raw.metadata?.expiresAt) || undefined,
    metadata: (raw.metadata || {}) as Record<string, unknown>,
  };
}

function safeIsoDate(value?: string | null): string | undefined {
  const v = cleanString(value);
  if (!v) return undefined;

  const parsed = new Date(v);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function normalizeRecipientEmails(emails: string[]): string[] {
  if (!Array.isArray(emails)) return [];

  return Array.from(
    new Set(
      emails
        .map((email) => normalizeEmail(email))
        .filter(Boolean)
    )
  );
}

async function safeParseJson(response: Response): Promise<any> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function getCurrentSenderId(): string {
  return auth.currentUser?.uid || 'system';
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData.map((provider) => ({
          providerId: provider.providerId,
          displayName: provider.displayName,
          email: provider.email,
          photoUrl: provider.photoURL,
        })) || [],
    },
    operationType,
    path,
  };

  console.error('Firestore Error:', errInfo);
  throw new Error(errInfo.error);
}

class CommunicationService {
  /**
   * Collections are centralized here intentionally so future changes
   * do not create silent mismatches across the file.
   */
  private templatesCol = collection(db, COLLECTIONS.templates);
  private inboxCol = collection(db, COLLECTIONS.inbox);
  private adminInboxCol = collection(db, COLLECTIONS.adminInbox);
  private internalCol = collection(db, COLLECTIONS.internalCommunications);
  private logsCol = collection(db, COLLECTIONS.internalCommunicationLogs);
  private chatCol = collection(db, COLLECTIONS.adminChatMessages);

  // ---------------------------------------------------------------------------
  // Validation helpers
  // ---------------------------------------------------------------------------

  private validateTemplateInput(template: Partial<CommunicationTemplate>) {
    if (!cleanString(template.name)) {
      throw new Error('Template name is required.');
    }

    if (!cleanString(template.system)) {
      throw new Error('Template system is required.');
    }

    if (!cleanString(template.type)) {
      throw new Error('Template type is required.');
    }

    if (!cleanString(template.purpose)) {
      throw new Error('Template purpose is required.');
    }

    if (!cleanString(template.body)) {
      throw new Error('Template body is required.');
    }
  }

  private validateInternalInput(comm: SendInternalInput) {
    if (!cleanString(comm.userId)) {
      throw new Error('Recipient userId is required.');
    }

    if (!cleanString(comm.type)) {
      throw new Error('Internal communication type is required.');
    }

    if (!cleanString(comm.purpose)) {
      throw new Error('Internal communication purpose is required.');
    }

    if (!cleanString(comm.title)) {
      throw new Error('Internal communication title is required.');
    }

    if (!cleanString(comm.message)) {
      throw new Error('Internal communication message is required.');
    }
  }

  private validateEmailInput(data: SendEmailPayload) {
    const recipientEmails = normalizeRecipientEmails(data.recipientEmails);

    if (!cleanString(data.purpose)) {
      throw new Error('Email purpose is required.');
    }

    if (recipientEmails.length === 0) {
      throw new Error('At least one recipient email is required.');
    }

    if (!cleanString(data.templateId) && !cleanString(data.body)) {
      throw new Error('Either templateId or email body is required.');
    }
  }

  // ---------------------------------------------------------------------------
  // Template Management
  // ---------------------------------------------------------------------------

  async getTemplates(system?: CommunicationSystem) {
    try {
      const constraints: QueryConstraint[] = [];

      if (system) {
        constraints.push(where('system', '==', system));
      }

      constraints.push(orderBy('updatedAt', 'desc'));

      const q = query(this.templatesCol, ...constraints);
      const snapshot = await getDocs(q);

      return snapshot.docs.map(
        (item) =>
          ({
            id: item.id,
            ...item.data(),
          }) as CommunicationTemplate
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, COLLECTIONS.templates);
    }
  }

  async saveTemplate(template: Partial<CommunicationTemplate>) {
    this.validateTemplateInput(template);

    const now = new Date().toISOString();
    const normalizedPayload = {
      name: cleanString(template.name),
      system: template.system,
      type: template.type,
      purpose: cleanString(template.purpose),
      variant: cleanString(template.variant) || undefined,
      title: cleanString(template.title) || undefined,
      subject: cleanString(template.subject) || undefined,
      body: cleanString(template.body),
      ctaLabel: cleanString(template.ctaLabel) || undefined,
      ctaLink: cleanString(template.ctaLink) || undefined,
      placeholders: Array.isArray(template.placeholders) ? template.placeholders : [],
      isActive: template.isActive ?? true,
      updatedAt: now,
    };

    try {
      if (template.id) {
        const templateId = cleanString(template.id);
        await updateDoc(doc(this.templatesCol, templateId), normalizedPayload);
        return templateId;
      }

      const docRef = await addDoc(this.templatesCol, {
        ...normalizedPayload,
        createdAt: now,
        createdAtServer: serverTimestamp(),
        updatedAtServer: serverTimestamp(),
      });

      return docRef.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, COLLECTIONS.templates);
    }
  }

  async deleteTemplate(id: string) {
    const templateId = cleanString(id);
    if (!templateId) {
      throw new Error('Template id is required.');
    }

    try {
      await deleteDoc(doc(this.templatesCol, templateId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `${COLLECTIONS.templates}/${templateId}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Sending Internal Communications
  // ---------------------------------------------------------------------------

  /**
   * Internal communications are intentionally stored separately from emails.
   * They feed inbox / popup / toast / notification experiences inside the app.
   */
  async sendInternal(comm: SendInternalInput) {
    this.validateInternalInput(comm);

    const now = new Date().toISOString();
    const payload = {
      userId: cleanString(comm.userId),
      type: comm.type,
      purpose: cleanString(comm.purpose),
      title: cleanString(comm.title),
      message: cleanString(comm.message),
      code: cleanString(comm.code) || undefined,
      ctaLabel: cleanString(comm.ctaLabel) || undefined,
      ctaLink: cleanString(comm.ctaLink) || undefined,
      expiresAt: safeIsoDate(comm.expiresAt),
      metadata: comm.metadata || {},
      read: false,
      dismissed: false,
      createdAt: now,
      createdAtServer: serverTimestamp(),
    };

    try {
      const docRef = await addDoc(this.internalCol, payload);

      await this.logCommunication({
        system: 'internal',
        type: comm.type,
        purpose: payload.purpose,
        senderId: getCurrentSenderId(),
        recipientId: payload.userId,
        status: 'sent',
        sentAt: now,
        details: {
          documentId: docRef.id,
          hasCode: !!payload.code,
          hasCta: !!payload.ctaLabel || !!payload.ctaLink,
        },
      });

      return docRef.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, COLLECTIONS.internalCommunications);
    }
  }

  /**
   * Purpose-based communication remains as a convenience wrapper.
   * It intentionally reuses `sendInternal` and `sendEmail` instead of duplicating logic.
   */
  async sendPurposeCommunication(data: {
    userId: string;
    purpose: Purpose;
    title: string;
    message: string;
    code?: string;
    email?: string;
  }) {
    if (!cleanString(data.userId)) {
      throw new Error('userId is required.');
    }

    if (!cleanString(data.purpose)) {
      throw new Error('purpose is required.');
    }

    if (!cleanString(data.title)) {
      throw new Error('title is required.');
    }

    if (!cleanString(data.message)) {
      throw new Error('message is required.');
    }

    await this.sendInternal({
      userId: data.userId,
      type: 'message',
      purpose: data.purpose,
      title: data.title,
      message: data.message,
      code: data.code,
    });

    if (cleanString(data.email)) {
      await this.sendEmail({
        recipientEmails: [data.email!],
        subject: data.title,
        body: data.message,
        purpose: data.purpose,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Sending Emails (via Backend)
  // ---------------------------------------------------------------------------

  /**
   * This service forwards validated email payloads to the backend unified endpoint.
   * Actual rendering, mail transport, and delivery logging remain backend responsibilities.
   */
  async sendEmail(data: SendEmailPayload) {
    this.validateEmailInput(data);

    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) {
      throw new Error('Not authenticated');
    }

    const payload: SendEmailPayload = {
      templateId: cleanString(data.templateId) || undefined,
      recipientEmails: normalizeRecipientEmails(data.recipientEmails),
      subject: cleanString(data.subject) || undefined,
      body: cleanString(data.body) || undefined,
      dynamicData: data.dynamicData || {},
      purpose: cleanString(data.purpose),
    };

    const response = await fetch('/api/admin/email/send-unified', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify(payload),
    });

    const result = await safeParseJson(response);

    if (!response.ok) {
      throw new Error(result?.error || result?.message || 'Failed to send email');
    }

    return result;
  }

  // ---------------------------------------------------------------------------
  // Logs
  // ---------------------------------------------------------------------------

  async getLogs(limitCount = 50) {
    try {
      const q = query(this.logsCol, orderBy('sentAt', 'desc'));
      const snapshot = await getDocs(q);

      return snapshot.docs
        .slice(0, Math.max(1, limitCount))
        .map(
          (item) =>
            ({
              id: item.id,
              ...item.data(),
            }) as CommunicationLog
        );
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, COLLECTIONS.internalCommunicationLogs);
    }
  }

  /**
   * Logs are intentionally separate from inbox/messages so admins can audit
   * delivery activity without mutating the user-facing records.
   */
  private async logCommunication(log: Omit<CommunicationLog, 'id'>) {
    try {
      await addDoc(this.logsCol, {
        ...log,
        sentAt: cleanString(log.sentAt) || new Date().toISOString(),
        createdAtServer: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, COLLECTIONS.internalCommunicationLogs);
    }
  }

  // ---------------------------------------------------------------------------
  // User-facing: Listen for internal communications
  // ---------------------------------------------------------------------------

  /**
   * The listener intentionally avoids `orderBy + where + composite index`
   * requirements by sorting on the client after receiving documents.
   * This keeps the inbox more resilient in environments where indexes
   * may not yet be fully configured.
   */
  subscribeToUserCommunications(
    userId: string,
    callback: (comms: InternalCommunication[]) => void
  ) {
    const cleanUserId = cleanString(userId);
    if (!cleanUserId) {
      throw new Error('userId is required for communication subscription.');
    }

    const canonicalMessages = new Map<string, InternalCommunication>();
    const legacyMessages = new Map<string, InternalCommunication>();

    const emit = () => {
      const merged = new Map<string, InternalCommunication>();

      canonicalMessages.forEach((value, key) => {
        if (!value.dismissed) {
          merged.set(key, value);
        }
      });

      legacyMessages.forEach((value, key) => {
        if (!value.dismissed && !merged.has(key)) {
          merged.set(key, value);
        }
      });

      const comms = Array.from(merged.values()).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      callback(comms);
    };

    const canonicalQuery = query(this.inboxCol, where('recipientUserId', '==', cleanUserId));
    const legacyQuery = query(this.internalCol, where('userId', '==', cleanUserId));

    const unsubCanonical = onSnapshot(
      canonicalQuery,
      (snapshot) => {
        canonicalMessages.clear();
        snapshot.docs.forEach((item) => {
          const normalized = normalizeCommunicationDoc(item.id, item.data() as Record<string, any>);
          canonicalMessages.set(item.id, normalized);
        });
        emit();
      },
      (error) => {
        console.error('Firestore Error in canonical inbox subscription:', error);
      }
    );

    const unsubLegacy = onSnapshot(
      legacyQuery,
      (snapshot) => {
        legacyMessages.clear();
        snapshot.docs.forEach((item) => {
          const normalized = normalizeCommunicationDoc(item.id, item.data() as Record<string, any>);
          legacyMessages.set(item.id, normalized);
        });
        emit();
      },
      (error) => {
        console.error('Firestore Error in legacy communication subscription:', error);
      }
    );

    return () => {
      unsubCanonical();
      unsubLegacy();
    };
  }

  subscribeToAdminCommunications(callback: (comms: InternalCommunication[]) => void) {
    const canonicalMessages = new Map<string, InternalCommunication>();
    const legacyMessages = new Map<string, InternalCommunication>();

    const emit = () => {
      const merged = new Map<string, InternalCommunication>();

      canonicalMessages.forEach((value, key) => {
        if (!value.dismissed) {
          merged.set(key, value);
        }
      });

      legacyMessages.forEach((value, key) => {
        if (!value.dismissed && !merged.has(key)) {
          merged.set(key, value);
        }
      });

      const comms = Array.from(merged.values()).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      callback(comms);
    };

    const canonicalQuery = query(this.adminInboxCol);
    const legacyQuery = query(this.internalCol, where('metadata.inboxType', '==', 'admin'));

    const unsubCanonical = onSnapshot(
      canonicalQuery,
      (snapshot) => {
        canonicalMessages.clear();
        snapshot.docs.forEach((item) => {
          const normalized = normalizeCommunicationDoc(item.id, item.data() as Record<string, any>);
          canonicalMessages.set(item.id, normalized);
        });
        emit();
      },
      (error) => {
        console.error('Firestore Error in admin inbox subscription:', error);
      }
    );

    const unsubLegacy = onSnapshot(
      legacyQuery,
      (snapshot) => {
        legacyMessages.clear();
        snapshot.docs.forEach((item) => {
          const normalized = normalizeCommunicationDoc(item.id, item.data() as Record<string, any>);
          legacyMessages.set(item.id, normalized);
        });
        emit();
      },
      (error) => {
        console.error('Firestore Error in admin legacy inbox subscription:', error);
      }
    );

    return () => {
      unsubCanonical();
      unsubLegacy();
    };
  }

  async markAsRead(id: string) {
    const messageId = cleanString(id);
    if (!messageId) {
      throw new Error('Communication id is required.');
    }

    try {
      await updateDoc(doc(this.inboxCol, messageId), {
        status: 'read',
        readAt: serverTimestamp(),
        updatedAtServer: serverTimestamp(),
      });
    } catch (error) {
      if (!isNotFoundError(error)) {
        handleFirestoreError(
          error,
          OperationType.UPDATE,
          `${COLLECTIONS.inbox}/${messageId}`
        );
      }
    }

    try {
      await updateDoc(doc(this.internalCol, messageId), {
        read: true,
        updatedAtServer: serverTimestamp(),
      });
    } catch (error) {
      if (!isNotFoundError(error)) {
        handleFirestoreError(
          error,
          OperationType.UPDATE,
          `${COLLECTIONS.internalCommunications}/${messageId}`
        );
      }
    }
  }

  async dismiss(id: string) {
    const messageId = cleanString(id);
    if (!messageId) {
      throw new Error('Communication id is required.');
    }

    try {
      await updateDoc(doc(this.inboxCol, messageId), {
        status: 'archived',
        archivedAt: serverTimestamp(),
        updatedAtServer: serverTimestamp(),
      });
    } catch (error) {
      if (!isNotFoundError(error)) {
        handleFirestoreError(
          error,
          OperationType.UPDATE,
          `${COLLECTIONS.inbox}/${messageId}`
        );
      }
    }

    try {
      await updateDoc(doc(this.internalCol, messageId), {
        dismissed: true,
        updatedAtServer: serverTimestamp(),
      });
    } catch (error) {
      if (!isNotFoundError(error)) {
        handleFirestoreError(
          error,
          OperationType.UPDATE,
          `${COLLECTIONS.internalCommunications}/${messageId}`
        );
      }
    }
  }

  async markAdminAsRead(id: string) {
    const messageId = cleanString(id);
    if (!messageId) {
      throw new Error('Communication id is required.');
    }

    try {
      await updateDoc(doc(this.adminInboxCol, messageId), {
        status: 'read',
        readAt: serverTimestamp(),
        updatedAtServer: serverTimestamp(),
      });
    } catch (error) {
      if (!isNotFoundError(error)) {
        handleFirestoreError(
          error,
          OperationType.UPDATE,
          `${COLLECTIONS.adminInbox}/${messageId}`
        );
      }
    }
  }

  async dismissAdmin(id: string) {
    const messageId = cleanString(id);
    if (!messageId) {
      throw new Error('Communication id is required.');
    }

    try {
      await updateDoc(doc(this.adminInboxCol, messageId), {
        status: 'archived',
        archivedAt: serverTimestamp(),
        updatedAtServer: serverTimestamp(),
      });
    } catch (error) {
      if (!isNotFoundError(error)) {
        handleFirestoreError(
          error,
          OperationType.UPDATE,
          `${COLLECTIONS.adminInbox}/${messageId}`
        );
      }
    }

    try {
      await updateDoc(doc(this.internalCol, messageId), {
        dismissed: true,
        updatedAtServer: serverTimestamp(),
      });
    } catch (error) {
      if (!isNotFoundError(error)) {
        handleFirestoreError(
          error,
          OperationType.UPDATE,
          `${COLLECTIONS.internalCommunications}/${messageId}`
        );
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Chat with Admin
  // ---------------------------------------------------------------------------

  /**
   * Admin chat remains separate from general internal messages because
   * it is conversational and chronological by nature.
   */
  async sendChatMessage(userId: string, message: string, senderRole: 'user' | 'admin') {
    const cleanUserId = cleanString(userId);
    const cleanMessage = cleanString(message);

    if (!cleanUserId) {
      throw new Error('Chat recipient userId is required.');
    }

    if (!cleanMessage) {
      throw new Error('Chat message is required.');
    }

    try {
      const docRef = await addDoc(this.chatCol, {
        userId: cleanUserId,
        senderId: auth.currentUser?.uid || 'system',
        senderRole,
        message: cleanMessage,
        read: false,
        timestamp: new Date().toISOString(),
        timestampServer: serverTimestamp(),
      });

      return docRef.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, COLLECTIONS.adminChatMessages);
    }
  }

  subscribeToChat(
    userId: string,
    callback: (messages: any[]) => void,
    errorCallback?: (error: any) => void
  ) {
    const cleanUserId = cleanString(userId);
    if (!cleanUserId) {
      throw new Error('userId is required for chat subscription.');
    }

    const q = query(
      this.chatCol,
      where('userId', '==', cleanUserId),
      orderBy('timestamp', 'asc')
    );

    return onSnapshot(
      q,
      (snapshot) => {
        const messages = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        }));
        callback(messages);
      },
      (error) => {
        console.error('Firestore Error in subscribeToChat:', error);
        if (errorCallback) errorCallback(error);
      }
    );
  }

  async markChatMessageAsRead(messageId: string) {
    const cleanMessageId = cleanString(messageId);
    if (!cleanMessageId) {
      throw new Error('Chat message id is required.');
    }

    try {
      await updateDoc(doc(this.chatCol, cleanMessageId), {
        read: true,
        updatedAtServer: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.UPDATE,
        `${COLLECTIONS.adminChatMessages}/${cleanMessageId}`
      );
    }
  }
}

export const communicationService = new CommunicationService();