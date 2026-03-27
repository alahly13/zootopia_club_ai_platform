import { TemplateDefinition } from './types';

export const emailTemplates: TemplateDefinition[] = [
  {
    metadata: {
      id: 'email-unlock-secrets-premium',
      name: 'Premium Secrets Unlock',
      slug: 'unlock-secrets-premium',
      purpose: 'secrets-access',
      systemType: 'email',
      designVariant: 'premium',
      description: 'A celebratory email for unlocking new secrets.',
      recommendedUse: 'When a user unlocks a new secret code.',
      supportsCode: true,
      supportsNotes: true,
      supportsCTA: true,
      status: 'active',
    },
    subject: '🎉 You have unlocked a new secret!',
    body: `
      <div class="font-sans p-8 bg-slate-50 rounded-2xl border border-slate-200 max-w-lg mx-auto">
        <h1 class="text-3xl font-bold text-emerald-900 mb-4">Hello {{userName}}!</h1>
        <p class="text-slate-700 mb-6">{{messageBody}}</p>
        <div class="bg-white p-6 rounded-xl border border-emerald-100 shadow-md mb-8">
          <p class="text-sm text-slate-500 mb-2">Your Secret Code:</p>
          <code class="text-2xl font-mono font-bold text-emerald-700 tracking-widest">{{code}}</code>
        </div>
        <p class="text-slate-600 text-sm mb-8 italic">Admin Note: {{notes}}</p>
        <a href="{{ctaUrl}}" class="inline-block px-8 py-3 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 transition shadow-lg">{{ctaLabel}}</a>
      </div>
    `,
    placeholders: ['{{userName}}', '{{code}}', '{{notes}}', '{{messageBody}}', '{{ctaLabel}}', '{{ctaUrl}}'],
  },
  {
    metadata: {
      id: 'email-gift-code-celebration',
      name: 'Gift Code Celebration',
      slug: 'gift-code-celebration',
      purpose: 'gift-code',
      systemType: 'email',
      designVariant: 'celebration',
      description: 'Celebratory email with a gifted code and redemption CTA.',
      recommendedUse: 'When sending promo or support gift codes to users.',
      supportsCode: true,
      supportsNotes: true,
      supportsCTA: true,
      status: 'active',
    },
    subject: 'A gift code was issued for your account',
    body: `
      <div class="font-sans p-8 bg-slate-50 rounded-2xl border border-slate-200 max-w-lg mx-auto">
        <h1 class="text-3xl font-bold text-slate-900 mb-4">Hello {{userName}},</h1>
        <p class="text-slate-700 mb-6">{{messageBody}}</p>
        <div class="bg-emerald-50 p-6 rounded-xl border border-emerald-200 shadow-sm mb-6">
          <p class="text-xs uppercase tracking-widest text-emerald-700 mb-2">Gift Code</p>
          <code class="text-2xl font-mono font-bold text-emerald-800 tracking-widest">{{code}}</code>
        </div>
        <p class="text-slate-600 text-sm mb-8 italic">{{notes}}</p>
        <a href="{{ctaUrl}}" class="inline-block px-7 py-3 bg-emerald-600 text-white rounded-xl font-semibold">{{ctaLabel}}</a>
      </div>
    `,
    placeholders: ['{{userName}}', '{{code}}', '{{notes}}', '{{messageBody}}', '{{ctaLabel}}', '{{ctaUrl}}'],
  },
  {
    metadata: {
      id: 'email-model-unlock-formal',
      name: 'Model Unlock Formal',
      slug: 'model-unlock-formal',
      purpose: 'model-unlock',
      systemType: 'email',
      designVariant: 'formal',
      description: 'Formal model-unlock notice with code and setup guidance.',
      recommendedUse: 'When granting model-specific unlock access.',
      supportsCode: true,
      supportsNotes: true,
      supportsCTA: true,
      status: 'active',
    },
    subject: 'Your model unlock access is ready',
    body: `
      <div class="font-sans p-8 bg-white rounded-2xl border border-slate-200 max-w-lg mx-auto">
        <h2 class="text-2xl font-bold text-slate-900 mb-4">Model access granted</h2>
        <p class="text-slate-700 mb-5">{{messageBody}}</p>
        <div class="bg-slate-50 p-5 rounded-xl border border-slate-200 mb-5">
          <p class="text-sm text-slate-500 mb-1">Unlock Code</p>
          <code class="text-xl font-mono font-bold text-slate-900 tracking-wider">{{code}}</code>
        </div>
        <p class="text-sm text-slate-600 mb-6">{{notes}}</p>
        <a href="{{ctaUrl}}" class="inline-block px-6 py-2.5 bg-slate-900 text-white rounded-lg font-semibold">{{ctaLabel}}</a>
      </div>
    `,
    placeholders: ['{{userName}}', '{{code}}', '{{notes}}', '{{messageBody}}', '{{ctaLabel}}', '{{ctaUrl}}'],
  },
  {
    metadata: {
      id: 'email-tool-unlock-premium',
      name: 'Tool Unlock Premium',
      slug: 'tool-unlock-premium',
      purpose: 'tool-unlock',
      systemType: 'email',
      designVariant: 'premium',
      description: 'Premium-styled unlock email for tool access.',
      recommendedUse: 'When granting access to locked tools.',
      supportsCode: true,
      supportsNotes: true,
      supportsCTA: true,
      status: 'active',
    },
    subject: 'Your premium tool access is unlocked',
    body: `
      <div class="font-sans p-8 bg-linear-to-b from-slate-50 to-white rounded-2xl border border-slate-200 max-w-lg mx-auto">
        <h2 class="text-2xl font-bold text-emerald-900 mb-4">You now have premium tool access</h2>
        <p class="text-slate-700 mb-6">{{messageBody}}</p>
        <div class="bg-white p-5 rounded-xl border border-emerald-100 shadow-sm mb-6">
          <p class="text-sm text-slate-500 mb-1">Activation Code</p>
          <code class="text-2xl font-mono font-bold text-emerald-700 tracking-widest">{{code}}</code>
        </div>
        <p class="text-sm text-slate-600 mb-6">{{notes}}</p>
        <a href="{{ctaUrl}}" class="inline-block px-7 py-3 bg-emerald-600 text-white rounded-xl font-semibold">{{ctaLabel}}</a>
      </div>
    `,
    placeholders: ['{{userName}}', '{{code}}', '{{notes}}', '{{messageBody}}', '{{ctaLabel}}', '{{ctaUrl}}'],
  },
  {
    metadata: {
      id: 'email-chat-unlock-friendly',
      name: 'Chat Unlock Friendly',
      slug: 'chat-unlock-friendly',
      purpose: 'chat-unlock',
      systemType: 'email',
      designVariant: 'friendly',
      description: 'Friendly chat feature unlock message.',
      recommendedUse: 'When enabling premium chat capabilities.',
      supportsCode: true,
      supportsNotes: true,
      supportsCTA: true,
      status: 'active',
    },
    subject: 'Your chat feature is now unlocked',
    body: `
      <div class="font-sans p-8 bg-white rounded-2xl border border-slate-200 max-w-lg mx-auto">
        <h2 class="text-2xl font-bold text-slate-900 mb-3">Good news, {{userName}}</h2>
        <p class="text-slate-700 mb-5">{{messageBody}}</p>
        <div class="bg-slate-100 p-4 rounded-lg border border-slate-200 mb-5">
          <p class="text-xs uppercase tracking-wide text-slate-600 mb-1">Access Code</p>
          <code class="text-xl font-mono font-bold text-slate-900">{{code}}</code>
        </div>
        <p class="text-sm text-slate-600 mb-6">{{notes}}</p>
        <a href="{{ctaUrl}}" class="inline-block px-6 py-2.5 bg-slate-900 text-white rounded-lg font-semibold">{{ctaLabel}}</a>
      </div>
    `,
    placeholders: ['{{userName}}', '{{code}}', '{{notes}}', '{{messageBody}}', '{{ctaLabel}}', '{{ctaUrl}}'],
  },
  {
    metadata: {
      id: 'email-manual-broadcast-clean',
      name: 'Manual Broadcast Clean',
      slug: 'manual-broadcast-clean',
      purpose: 'manual',
      systemType: 'email',
      designVariant: 'minimal',
      description: 'Clean general-purpose communication template.',
      recommendedUse: 'For custom admin announcements and updates.',
      supportsCode: false,
      supportsNotes: true,
      supportsCTA: true,
      status: 'active',
    },
    subject: '{{title}}',
    body: `
      <div class="font-sans p-8 bg-white rounded-2xl border border-slate-200 max-w-lg mx-auto">
        <h2 class="text-2xl font-bold text-slate-900 mb-4">{{title}}</h2>
        <p class="text-slate-700 mb-6">{{messageBody}}</p>
        <p class="text-sm text-slate-500 mb-6">{{notes}}</p>
        <a href="{{ctaUrl}}" class="inline-block px-6 py-2.5 bg-slate-800 text-white rounded-lg font-semibold">{{ctaLabel}}</a>
      </div>
    `,
    placeholders: ['{{title}}', '{{userName}}', '{{notes}}', '{{messageBody}}', '{{ctaLabel}}', '{{ctaUrl}}'],
  },
];
