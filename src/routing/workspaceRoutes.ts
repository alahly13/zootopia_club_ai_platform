import * as React from 'react';

type LazyRouteModule = {
  default: React.ComponentType<any>;
};

export type WorkspaceRouteDefinition = {
  routeId: string;
  label: string;
  load: () => Promise<LazyRouteModule>;
  Component: React.LazyExoticComponent<React.ComponentType<any>>;
};

const createWorkspaceRoute = (
  routeId: string,
  label: string,
  loader: () => Promise<LazyRouteModule>
): WorkspaceRouteDefinition => {
  let pendingLoad: Promise<LazyRouteModule> | null = null;

  const load = () => {
    if (!pendingLoad) {
      pendingLoad = loader().catch((error) => {
        pendingLoad = null;
        throw error;
      });
    }

    return pendingLoad;
  };

  return {
    routeId,
    label,
    load,
    Component: React.lazy(load),
  };
};

export const workspaceRoutes = {
  about: createWorkspaceRoute('about', 'About', () =>
    import('../pages/About').then((module) => ({ default: module.About }))
  ),
  inbox: createWorkspaceRoute('inbox', 'Inbox', () =>
    import('../pages/InboxPage').then((module) => ({ default: module.InboxPage }))
  ),
  /**
   * Historical key kept for import stability.
   * This route is user-facing support chat, not an admin-only workspace.
   */
  adminChat: createWorkspaceRoute('internal-chat', 'Chat With Admin', () =>
    import('../pages/AdminChat').then((module) => ({ default: module.AdminChat }))
  ),
  secretCodeRedemption: createWorkspaceRoute('secrets', 'Secrets', () =>
    import('../pages/SecretCodeRedemption').then((module) => ({
      default: module.SecretCodeRedemption,
    }))
  ),
  detachedPreview: createWorkspaceRoute('preview', 'Result Preview', () =>
    import('../pages/DetachedResultPreviewPage')
  ),
  adminPanel: createWorkspaceRoute('admin', 'Admin Panel', () =>
    import('../admin/AdminPanel')
  ),
  communicationCenter: createWorkspaceRoute(
    'communication-center',
    'Communication Center',
    () => import('../pages/CommunicationCenterPage')
  ),
  analysis: createWorkspaceRoute('analysis', 'Analysis Workspace', () =>
    import('../features/file-analysis/pages/AnalysisPage')
  ),
  projects: createWorkspaceRoute('projects', 'Projects', () =>
    import('../pages/Projects')
  ),
  imageEditor: createWorkspaceRoute('image-editor', 'Image Editor', () =>
    import('../pages/ImageEditorPage')
  ),
  resultsLibrary: createWorkspaceRoute('library', 'Results Library', () =>
    import('../pages/ResultsLibraryPage')
  ),
  imageGenerator: createWorkspaceRoute('images', 'Image Generator', () =>
    import('../features/image-generator/pages/ImageGeneratorPage')
  ),
  videoGenerator: createWorkspaceRoute('videos', 'Video Generator', () =>
    import('../features/video-generator/pages/VideoGeneratorPage')
  ),
  infographicGenerator: createWorkspaceRoute('infographic', 'Infographic Generator', () =>
    import('../features/infographic-generator/pages/InfographicGeneratorPage')
  ),
  userHistory: createWorkspaceRoute('history', 'Activity History', () =>
    import('../components/UserHistory')
  ),
  chatbot: createWorkspaceRoute('chat', 'AI Chatbot', () =>
    import('../features/chatbot/pages/ChatbotPage')
  ),
  liveVoice: createWorkspaceRoute('live', 'Live Voice', () =>
    import('../features/live-voice/pages/LiveVoicePage')
  ),
  studyTools: createWorkspaceRoute('tools', 'Study Tools', () =>
    import('../features/study-tools/pages/StudyToolsPage')
  ),
  support: createWorkspaceRoute('support', 'Support', () =>
    import('../components/Support')
  ),
  settings: createWorkspaceRoute('settings', 'Settings', () =>
    import('../pages/Settings')
  ),
  pricing: createWorkspaceRoute('plans', 'Plans & Pricing', () =>
    import('../pages/Pricing')
  ),
  donation: createWorkspaceRoute('donation', 'Donation', () =>
    import('../pages/Donation')
  ),
  contact: createWorkspaceRoute('contact', 'Contact', () =>
    import('../pages/Contact')
  ),
  premiumHub: createWorkspaceRoute('premium-hub', 'Premium Hub', () =>
    import('../pages/PremiumHub')
  ),
  billing: createWorkspaceRoute('billing', 'Billing', () =>
    import('../pages/Billing')
  ),
  account: createWorkspaceRoute('account', 'Account', () =>
    import('../pages/Account')
  ),
  adminSettings: createWorkspaceRoute('admin-settings', 'Admin Settings', () =>
    import('../pages/AdminSettings')
  ),
} as const;

export const PRIMARY_WORKSPACE_ROUTE_IDS: string[] = [
  workspaceRoutes.projects.routeId,
  workspaceRoutes.analysis.routeId,
  workspaceRoutes.resultsLibrary.routeId,
  workspaceRoutes.imageGenerator.routeId,
  workspaceRoutes.imageEditor.routeId,
  workspaceRoutes.videoGenerator.routeId,
  workspaceRoutes.infographicGenerator.routeId,
  workspaceRoutes.userHistory.routeId,
  workspaceRoutes.chatbot.routeId,
  workspaceRoutes.liveVoice.routeId,
  workspaceRoutes.studyTools.routeId,
];

export const SECONDARY_WORKSPACE_ROUTE_IDS: string[] = [
  workspaceRoutes.about.routeId,
  workspaceRoutes.inbox.routeId,
  workspaceRoutes.adminChat.routeId,
  workspaceRoutes.support.routeId,
  workspaceRoutes.settings.routeId,
  workspaceRoutes.pricing.routeId,
  workspaceRoutes.donation.routeId,
  workspaceRoutes.contact.routeId,
  workspaceRoutes.premiumHub.routeId,
  workspaceRoutes.billing.routeId,
  workspaceRoutes.account.routeId,
  workspaceRoutes.secretCodeRedemption.routeId,
];

export const ADMIN_WORKSPACE_ROUTE_IDS: string[] = [
  workspaceRoutes.adminPanel.routeId,
  workspaceRoutes.communicationCenter.routeId,
  workspaceRoutes.adminSettings.routeId,
];

const workspaceRouteDefinitionMap: Record<string, WorkspaceRouteDefinition> = Object.values(
  workspaceRoutes
).reduce<Record<string, WorkspaceRouteDefinition>>((result, route) => {
  result[route.routeId] = route;
  return result;
}, {});

export const getWorkspaceRouteDefinition = (routeId: string) =>
  workspaceRouteDefinitionMap[routeId] || null;

export const getWorkspaceRouteLabel = (routeId: string) =>
  workspaceRouteDefinitionMap[routeId]?.label || routeId;

export const preloadWorkspaceRoute = async (routeId: string) => {
  const route = getWorkspaceRouteDefinition(routeId);
  if (!route) {
    return;
  }

  await route.load();
};

export const preloadWorkspaceRoutes = async (routeIds: string[]) => {
  await Promise.all(
    routeIds.map((routeId) =>
      preloadWorkspaceRoute(routeId).catch(() => null)
    )
  );
};
