import { db } from '../firebase';
import { collection, addDoc, query, where, orderBy, onSnapshot, updateDoc, doc, serverTimestamp, getDocs } from 'firebase/firestore';
import { InboxMessage, InboxType } from '../types/inbox';

class InboxService {
  private inboxCol = collection(db, 'inbox');
  private adminInboxCol = collection(db, 'admin_inbox');

  async sendMessage(message: Omit<InboxMessage, 'id' | 'status' | 'createdAt' | 'readAt' | 'archivedAt'>, inboxType: InboxType = 'user') {
    const col = inboxType === 'admin' ? this.adminInboxCol : this.inboxCol;
    return await addDoc(col, {
      ...message,
      status: 'unread',
      createdAt: serverTimestamp()
    });
  }

  subscribeToInbox(userId: string, callback: (messages: InboxMessage[]) => void, inboxType: InboxType = 'user') {
    const col = inboxType === 'admin' ? this.adminInboxCol : this.inboxCol;
    let q;
    if (inboxType === 'admin') {
      q = query(col, orderBy('createdAt', 'desc'));
    } else {
      q = query(
        col,
        where('recipientUserId', '==', userId),
        orderBy('createdAt', 'desc')
      );
    }
    return onSnapshot(q, (snapshot) => {
      const messages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as InboxMessage));
      callback(messages);
    });
  }

  async markAsRead(messageId: string, inboxType: InboxType = 'user') {
    const col = inboxType === 'admin' ? this.adminInboxCol : this.inboxCol;
    await updateDoc(doc(col, messageId), { status: 'read', readAt: serverTimestamp() });
  }

  async archiveMessage(messageId: string, inboxType: InboxType = 'user') {
    const col = inboxType === 'admin' ? this.adminInboxCol : this.inboxCol;
    await updateDoc(doc(col, messageId), { status: 'archived', archivedAt: serverTimestamp() });
  }
}

export const inboxService = new InboxService();
