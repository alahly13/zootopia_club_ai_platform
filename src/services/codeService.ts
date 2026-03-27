import { db } from '../firebase';
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  getDocs, 
  updateDoc, 
  doc, 
  serverTimestamp, 
  Timestamp 
} from 'firebase/firestore';
import { IssuedCode } from '../types/code';

class CodeService {
  private codesCol = collection(db, 'issuedCodes');

  async issueCode(codeData: Omit<IssuedCode, 'id' | 'issuedAt' | 'currentUses' | 'status'>) {
    const now = new Date().toISOString();
    const docRef = await addDoc(this.codesCol, {
      ...codeData,
      issuedAt: now,
      currentUses: 0,
      status: 'active',
      createdAt: serverTimestamp()
    });
    return docRef.id;
  }

  async verifyCode(codeValue: string, userId: string, userEmail: string, purpose: string) {
    const q = query(this.codesCol, where('codeValue', '==', codeValue));
    const snapshot = await getDocs(q);

    if (snapshot.empty) throw new Error('code-not-found');
    
    const codeDoc = snapshot.docs[0];
    const code = { id: codeDoc.id, ...codeDoc.data() } as IssuedCode;

    // Verification Logic
    if (code.status !== 'active') throw new Error(`${code.status}-code`);
    if (code.expiresAt && new Date(code.expiresAt) < new Date()) throw new Error('expired');
    if (code.purpose !== purpose) throw new Error('wrong-purpose');
    
    // Recipient Ownership
    if (code.recipientUserId && code.recipientUserId !== userId) throw new Error('wrong-recipient');
    if (code.recipientEmail && code.recipientEmail !== userEmail) throw new Error('wrong-recipient');
    
    // Usage Limits
    if (code.codeType === 'singleUse' && code.currentUses >= 1) throw new Error('already-used');
    if (code.codeType === 'limitedUse' && code.maxUses && code.currentUses >= code.maxUses) throw new Error('usage-limit-reached');

    return code;
  }

  async redeemCode(codeId: string, userId: string) {
    const codeRef = doc(this.codesCol, codeId);
    await updateDoc(codeRef, {
      currentUses: 1, // Simplified for now
      status: 'used',
      redemptionTimestamp: serverTimestamp(),
      redeemedBy: userId
    });
  }
}

export const codeService = new CodeService();
