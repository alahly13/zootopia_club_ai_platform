/*
 * Copyright (c) Elmahdy Abdallah Youssef. All rights reserved.
 * Developed by Elmahdy Abdallah Youssef, Software Developer.
 * Class of 2022, Faculty of Science, Cairo University, Zoology Department.
 */

import { auth } from '../firebase';
import { cleanString, normalizeRecipientEmails, safeParseJson } from '../utils/validators';

type EmailDispatchPayload = {
  templateId?: string;
  recipientEmails: string[];
  subject?: string;
  body?: string;
  dynamicData?: Record<string, unknown>;
  purpose: string;
};

type EmailDispatchResult = {
  success: boolean;
  message?: string;
  attempted?: number;
  sent?: number;
  failed?: number;
  failedRecipients?: string[];
};

class EmailDeliveryService {
  /**
   * Unified frontend email dispatch method.
   *
   * Important architectural rule:
   * - This service only forwards validated email dispatch payloads
   *   to the backend unified email endpoint.
   * - Template rendering, delivery logging, and provider-specific
   *   mail behavior remain backend responsibilities.
   */
  async sendEmail(data: EmailDispatchPayload): Promise<EmailDispatchResult> {
    const recipientEmails = normalizeRecipientEmails(data.recipientEmails);
    const templateId = cleanString(data.templateId);
    const subject = cleanString(data.subject);
    const body = cleanString(data.body);
    const purpose = cleanString(data.purpose);

    // -----------------------------
    // Frontend validation
    // -----------------------------
    if (!purpose) {
      throw new Error('Email purpose is required.');
    }

    if (recipientEmails.length === 0) {
      throw new Error('At least one recipient email is required.');
    }

    // Either a templateId OR a raw body should be present.
    if (!templateId && !body) {
      throw new Error('Either templateId or email body is required.');
    }

    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) {
      throw new Error('Not authenticated');
    }

    const payload: EmailDispatchPayload = {
      templateId: templateId || undefined,
      recipientEmails,
      subject: subject || undefined,
      body: body || undefined,
      dynamicData: data.dynamicData || {},
      purpose,
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
      throw new Error(
        result?.error ||
          result?.message ||
          'Failed to send email'
      );
    }

    return {
      success: true,
      message: result?.message || 'Email dispatched successfully.',
      attempted: result?.attempted,
      sent: result?.sent,
      failed: result?.failed,
      failedRecipients: result?.failedRecipients || [],
    };
  }
}

export const emailDeliveryService = new EmailDeliveryService();