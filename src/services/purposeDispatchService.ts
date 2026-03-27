/*
 * Copyright (c) Elmahdy Abdallah Youssef. All rights reserved.
 * Developed by Elmahdy Abdallah Youssef, Software Developer.
 * Class of 2022, Faculty of Science, Cairo University, Zoology Department.
 */

import { emailDeliveryService } from './emailDeliveryService';
import { Purpose } from '../types/communication';
import { auth } from '../firebase';
import { cleanString, safeParseJson } from '../utils/validators';

type DeliveryChannel = 'internal' | 'email' | 'both';
type MessageType = 'message' | 'notification' | 'popup' | 'toast';

type DispatchInput = {
  userId: string;
  purpose: Purpose;
  title: string;
  message: string;
  code?: string;
  email?: string;
  channel?: DeliveryChannel;
  type?: MessageType;
  notes?: string;
};

type DispatchStepResult = {
  channel: 'internal' | 'email';
  success: boolean;
  error?: string;
};

type DispatchResult = {
  success: boolean;
  requestedChannel: DeliveryChannel;
  executedChannels: ('internal' | 'email')[];
  results: DispatchStepResult[];
};

/**
 * Some purposes require codes to be delivered and later verified against
 * backend-issued records. We keep this helper local and lightweight so
 * future builders can extend it without changing the public service contract.
 */
const PURPOSES_REQUIRING_CODE: Purpose[] = [
  'gift-code',
  'secrets-access',
  'model-unlock',
  'tool-unlock',
  'chat-unlock',
];

/**
 * Validate delivery channel values while preserving backward compatibility.
 */
function normalizeChannel(channel?: DeliveryChannel): DeliveryChannel {
  if (channel === 'internal' || channel === 'email' || channel === 'both') {
    return channel;
  }
  return 'both';
}

/**
 * Validate message type values while preserving backward compatibility.
 */
function normalizeMessageType(type?: MessageType): MessageType {
  if (type === 'message' || type === 'notification' || type === 'popup' || type === 'toast') {
    return type;
  }
  return 'message';
}

function purposeRequiresCode(purpose: Purpose): boolean {
  return PURPOSES_REQUIRING_CODE.includes(purpose);
}

/**
 * Frontend-side validation before dispatch.
 * This does NOT replace backend validation.
 * It only prevents obviously broken requests from being sent.
 */
function validateDispatchInput(data: DispatchInput, channel: DeliveryChannel) {
  const userId = cleanString(data.userId);
  const title = cleanString(data.title);
  const message = cleanString(data.message);
  const email = cleanString(data.email);
  const code = cleanString(data.code);

  if (!userId) {
    throw new Error('Recipient user ID is required.');
  }

  if (!title) {
    throw new Error('Message title is required.');
  }

  if (!message) {
    throw new Error('Message body is required.');
  }

  if ((channel === 'email' || channel === 'both') && !email) {
    throw new Error('Recipient email is required for email delivery.');
  }

  if (purposeRequiresCode(data.purpose) && !code) {
    throw new Error('This purpose requires a code before dispatch.');
  }
}

/**
 * Dedicated method for internal communication dispatch.
 * Kept separate so future builders can extend internal-only metadata
 * without disturbing email delivery behavior.
 */
async function dispatchInternalMessage(params: {
  idToken: string;
  userId: string;
  type: MessageType;
  purpose: Purpose;
  title: string;
  message: string;
  code?: string;
  notes?: string;
}): Promise<void> {
  const res = await fetch('/api/admin/communications/internal', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.idToken}`,
    },
    body: JSON.stringify({
      userId: params.userId,
      type: params.type,
      purpose: params.purpose,
      title: params.title,
      message: params.message,
      code: params.code,
      notes: params.notes,
    }),
  });

  if (!res.ok) {
    let errorMessage = 'Failed to dispatch internal message';
    const err = await safeParseJson<{ error?: string }>(res);
    errorMessage = err?.error || errorMessage;
    throw new Error(errorMessage);
  }
}

/**
 * Dedicated method for email dispatch.
 * Kept separate so future builders can extend template injection,
 * attachments, delivery tracking, and email-only metadata safely.
 */
async function dispatchEmailMessage(params: {
  email: string;
  title: string;
  message: string;
  purpose: Purpose;
}): Promise<void> {
  await emailDeliveryService.sendEmail({
    recipientEmails: [params.email],
    subject: params.title,
    body: params.message,
    purpose: params.purpose,
  });
}

class PurposeDispatchService {
  /**
   * Unified dispatch entry point.
   *
   * Important architectural rule:
   * - This service coordinates channels.
   * - It does not generate codes.
   * - It does not decide business approval.
   * - It only validates payload shape and dispatches through the requested channels.
   *
   * This separation is intentional and should be preserved by future builders.
   */
  async dispatch(data: DispatchInput): Promise<DispatchResult> {
    const channel = normalizeChannel(data.channel);
    const type = normalizeMessageType(data.type);

    const normalizedData = {
      ...data,
      userId: cleanString(data.userId),
      title: cleanString(data.title),
      message: cleanString(data.message),
      email: cleanString(data.email),
      code: cleanString(data.code),
      notes: cleanString(data.notes),
    };

    validateDispatchInput(normalizedData, channel);

    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) {
      throw new Error('Not authenticated');
    }

    const results: DispatchStepResult[] = [];
    const executedChannels: ('internal' | 'email')[] = [];

    // Internal delivery path
    if (channel === 'internal' || channel === 'both') {
      try {
        await dispatchInternalMessage({
          idToken,
          userId: normalizedData.userId,
          type,
          purpose: normalizedData.purpose,
          title: normalizedData.title,
          message: normalizedData.message,
          code: normalizedData.code || undefined,
          notes: normalizedData.notes || undefined,
        });

        results.push({
          channel: 'internal',
          success: true,
        });
        executedChannels.push('internal');
      } catch (error: any) {
        results.push({
          channel: 'internal',
          success: false,
          error: error?.message || 'Internal dispatch failed',
        });

        // If the admin explicitly requested internal-only, fail immediately.
        if (channel === 'internal') {
          throw new Error(error?.message || 'Failed to dispatch internal message');
        }
      }
    }

    // Email delivery path
    if (channel === 'email' || channel === 'both') {
      try {
        await dispatchEmailMessage({
          email: normalizedData.email!,
          title: normalizedData.title,
          message: normalizedData.message,
          purpose: normalizedData.purpose,
        });

        results.push({
          channel: 'email',
          success: true,
        });
        executedChannels.push('email');
      } catch (error: any) {
        results.push({
          channel: 'email',
          success: false,
          error: error?.message || 'Email dispatch failed',
        });

        // If the admin explicitly requested email-only, fail immediately.
        if (channel === 'email') {
          throw new Error(error?.message || 'Failed to dispatch email message');
        }
      }
    }

    const hasSuccess = results.some((r) => r.success);
    const hasFailure = results.some((r) => !r.success);

    // If both were attempted and both failed, surface a combined error.
    if (!hasSuccess && hasFailure) {
      const combined = results
        .filter((r) => r.error)
        .map((r) => `${r.channel}: ${r.error}`)
        .join(' | ');

      throw new Error(combined || 'Dispatch failed for all channels');
    }

    return {
      success: hasSuccess,
      requestedChannel: channel,
      executedChannels,
      results,
    };
  }
}

export const purposeDispatchService = new PurposeDispatchService();