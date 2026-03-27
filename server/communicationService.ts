/*
 * Copyright (c) Elmahdy Abdallah Youssef. All rights reserved.
 * Developed by Elmahdy Abdallah Youssef, Software Developer.
 * Class of 2022, Faculty of Science, Cairo University, Zoology Department.
 */

import { Firestore } from "firebase-admin/firestore";
import nodemailer from "nodemailer";
import Handlebars from "handlebars";
import { logDiagnostic, normalizeError } from './diagnostics';

// Centralized collection names for the communication service
const COLLECTIONS = {
  INBOX: 'inbox',
  ADMIN_INBOX: 'admin_inbox',
  INTERNAL_COMMUNICATION_LOGS: 'internal_communication_logs',
  EMAIL_DELIVERY_LOGS: 'email_delivery_logs',
  EMAIL_TEMPLATES: 'email_templates',
} as const;

export class CommunicationService {
  private db: Firestore;
  private transporter: nodemailer.Transporter;

  constructor(db: Firestore, transporter: nodemailer.Transporter) {
    this.db = db;
    this.transporter = transporter;
  }

  private async resolveTemplateByType(templateType: string): Promise<{ id: string; subject: string; htmlContent: string } | null> {
    const normalizedType = String(templateType || '').trim();
    if (!normalizedType) return null;

    const snapshot = await this.db
      .collection(COLLECTIONS.EMAIL_TEMPLATES)
      .where('type', '==', normalizedType)
      .limit(10)
      .get();

    if (snapshot.empty) return null;

    const docs = snapshot.docs
      .map((doc) => ({ id: doc.id, ...(doc.data() as any) }))
      .filter((doc) => !!doc.subject && !!doc.htmlContent)
      .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));

    if (!docs.length) return null;

    return {
      id: docs[0].id,
      subject: String(docs[0].subject || ''),
      htmlContent: String(docs[0].htmlContent || ''),
    };
  }

  /**
   * Template-driven transactional email helper.
   *
   * Responsibility boundary:
   * - Callers (billing/refund/services) decide WHEN to notify and pass safe variables.
   * - CommunicationService resolves/compiles templates and handles channel delivery.
   */
  async dispatchEmailFromTemplate(data: {
    recipientEmails: string[];
    templateType: string;
    dynamicData: Record<string, unknown>;
    fallbackSubject: string;
    fallbackHtml: string;
    purpose: string;
    notes?: string;
  }) {
    let subject = data.fallbackSubject;
    let body = data.fallbackHtml;
    let resolvedTemplateId: string | undefined;

    try {
      const template = await this.resolveTemplateByType(data.templateType);
      if (template) {
        const subjectTemplate = Handlebars.compile(template.subject);
        const bodyTemplate = Handlebars.compile(template.htmlContent);
        subject = subjectTemplate(data.dynamicData || {});
        body = bodyTemplate(data.dynamicData || {});
        resolvedTemplateId = template.id;
      }
    } catch (templateError) {
      logDiagnostic('warn', 'communication.email_template_render_failed', {
        area: 'communication',
        stage: 'dispatchEmailFromTemplate',
        details: {
          templateType: data.templateType,
          ...normalizeError(templateError),
        },
      });
    }

    return this.dispatchEmail({
      recipientEmails: data.recipientEmails,
      subject,
      body,
      purpose: data.purpose,
      templateId: resolvedTemplateId,
      notes: data.notes,
    });
  }

  /**
   * Dispatches an internal message to a user's or admin's inbox.
   * Uses a Firestore writeBatch to ensure the message and its delivery log are committed atomically.
   * Future-ready: Supports extended metadata for rich UI rendering (icons, CTAs, visuals).
   */
  async dispatchInternalMessage(data: {
    userId: string;
    type: 'message' | 'notification' | 'popup' | 'toast';
    purpose: string;
    title: string;
    message: string;
    code?: string;
    notes?: string;
    inboxType?: 'user' | 'admin';
    // Future-ready metadata fields
    templateId?: string;
    codeId?: string;
    deliveryChannel?: string;
    issuedByAdminId?: string;
    priority?: 'low' | 'normal' | 'high' | 'urgent';
    expiresAt?: string;
    icon?: string;
    giftVisual?: string;
    ctaLabel?: string;
    ctaAction?: string;
    uiPayload?: Record<string, any>;
  }) {
    // 1. Input Validation
    const userId = data.userId?.trim();
    const type = data.type?.trim();
    const purpose = data.purpose?.trim();
    const title = data.title?.trim();
    const message = data.message?.trim();

    if (!userId) throw new Error("userId is required and cannot be empty.");
    if (!type) throw new Error("type is required and cannot be empty.");
    if (!purpose) throw new Error("purpose is required and cannot be empty.");
    if (!title) throw new Error("title is required and cannot be empty.");
    if (!message) throw new Error("message is required and cannot be empty.");

    const now = new Date().toISOString();
    
    // Determine the correct inbox collection based on the target recipient type.
    // This separates admin alerts from normal user notifications.
    const collectionName = data.inboxType === 'admin' ? COLLECTIONS.ADMIN_INBOX : COLLECTIONS.INBOX;
    
    // 2. Prepare the batch
    const batch = this.db.batch();

    // 3. Prepare Message Document
    const messageRef = this.db.collection(collectionName).doc();
    
    // Construct metadata payload, omitting undefined values to keep Firestore documents clean
    const metadata: Record<string, any> = {
      notes: data.notes?.trim() || '',
    };
    if (data.templateId) metadata.templateId = data.templateId;
    if (data.codeId) metadata.codeId = data.codeId;
    if (data.deliveryChannel) metadata.deliveryChannel = data.deliveryChannel;
    if (data.issuedByAdminId) metadata.issuedByAdminId = data.issuedByAdminId;
    if (data.priority) metadata.priority = data.priority;
    if (data.expiresAt) metadata.expiresAt = data.expiresAt;
    if (data.icon) metadata.icon = data.icon;
    if (data.giftVisual) metadata.giftVisual = data.giftVisual;
    if (data.ctaLabel) metadata.ctaLabel = data.ctaLabel;
    if (data.ctaAction) metadata.ctaAction = data.ctaAction;
    if (data.uiPayload) metadata.uiPayload = data.uiPayload;

    batch.set(messageRef, {
      recipientUserId: userId,
      senderId: 'system',
      senderType: 'system',
      inboxType: data.inboxType || 'user',
      messageType: type,
      purpose: purpose,
      subject: title,
      body: message,
      codeValue: data.code || null,
      status: 'unread',
      createdAt: now,
      metadata
    });

    // 4. Prepare Log Document
    // Logging is crucial for audit trails and debugging delivery issues.
    const logRef = this.db.collection(COLLECTIONS.INTERNAL_COMMUNICATION_LOGS).doc();
    batch.set(logRef, {
      system: 'internal',
      type: type,
      purpose: purpose,
      senderId: 'system',
      recipientId: userId,
      messageId: messageRef.id,
      status: 'sent',
      sentAt: now,
      notes: data.notes?.trim() || ''
    });

    // 5. Commit Batch
    // Ensures we don't end up with a message but no log, or vice-versa.
    try {
      await batch.commit();
    } catch (error) {
      logDiagnostic('error', 'communication.internal_dispatch_failed', {
        area: 'communication',
        stage: 'dispatchInternalMessage',
        userId,
        details: normalizeError(error),
      });
      throw error;
    }

    logDiagnostic('info', 'communication.internal_dispatch_sent', {
      area: 'communication',
      stage: 'dispatchInternalMessage',
      userId,
      details: { purpose, type, inboxType: data.inboxType || 'user' },
    });

    return messageRef.id;
  }

  /**
   * Dispatches an email to one or more recipients.
   * Processes recipients individually to ensure partial failures don't block the entire batch.
   * Logs the outcome (success or failure) for each recipient.
   */
  async dispatchEmail(data: {
    recipientEmails: string[];
    subject: string;
    body: string;
    purpose: string;
    templateId?: string;
    notes?: string;
  }) {
    // 1. Input Validation
    if (!data.recipientEmails || !Array.isArray(data.recipientEmails) || data.recipientEmails.length === 0) {
      throw new Error("recipientEmails must be a non-empty array.");
    }

    const subject = data.subject?.trim();
    const body = data.body?.trim();
    const purpose = data.purpose?.trim();

    if (!subject) throw new Error("subject is required and cannot be empty.");
    if (!body) throw new Error("body is required and cannot be empty.");
    if (!purpose) throw new Error("purpose is required and cannot be empty.");

    // Clean and validate email addresses
    const validEmails = data.recipientEmails
      .map(e => e?.trim())
      .filter(e => e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));

    if (validEmails.length === 0) {
      throw new Error("No valid email addresses provided in recipientEmails.");
    }

    const summary = {
      totalAttempted: validEmails.length,
      totalSent: 0,
      totalFailed: 0,
      failedRecipients: [] as { email: string; reason: string }[]
    };

    // 2. Dispatch Loop
    // We process emails one by one. If one fails (e.g., invalid address, bounce),
    // we catch the error, log it as failed, and continue to the next recipient.
    for (const email of validEmails) {
      const now = new Date().toISOString();
      let deliveryStatus = 'sent';
      let failureReason = '';

      try {
        // Note: Admin self-testing works cleanly here as long as the admin's email is in the array.
        await this.transporter.sendMail({
          from: process.env.EMAIL_FROM || `"Zootopia Club" <${process.env.EMAIL_USER}>`,
          to: email,
          subject: subject,
          html: body,
        });
        summary.totalSent++;
      } catch (error: any) {
        deliveryStatus = 'failed';
        failureReason = error.message || 'Unknown error';
        summary.totalFailed++;
        summary.failedRecipients.push({ email, reason: failureReason });
        logDiagnostic('warn', 'communication.email_send_failed', {
          area: 'communication',
          stage: 'dispatchEmail',
          details: { email, ...normalizeError(error) },
        });
      }

      // 3. Log Delivery Attempt
      // We log regardless of success or failure to maintain a complete audit trail.
      try {
        await this.db.collection(COLLECTIONS.EMAIL_DELIVERY_LOGS).add({
          recipientEmail: email,
          subject: subject,
          status: deliveryStatus,
          sentAt: now,
          purpose: purpose,
          templateId: data.templateId || null,
          failureReason: failureReason || null,
          notes: data.notes?.trim() || ''
        });
      } catch (logError) {
        logDiagnostic('warn', 'communication.email_log_failed', {
          area: 'communication',
          stage: 'dispatchEmail',
          details: { email, ...normalizeError(logError) },
        });
        // We don't throw here to avoid interrupting the email loop if logging fails
      }
    }

    logDiagnostic('info', 'communication.email_dispatch_completed', {
      area: 'communication',
      stage: 'dispatchEmail',
      details: summary,
    });

    return summary;
  }
}
