import { collection, addDoc, query, where, orderBy, onSnapshot, updateDoc, doc } from 'firebase/firestore';
import { db, auth } from '../firebase';

class ChatAdminService {
  private chatCol = collection(db, 'admin_chat_messages');

  async sendChatMessage(userId: string, message: string, senderRole: 'user' | 'admin') {
    const now = new Date().toISOString();
    const docRef = await addDoc(this.chatCol, {
      userId,
      senderId: auth.currentUser?.uid,
      senderRole,
      message,
      read: false,
      timestamp: now
    });
    return docRef.id;
  }

  subscribeToChat(userId: string, callback: (messages: any[]) => void) {
    const q = query(
      this.chatCol,
      where('userId', '==', userId),
      orderBy('timestamp', 'asc')
    );

    return onSnapshot(q, (snapshot) => {
      const messages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      callback(messages);
    }, (error) => {
      console.error('Firestore Error in subscribeToChat:', error);
    });
  }

  async markChatMessageAsRead(messageId: string) {
    await updateDoc(doc(this.chatCol, messageId), { read: true });
  }
}

export const chatAdminService = new ChatAdminService();
