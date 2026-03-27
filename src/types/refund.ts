/**
 * Zootopia Club Refund Types
 * (c) 2026 Zootopia Club
 */

export type RefundStatus = 
  | 'refundable'
  | 'refund_requested'
  | 'refund_processing'
  | 'refunded'
  | 'refund_failed'
  | 'refund_rejected'
  | 'non_refundable';

export interface Refund {
  id: string; // Internal refund ID
  transactionId: string; // Reference to original transaction (sessionId in transactions collection)
  providerRefundId?: string; // Paymob's refund ID
  userId: string;
  amount: number;
  currency: string;
  status: RefundStatus;
  reason: string;
  createdAt: string;
  updatedAt: string;
  metadata?: any;
}
