/*
 * Copyright (c) Elmahdy Abdallah Youssef. All rights reserved.
 * Developed by Elmahdy Abdallah Youssef, Software Developer.
 * Class of 2022, Faculty of Science, Cairo University, Zoology Department.
 */

import { Firestore, Timestamp } from 'firebase-admin/firestore';
import { IssuedCode, CodeStatus } from '../src/types/code';
import { logDiagnostic, normalizeError } from './diagnostics';

const ISSUED_CODES_COLLECTION = 'issuedCodes';

const normalizeRequired = (value: string, field: string): string => {
  const normalized = (value || '').trim();
  if (!normalized) throw new Error(`${field} is required`);
  return normalized;
};

const normalizeEmail = (value: string): string => (value || '').trim().toLowerCase();

const isExpired = (expiresAt?: string): boolean => {
  if (!expiresAt) return false;
  const expiresAtMs = new Date(expiresAt).getTime();
  if (Number.isNaN(expiresAtMs)) return false;
  return expiresAtMs < Date.now();
};

export class CodeService {
  private db: Firestore;

  constructor(db: Firestore) {
    this.db = db;
  }

  async issueCode(codeData: Omit<IssuedCode, 'id' | 'createdAt' | 'updatedAt' | 'currentUses' | 'redemptionCount' | 'redeemed' | 'status'>) {
    const normalizedCodeValue = normalizeRequired(codeData?.codeValue || '', 'codeValue');
    const normalizedPurpose = normalizeRequired(codeData?.purpose || '', 'purpose');
    const normalizedRecipientEmail = codeData?.recipientEmail ? normalizeEmail(codeData.recipientEmail) : undefined;

    if (codeData?.maxUses !== undefined && codeData.maxUses <= 0) {
      throw new Error('maxUses must be greater than 0');
    }

    if (codeData?.expiresAt) {
      const expiresAtMs = new Date(codeData.expiresAt).getTime();
      if (Number.isNaN(expiresAtMs)) {
        throw new Error('expiresAt is invalid');
      }
    }

    const codeRef = this.db.collection(ISSUED_CODES_COLLECTION).doc();
    const now = new Date().toISOString();
    
    const newCode: Omit<IssuedCode, 'id'> = {
      ...codeData,
      codeValue: normalizedCodeValue,
      purpose: normalizedPurpose,
      recipientEmail: normalizedRecipientEmail,
      createdAt: now,
      updatedAt: now,
      issuedAt: now,
      currentUses: 0,
      redemptionCount: 0,
      redeemed: false,
      status: 'draft'
    };

    try {
      await codeRef.set({
        ...newCode,
        createdAt: Timestamp.fromDate(new Date(now)),
        updatedAt: Timestamp.fromDate(new Date(now))
      });
    } catch (error) {
      logDiagnostic('error', 'codes.issue_failed', {
        area: 'codes',
        stage: 'issueCode',
        details: normalizeError(error),
      });
      throw error;
    }
    
    return codeRef.id;
  }

  async verifyAndRedeem(codeValue: string, userId: string, userEmail: string, purpose: string) {
    const normalizedCode = normalizeRequired(codeValue, 'codeValue');
    const normalizedPurpose = normalizeRequired(purpose, 'purpose');
    const normalizedUserId = normalizeRequired(userId, 'userId');
    const normalizedUserEmail = normalizeEmail(userEmail);

    try {
      return await this.db.runTransaction(async (tx) => {
        const codesRef = this.db.collection(ISSUED_CODES_COLLECTION);
        const snapshot = await tx.get(codesRef.where('codeValue', '==', normalizedCode).limit(1));

        if (snapshot.empty) throw new Error('code-not-found');

        const codeDoc = snapshot.docs[0];
        const code = { id: codeDoc.id, ...codeDoc.data() } as IssuedCode;

        if (code.status !== 'active') throw new Error(`code-status-${code.status}`);
        if (!code.neverExpires && isExpired(code.expiresAt)) {
          tx.update(codeDoc.ref, { status: 'expired', updatedAt: new Date().toISOString() });
          throw new Error('expired');
        }
        if ((code.purpose || '').trim() !== normalizedPurpose) throw new Error('wrong-purpose');

        if (code.recipientUserId && code.recipientUserId !== normalizedUserId) throw new Error('wrong-recipient');
        if (code.recipientEmail && normalizeEmail(code.recipientEmail) !== normalizedUserEmail) throw new Error('wrong-recipient');

        if (code.usageMode === 'single-use' && code.currentUses >= 1) throw new Error('already-used');
        if (code.usageMode === 'limited-use' && code.maxUses && code.currentUses >= code.maxUses) throw new Error('usage-limit-reached');

        const newUses = code.currentUses + 1;
        const isConsumed = code.usageMode === 'single-use' || (code.usageMode === 'limited-use' && newUses >= (code.maxUses || 0));

        tx.update(codeDoc.ref, {
          currentUses: newUses,
          status: isConsumed ? 'consumed' : 'active',
          redeemed: true,
          redeemedAt: new Date().toISOString(),
          redeemedByUserId: normalizedUserId,
          redemptionCount: code.redemptionCount + 1,
          updatedAt: new Date().toISOString()
        });

        return { ...code, currentUses: newUses, status: isConsumed ? 'consumed' : 'active' };
      });
    } catch (error) {
      logDiagnostic('warn', 'codes.redeem_failed', {
        area: 'codes',
        stage: 'verifyAndRedeem',
        userId: normalizedUserId,
        details: { codePrefix: normalizedCode.slice(0, 4), ...normalizeError(error) },
      });
      throw error;
    }
  }

  async updateCodeStatus(codeId: string, status: CodeStatus, adminId: string) {
    const normalizedCodeId = normalizeRequired(codeId, 'codeId');
    const normalizedAdminId = normalizeRequired(adminId, 'adminId');
    const codeRef = this.db.collection(ISSUED_CODES_COLLECTION).doc(normalizedCodeId);
    const updateData: Partial<IssuedCode> = {
      status,
      updatedAt: new Date().toISOString()
    };
    if (status === 'revoked') {
      updateData.revokedAt = new Date().toISOString();
      updateData.revokedBy = normalizedAdminId;
    }
    if (status === 'paused') {
      updateData.pausedAt = new Date().toISOString();
      updateData.pausedBy = normalizedAdminId;
    }
    await codeRef.update(updateData);
  }

  async listCodes() {
    const snapshot = await this.db.collection(ISSUED_CODES_COLLECTION).orderBy('createdAt', 'desc').get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as IssuedCode));
  }
}
