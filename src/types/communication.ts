export type Purpose = 'gift-code' | 'secrets-access' | 'model-unlock' | 'tool-unlock' | 'chat-unlock' | 'manual';

export interface PurposeCommunication {
  purpose: Purpose;
  title: string;
  message: string;
  code?: string;
  ctaLabel?: string;
  ctaLink?: string;
  metadata?: any;
}
