import { collection, query, orderBy, getDocs, addDoc, updateDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';

export interface CommunicationTemplate {
  id: string;
  name: string;
  system: 'internal' | 'email';
  type: 'email' | 'message' | 'notification' | 'popup' | 'toast';
  purpose: string;
  subject?: string;
  body: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

class CommunicationTemplatesService {
  private templatesCol = collection(db, 'email_templates');

  async getTemplates(system?: 'internal' | 'email') {
    let q = query(this.templatesCol, orderBy('updatedAt', 'desc'));
    // Note: Filtering by system might need a field update if not present
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CommunicationTemplate));
  }

  async saveTemplate(template: Partial<CommunicationTemplate>) {
    const now = new Date().toISOString();
    if (template.id) {
      const { id, ...data } = template;
      await updateDoc(doc(this.templatesCol, id), { ...data, updatedAt: now });
      return id;
    } else {
      const docRef = await addDoc(this.templatesCol, {
        ...template,
        isActive: true,
        createdAt: now,
        updatedAt: now
      });
      return docRef.id;
    }
  }
}

export const communicationTemplatesService = new CommunicationTemplatesService();
