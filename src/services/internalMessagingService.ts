import { collection, addDoc, query, where, orderBy, onSnapshot, updateDoc, doc } from 'firebase/firestore';
import { db, auth } from '../firebase';

export interface InternalCommunication {
  id: string;
  userId: string;
  type: 'message' | 'notification' | 'popup' | 'toast';
  purpose: string;
  title: string;
  message: string;
  code?: string;
  read: boolean;
  dismissed: boolean;
  createdAt: string;
  sentAt: string; // Timestamp field
}

class InternalMessagingService {
  private internalCol = collection(db, 'internal_communications');

  async sendInternal(comm: Omit<InternalCommunication, 'id' | 'createdAt' | 'sentAt' | 'read' | 'dismissed'>) {
    const now = new Date().toISOString();
    const docRef = await addDoc(this.internalCol, {
      ...comm,
      read: false,
      dismissed: false,
      createdAt: now,
      sentAt: now // Added timestamp
    });
    return docRef.id;
  }

  subscribeToUserCommunications(userId: string, callback: (comms: InternalCommunication[]) => void) {
    const q = query(
      this.internalCol, 
      where('userId', '==', userId), 
      where('dismissed', '==', false)
    );
    
    return onSnapshot(q, (snapshot) => {
      const comms = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as InternalCommunication));
      // Sort on client side to avoid requiring a composite index
      comms.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      callback(comms);
    }, (error) => {
      console.error('Firestore Error in subscribeToUserCommunications:', error);
    });
  }

  async markAsRead(id: string) {
    await updateDoc(doc(this.internalCol, id), { read: true });
  }

  async dismiss(id: string) {
    await updateDoc(doc(this.internalCol, id), { dismissed: true });
  }
}

export const internalMessagingService = new InternalMessagingService();
