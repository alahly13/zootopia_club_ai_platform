/*
 * Copyright (c) Elmahdy Abdallah Youssef. All rights reserved.
 * Developed by Elmahdy Abdallah Youssef, Software Developer.
 * Class of 2022, Faculty of Science, Cairo University, Zoology Department.
 */

/**
 * Phase 1A Contract Module (Scaffolding Only)
 * ------------------------------------------------------------------
 * This module defines canonical backend contract types and validators for
 * entitlement, codes, credits, and unlock purchase intents.
 *
 * IMPORTANT:
 * - This file is intentionally non-enforcing for existing runtime paths.
 * - Callers may adopt validators incrementally.
 * - Business lock switches must be introduced in later phases.
 */

export const CANONICAL_UNLOCK_PRICE_EGP = 200 as const;

export const CANONICAL_UNLOCK_ELIGIBLE_TOOL_IDS = [
  'infographic',
  'quiz',
  'analyze',
] as const;

export type UnlockEligibleToolId = (typeof CANONICAL_UNLOCK_ELIGIBLE_TOOL_IDS)[number];

export type EntitlementSource = 'admin_code' | 'payment' | 'manual_admin';
export type EntitlementStatus = 'active' | 'revoked' | 'expired';

export interface ToolEntitlementRecord {
  userId: string;
  toolId: UnlockEligibleToolId;
  status: EntitlementStatus;
  source: EntitlementSource;
  grantedAtIso: string;
  expiresAtIso?: string;
  revokedAtIso?: string;
  revokedByAdminId?: string;
  metadata?: Record<string, unknown>;
}

export interface UnlockCodePolicy {
  purpose: 'tool-unlock' | 'gift-code' | 'chat-unlock' | 'model-unlock' | 'secrets-access';
  expiresAtIso?: string;
  neverExpires?: boolean;
  usageMode?: 'single-use' | 'limited-use' | 'unlimited-use';
  maxUses?: number;
}

export interface UnlockPurchaseIntent {
  userId: string;
  toolId: UnlockEligibleToolId;
  amountEgp: number;
  currency: 'EGP';
  provider?: string;
  operationId: string;
}

export interface GiftCodeIssueInput {
  code: string;
  amount: number;
  isActive: boolean;
}

export interface OperationalCreditReceipt {
  userId: string;
  toolId: string;
  operationId: string;
  resultId: string;
  succeeded: boolean;
}

const normalizeRequired = (value: unknown, fieldName: string): string => {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) {
    throw new Error(`${fieldName} is required`);
  }
  return normalized;
};

const normalizeOptional = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized || undefined;
};

const normalizeToolId = (value: unknown): string => {
  return normalizeRequired(value, 'toolId').toLowerCase();
};

export const isUnlockEligibleToolId = (value: unknown): value is UnlockEligibleToolId => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return CANONICAL_UNLOCK_ELIGIBLE_TOOL_IDS.includes(normalized as UnlockEligibleToolId);
};

export const assertUnlockEligibleToolId = (value: unknown): UnlockEligibleToolId => {
  const normalized = normalizeToolId(value);
  if (!isUnlockEligibleToolId(normalized)) {
    throw new Error(`toolId must be one of: ${CANONICAL_UNLOCK_ELIGIBLE_TOOL_IDS.join(', ')}`);
  }
  return normalized;
};

export const validateUnlockPurchaseIntent = (payload: unknown): UnlockPurchaseIntent => {
  const body = (payload || {}) as Record<string, unknown>;
  const userId = normalizeRequired(body.userId, 'userId');
  const toolId = assertUnlockEligibleToolId(body.toolId);
  const operationId = normalizeRequired(body.operationId, 'operationId');

  const amountEgp = Number(body.amountEgp ?? CANONICAL_UNLOCK_PRICE_EGP);
  if (!Number.isFinite(amountEgp) || amountEgp <= 0) {
    throw new Error('amountEgp must be a positive number');
  }

  const currencyRaw = normalizeOptional(body.currency)?.toUpperCase() || 'EGP';
  if (currencyRaw !== 'EGP') {
    throw new Error('currency must be EGP');
  }

  return {
    userId,
    toolId,
    amountEgp,
    currency: 'EGP',
    provider: normalizeOptional(body.provider),
    operationId,
  };
};

export const validateUnlockCodePolicy = (payload: unknown): UnlockCodePolicy => {
  const body = (payload || {}) as Record<string, unknown>;
  const purpose = normalizeRequired(body.purpose, 'purpose') as UnlockCodePolicy['purpose'];

  const allowedPurposes: UnlockCodePolicy['purpose'][] = [
    'tool-unlock',
    'gift-code',
    'chat-unlock',
    'model-unlock',
    'secrets-access',
  ];

  if (!allowedPurposes.includes(purpose)) {
    throw new Error(`purpose must be one of: ${allowedPurposes.join(', ')}`);
  }

  const neverExpires = body.neverExpires === true;
  const expiresAtIso = normalizeOptional(body.expiresAtIso ?? body.expiresAt);

  if (!neverExpires && expiresAtIso) {
    const expiresAtMs = new Date(expiresAtIso).getTime();
    if (Number.isNaN(expiresAtMs)) {
      throw new Error('expiresAtIso must be a valid ISO date');
    }
  }

  const usageMode = normalizeOptional(body.usageMode) as UnlockCodePolicy['usageMode'];
  const maxUsesRaw = body.maxUses;
  let maxUses: number | undefined;

  if (maxUsesRaw !== undefined && maxUsesRaw !== null && maxUsesRaw !== '') {
    const numeric = Number(maxUsesRaw);
    if (!Number.isInteger(numeric) || numeric <= 0) {
      throw new Error('maxUses must be a positive integer');
    }
    maxUses = numeric;
  }

  if (usageMode && !['single-use', 'limited-use', 'unlimited-use'].includes(usageMode)) {
    throw new Error('usageMode must be single-use, limited-use, or unlimited-use');
  }

  if (usageMode === 'limited-use' && !maxUses) {
    throw new Error('maxUses is required when usageMode is limited-use');
  }

  return {
    purpose,
    expiresAtIso,
    neverExpires,
    usageMode,
    maxUses,
  };
};

export const validateGiftCodeIssueInput = (payload: unknown): GiftCodeIssueInput => {
  const body = (payload || {}) as Record<string, unknown>;
  const code = normalizeRequired(body.code, 'code').toUpperCase();
  const amount = Number(body.amount);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('amount must be a positive number');
  }

  return {
    code,
    amount,
    isActive: body.isActive !== false,
  };
};

export const validateOperationalCreditReceipt = (payload: unknown): OperationalCreditReceipt => {
  const body = (payload || {}) as Record<string, unknown>;
  const succeeded = body.succeeded === true;

  return {
    userId: normalizeRequired(body.userId, 'userId'),
    toolId: normalizeRequired(body.toolId, 'toolId').toLowerCase(),
    operationId: normalizeRequired(body.operationId, 'operationId'),
    resultId: normalizeRequired(body.resultId, 'resultId'),
    succeeded,
  };
};

/**
 * Non-blocking compatibility check for existing routes.
 * Returns warnings only, never throws.
 */
export const collectContractWarnings = (input: {
  toolId?: unknown;
  amountEgp?: unknown;
  currency?: unknown;
}): string[] => {
  const warnings: string[] = [];

  if (input.toolId !== undefined && !isUnlockEligibleToolId(input.toolId)) {
    warnings.push('toolId is outside canonical unlock-eligible list');
  }

  if (input.amountEgp !== undefined) {
    const amount = Number(input.amountEgp);
    if (Number.isFinite(amount) && amount !== CANONICAL_UNLOCK_PRICE_EGP) {
      warnings.push('amountEgp differs from canonical unlock price (200 EGP)');
    }
  }

  if (input.currency !== undefined) {
    const c = typeof input.currency === 'string' ? input.currency.trim().toUpperCase() : '';
    if (c && c !== 'EGP') {
      warnings.push('currency differs from canonical unlock currency (EGP)');
    }
  }

  return warnings;
};
