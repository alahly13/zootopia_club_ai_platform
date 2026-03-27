import { CommunicationSystem } from '../../services/communicationService';
import { Purpose } from '../../types/communication';

export type TemplateStatus = 'active' | 'inactive';

export type TemplateDesignVariant =
  | 'simple'
  | 'premium'
  | 'formal'
  | 'urgent'
  | 'friendly'
  | 'minimal'
  | 'celebration'
  | 'billing';

export interface TemplateMetadata {
  id: string;
  name: string;
  slug: string;
  purpose: Purpose;
  systemType: CommunicationSystem;
  designVariant: TemplateDesignVariant;
  description: string;
  recommendedUse: string;
  supportsCode: boolean;
  supportsNotes: boolean;
  supportsCTA: boolean;
  status: TemplateStatus;
}

export interface TemplateDefinition {
  metadata: TemplateMetadata;
  subject?: string;
  body: string;
  placeholders: string[];
}
