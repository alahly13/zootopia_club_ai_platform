import { UserPermissions, UserLimits, UserUsage, UserSettings, AdminSettings } from '../utils';
import { AI_MODELS as INITIAL_MODELS } from '../constants/aiModels';

export const defaultUserSettings: UserSettings = {
  theme: 'system',
  preferredModelId: INITIAL_MODELS[0].id,
  language: 'English',
  quizDefaults: {
    questionCount: 10,
    difficulty: 'Intermediate',
    type: 'MCQ'
  },
  notifications: {
    email: true,
    browser: true,
    system: true
  },
  exportFormat: 'PDF'
};

export const defaultAdminSettings: AdminSettings = {
  panelTheme: 'modern',
  notificationsEnabled: true,
  logRetentionDays: 30,
  autoApproveRequests: false,
  displayAdminName: 'Admin',
  securityLevel: 'High'
};

export const defaultPermissions: UserPermissions = {
  uploadFiles: true,
  generateQuestions: true,
  generateImages: true,
  generateVideos: true,
  generateInfographics: true,
  useChatbot: true,
  useLiveVoice: true,
  useStudyTools: true,
  exportFiles: true,
  viewAdvancedVisuals: false,
  accessPremiumTools: false,
};

export const defaultLimits: UserLimits = {
  aiRequestsPerDay: 10,
  quizGenerationsPerDay: 5,
  uploadsPerDay: 5,
};

export const defaultUsage: UserUsage = {
  aiRequestsToday: 0,
  quizGenerationsToday: 0,
  uploadsToday: 0,
  lastResetDate: new Date().toISOString().split('T')[0],
};
