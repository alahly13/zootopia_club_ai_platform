import { TemplateDefinition } from './types';

export const internalTemplates: TemplateDefinition[] = [
  {
    metadata: {
      id: 'internal-unlock-secrets-simple',
      name: 'Simple Secrets Unlock',
      slug: 'unlock-secrets-simple',
      purpose: 'secrets-access',
      systemType: 'internal',
      designVariant: 'simple',
      description: 'A simple notification for unlocking new secrets.',
      recommendedUse: 'For in-app notifications when a user unlocks a new secret code.',
      supportsCode: true,
      supportsNotes: true,
      supportsCTA: true,
      status: 'active',
    },
    body: `
      <div class="p-4 bg-white border border-slate-200 rounded-lg shadow-sm">
        <h3 class="font-semibold text-slate-900 mb-2">{{title}}</h3>
        <p class="text-sm text-slate-600 mb-3">{{messageBody}}</p>
        <div class="bg-slate-100 p-2 rounded border border-slate-200 mb-3">
          <code class="font-mono text-emerald-800">{{code}}</code>
        </div>
        <p class="text-xs text-slate-500 mb-3 italic">{{notes}}</p>
        <button class="px-3 py-1 bg-emerald-600 text-white rounded text-sm">{{ctaLabel}}</button>
      </div>
    `,
    placeholders: ['{{title}}', '{{code}}', '{{notes}}', '{{messageBody}}', '{{ctaLabel}}', '{{ctaUrl}}'],
  },
  {
    metadata: {
      id: 'internal-gift-code-celebration',
      name: 'Gift Code Celebration',
      slug: 'gift-code-celebration',
      purpose: 'gift-code',
      systemType: 'internal',
      designVariant: 'celebration',
      description: 'Bright in-app message for gift code delivery.',
      recommendedUse: 'When issuing gift credits to users.',
      supportsCode: true,
      supportsNotes: true,
      supportsCTA: true,
      status: 'active',
    },
    body: `
      <div class="p-4 bg-emerald-50 border border-emerald-200 rounded-xl shadow-sm">
        <h3 class="font-bold text-emerald-900 mb-2">{{title}}</h3>
        <p class="text-sm text-emerald-800 mb-3">{{messageBody}}</p>
        <div class="bg-white p-3 rounded border border-emerald-200 mb-3">
          <p class="text-[11px] text-emerald-700 mb-1 uppercase tracking-wider">Gift Code</p>
          <code class="font-mono text-lg font-bold text-emerald-900 tracking-widest">{{code}}</code>
        </div>
        <p class="text-xs text-emerald-700 mb-3">{{notes}}</p>
        <a href="{{ctaUrl}}" class="inline-block px-3 py-1.5 bg-emerald-700 text-white rounded text-sm">{{ctaLabel}}</a>
      </div>
    `,
    placeholders: ['{{title}}', '{{code}}', '{{notes}}', '{{messageBody}}', '{{ctaLabel}}', '{{ctaUrl}}'],
  },
  {
    metadata: {
      id: 'internal-model-unlock-formal',
      name: 'Model Unlock Formal',
      slug: 'model-unlock-formal',
      purpose: 'model-unlock',
      systemType: 'internal',
      designVariant: 'formal',
      description: 'Formal in-app model unlock communication.',
      recommendedUse: 'When granting one or more premium models.',
      supportsCode: true,
      supportsNotes: true,
      supportsCTA: true,
      status: 'active',
    },
    body: `
      <div class="p-4 bg-white border border-slate-300 rounded-lg shadow-sm">
        <h3 class="font-semibold text-slate-900 mb-2">{{title}}</h3>
        <p class="text-sm text-slate-700 mb-3">{{messageBody}}</p>
        <div class="bg-slate-50 p-2 rounded border border-slate-200 mb-3">
          <p class="text-[11px] text-slate-500 mb-1">Unlock Code</p>
          <code class="font-mono text-slate-900 tracking-wider">{{code}}</code>
        </div>
        <p class="text-xs text-slate-500 mb-3">{{notes}}</p>
        <a href="{{ctaUrl}}" class="inline-block px-3 py-1 bg-slate-900 text-white rounded text-sm">{{ctaLabel}}</a>
      </div>
    `,
    placeholders: ['{{title}}', '{{code}}', '{{notes}}', '{{messageBody}}', '{{ctaLabel}}', '{{ctaUrl}}'],
  },
  {
    metadata: {
      id: 'internal-tool-unlock-premium',
      name: 'Tool Unlock Premium',
      slug: 'tool-unlock-premium',
      purpose: 'tool-unlock',
      systemType: 'internal',
      designVariant: 'premium',
      description: 'Premium unlock card for tool access.',
      recommendedUse: 'When unlocking a tool for a user.',
      supportsCode: true,
      supportsNotes: true,
      supportsCTA: true,
      status: 'active',
    },
    body: `
      <div class="p-4 bg-linear-to-b from-white to-emerald-50 border border-emerald-200 rounded-xl shadow-sm">
        <h3 class="font-bold text-emerald-900 mb-2">{{title}}</h3>
        <p class="text-sm text-slate-700 mb-3">{{messageBody}}</p>
        <div class="bg-white p-3 rounded border border-emerald-100 mb-3">
          <p class="text-[11px] text-slate-500 mb-1">Activation Code</p>
          <code class="font-mono text-xl text-emerald-800 tracking-widest">{{code}}</code>
        </div>
        <p class="text-xs text-slate-600 mb-3">{{notes}}</p>
        <a href="{{ctaUrl}}" class="inline-block px-3 py-1.5 bg-emerald-600 text-white rounded text-sm">{{ctaLabel}}</a>
      </div>
    `,
    placeholders: ['{{title}}', '{{code}}', '{{notes}}', '{{messageBody}}', '{{ctaLabel}}', '{{ctaUrl}}'],
  },
  {
    metadata: {
      id: 'internal-chat-unlock-friendly',
      name: 'Chat Unlock Friendly',
      slug: 'chat-unlock-friendly',
      purpose: 'chat-unlock',
      systemType: 'internal',
      designVariant: 'friendly',
      description: 'Friendly chat unlock message for in-app delivery.',
      recommendedUse: 'When enabling premium chat tools.',
      supportsCode: true,
      supportsNotes: true,
      supportsCTA: true,
      status: 'active',
    },
    body: `
      <div class="p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
        <h3 class="font-semibold text-slate-900 mb-2">{{title}}</h3>
        <p class="text-sm text-slate-700 mb-3">{{messageBody}}</p>
        <div class="bg-slate-100 p-2 rounded border border-slate-200 mb-3">
          <p class="text-[11px] text-slate-500 mb-1">Access Code</p>
          <code class="font-mono text-slate-900">{{code}}</code>
        </div>
        <p class="text-xs text-slate-500 mb-3">{{notes}}</p>
        <a href="{{ctaUrl}}" class="inline-block px-3 py-1 bg-slate-900 text-white rounded text-sm">{{ctaLabel}}</a>
      </div>
    `,
    placeholders: ['{{title}}', '{{code}}', '{{notes}}', '{{messageBody}}', '{{ctaLabel}}', '{{ctaUrl}}'],
  },
  {
    metadata: {
      id: 'internal-manual-broadcast-clean',
      name: 'Manual Broadcast Clean',
      slug: 'manual-broadcast-clean',
      purpose: 'manual',
      systemType: 'internal',
      designVariant: 'minimal',
      description: 'Simple broadcast card for custom announcements.',
      recommendedUse: 'For updates, reminders, or service announcements.',
      supportsCode: false,
      supportsNotes: true,
      supportsCTA: true,
      status: 'active',
    },
    body: `
      <div class="p-4 bg-white border border-slate-200 rounded-lg shadow-sm">
        <h3 class="font-semibold text-slate-900 mb-2">{{title}}</h3>
        <p class="text-sm text-slate-700 mb-3">{{messageBody}}</p>
        <p class="text-xs text-slate-500 mb-3">{{notes}}</p>
        <a href="{{ctaUrl}}" class="inline-block px-3 py-1 bg-slate-800 text-white rounded text-sm">{{ctaLabel}}</a>
      </div>
    `,
    placeholders: ['{{title}}', '{{notes}}', '{{messageBody}}', '{{ctaLabel}}', '{{ctaUrl}}'],
  },
];
