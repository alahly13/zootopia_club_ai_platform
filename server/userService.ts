/*
 * Copyright (c) Elmahdy Abdallah Youssef. All rights reserved.
 * Developed by Elmahdy Abdallah Youssef, Software Developer.
 * Class of 2022, Faculty of Science, Cairo University, Zoology Department.
 */

import { Firestore } from "firebase-admin/firestore";
import { logDiagnostic, normalizeError } from './diagnostics';

export class UserService {
  private db: Firestore;

  constructor(db: Firestore) {
    this.db = db;
  }

  async grantCredits(userId: string, amount: number): Promise<void> {
    const safeUserId = (userId || '').trim();
    const safeAmount = Number(amount);

    if (!safeUserId) {
      throw new Error('User ID is required');
    }
    if (!Number.isFinite(safeAmount) || safeAmount <= 0) {
      throw new Error('Amount must be a positive number');
    }

    const userRef = this.db.collection('users').doc(safeUserId);
    
    try {
      await this.db.runTransaction(async (transaction) => {
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists) {
          throw new Error("User not found");
        }

        const userData = userDoc.data()!;
        const currentCredits = Number(userData.credits || 0);

        transaction.update(userRef, {
          credits: currentCredits + safeAmount,
          updatedAt: new Date().toISOString(),
        });

        const activityRef = this.db.collection('activities').doc();
        transaction.set(activityRef, {
          userId: safeUserId,
          type: 'credit_grant',
          description: `Granted ${safeAmount} credits for secret unlock`,
          timestamp: new Date().toISOString()
        });
      });

      logDiagnostic('info', 'user.credits_granted', {
        area: 'user',
        stage: 'grantCredits',
        userId: safeUserId,
        details: { amount: safeAmount },
      });
    } catch (error) {
      logDiagnostic('error', 'user.credits_grant_failed', {
        area: 'user',
        stage: 'grantCredits',
        userId: safeUserId,
        details: { amount: safeAmount, ...normalizeError(error) },
      });
      throw error;
    }
  }
}
