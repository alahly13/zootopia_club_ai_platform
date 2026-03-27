export type Channel = 'internal' | 'email' | 'both';
export type Purpose = 'gift-code' | 'secrets-access' | 'model-unlock' | 'tool-unlock' | 'chat-unlock' | 'approval' | 'rejection' | 'moderation-notice' | 'billing-notice' | 'manual';

import { emailTemplates } from '../admin/templates/emailTemplates';
import { internalTemplates } from '../admin/templates/internalTemplates';

export interface Template {
  id: string;
  name: string;
  purpose: Purpose;
  channel: Channel;
  description: string;
  style: 'formal' | 'casual' | 'urgent' | 'premium';
  supportsCode: boolean;
  supportsNotes: boolean;
  supportsCTA: boolean;
  title: string;
  message: string;
}

const STRIP_HTML_TAGS_REGEX = /<[^>]*>/g;

function htmlToMessage(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(STRIP_HTML_TAGS_REGEX, ' ')
    .replace(/\s+\n/g, '\n')
    .replace(/\n\s+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function mapDesignVariantToStyle(variant: string): Template['style'] {
  const normalized = (variant || '').toLowerCase();
  if (normalized === 'premium' || normalized === 'celebration' || normalized === 'billing') {
    return 'premium';
  }
  if (normalized === 'urgent') {
    return 'urgent';
  }
  if (normalized === 'friendly' || normalized === 'simple') {
    return 'casual';
  }
  return 'formal';
}

function toRuntimeTemplate(template: {
  metadata: {
    id: string;
    name: string;
    purpose: Purpose;
    systemType: 'internal' | 'email';
    designVariant: string;
    description: string;
    supportsCode: boolean;
    supportsNotes: boolean;
    supportsCTA: boolean;
    status: 'active' | 'inactive';
  };
  subject?: string;
  body: string;
}): Template | null {
  if (template.metadata.status !== 'active') {
    return null;
  }

  return {
    id: template.metadata.id,
    name: template.metadata.name,
    purpose: template.metadata.purpose,
    channel: template.metadata.systemType,
    description: template.metadata.description,
    style: mapDesignVariantToStyle(template.metadata.designVariant),
    supportsCode: template.metadata.supportsCode,
    supportsNotes: template.metadata.supportsNotes,
    supportsCTA: template.metadata.supportsCTA,
    title: template.subject || template.metadata.name,
    // Compatibility: Communication Center currently edits plain text fields.
    // We keep HTML source templates as truth, then derive editable text here.
    message: htmlToMessage(template.body),
  };
}

/**
 * Single source of truth rule:
 * Runtime Communication Center templates must be derived from
 * src/admin/templates/emailTemplates.ts and src/admin/templates/internalTemplates.ts.
 * Do not add a second hardcoded template catalog here.
 */
export const templates: Template[] = [...internalTemplates, ...emailTemplates]
  .map((template) => toRuntimeTemplate(template))
  .filter((template): template is Template => template !== null);
