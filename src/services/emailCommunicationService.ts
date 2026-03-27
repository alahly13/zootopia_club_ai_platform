import { 
  collection, 
  addDoc, 
  doc, 
  getDocs, 
  query, 
  orderBy, 
  serverTimestamp
} from 'firebase/firestore';
import { db, auth } from '../firebase';

export interface EmailTemplate {
  id: string;
  name: string;
  purpose: string;
  subject: string;
  body: string;
  placeholders: string[];
  isActive: boolean;
  createdAt: any;
  updatedAt: any;
}

export interface EmailDeliveryLog {
  id: string;
  templateId?: string;
  recipientEmail: string;
  subject: string;
  status: 'sent' | 'failed';
  errorMessage?: string;
  sentAt: any;
}

class EmailCommunicationService {
  private templatesCol = collection(db, 'email_templates');
  private logsCol = collection(db, 'email_delivery_logs');

  async getTemplates() {
    const q = query(this.templatesCol, orderBy('updatedAt', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as EmailTemplate));
  }

  async sendEmail(data: { 
    templateId?: string; 
    recipientEmails: string[]; 
    subject?: string; 
    body?: string; 
    dynamicData?: any;
    purpose: string;
  }) {
    const idToken = await auth.currentUser?.getIdToken();
    const response = await fetch('/api/admin/email/send-unified', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to send email');
    }

    return await response.json();
  }

  async getLogs(limitCount = 50) {
    const q = query(this.logsCol, orderBy('sentAt', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as EmailDeliveryLog));
  }
}

export const emailCommunicationService = new EmailCommunicationService();
