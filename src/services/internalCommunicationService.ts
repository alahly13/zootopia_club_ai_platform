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
  serverTimestamp
} from 'firebase/firestore';
import { db, auth } from '../firebase';

export type InternalMessageType = 'message' | 'notification' | 'popup' | 'toast';

export interface InternalMessage {
  id: string;
  userId: string;
  type: InternalMessageType;
  purpose: string;
  title: string;
  message: string;
  code?: string;
  ctaLabel?: string;
  ctaLink?: string;
  read: boolean;
  dismissed: boolean;
  createdAt: any; // Firestore Timestamp
  expiresAt?: any;
  metadata?: any;
}

export interface InternalMessageLog {
  id: string;
  type: InternalMessageType;
  purpose: string;
  senderId: string;
  recipientId: string;
  status: string;
  sentAt: any; // Firestore Timestamp
  details?: any;
}

class InternalCommunicationService {
  private internalCol = collection(db, 'internal_communications');
  private logsCol = collection(db, 'internal_communication_logs');

  async sendInternal(comm: Omit<InternalMessage, 'id' | 'createdAt' | 'read' | 'dismissed'>) {
    const docRef = await addDoc(this.internalCol, {
      ...comm,
      read: false,
      dismissed: false,
      createdAt: serverTimestamp()
    });

    await addDoc(this.logsCol, {
      type: comm.type,
      purpose: comm.purpose,
      senderId: auth.currentUser?.uid || 'system',
      recipientId: comm.userId,
      status: 'sent',
      sentAt: serverTimestamp()
    });

    return docRef.id;
  }

  subscribeToUserCommunications(userId: string, callback: (comms: InternalMessage[]) => void) {
    const q = query(
      this.internalCol, 
      where('userId', '==', userId), 
      where('dismissed', '==', false)
    );
    
    return onSnapshot(q, (snapshot) => {
      const comms = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as InternalMessage));
      // Sort on client side to avoid requiring a composite index
      comms.sort((a, b) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt).getTime();
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt).getTime();
        return timeB - timeA;
      });
      callback(comms);
    });
  }

  async markAsRead(id: string) {
    await updateDoc(doc(this.internalCol, id), { read: true });
  }

  async dismiss(id: string) {
    await updateDoc(doc(this.internalCol, id), { dismissed: true });
  }
}

export const internalCommunicationService = new InternalCommunicationService();
