import type { CSSProperties } from 'react';
import type { ExportThemeMode } from './exporters';

const FILE_BACKGROUND_ASSETS: Record<ExportThemeMode, string> = Object.freeze({
  light: '/light-file-background.png',
  dark: '/dark-file-background.png',
});

const FILE_BACKGROUND_BASE_COLORS: Record<ExportThemeMode, string> = Object.freeze({
  light: '#ffffff',
  dark: '#07131f',
});

type DocumentBackgroundStyleOptions = {
  overlayOpacity?: number;
  backgroundSize?: string;
  backgroundPosition?: string;
};

const backgroundDataUrlCache = new Map<ExportThemeMode, Promise<string | null>>();

const clampOverlayOpacity = (value: number | undefined, fallback: number) => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback;
  }

  return Math.max(0, Math.min(1, value));
};

export const resolveDocumentBackgroundAsset = (themeMode: ExportThemeMode) =>
  FILE_BACKGROUND_ASSETS[themeMode];

export const resolveDocumentBackgroundBaseColor = (themeMode: ExportThemeMode) =>
  FILE_BACKGROUND_BASE_COLORS[themeMode];

const buildDocumentBackgroundImageLayer = (
  themeMode: ExportThemeMode,
  options: DocumentBackgroundStyleOptions = {}
) => {
  const overlayOpacity = clampOverlayOpacity(
    options.overlayOpacity,
    themeMode === 'dark' ? 0.84 : 0.9
  );
  const accentOpacity = themeMode === 'dark'
    ? Math.min(overlayOpacity + 0.08, 0.98)
    : Math.min(overlayOpacity + 0.04, 0.96);

  const overlay = themeMode === 'dark'
    ? `linear-gradient(180deg, rgba(5, 10, 20, ${overlayOpacity}), rgba(7, 19, 31, ${accentOpacity}))`
    : `linear-gradient(180deg, rgba(255, 255, 255, ${overlayOpacity}), rgba(248, 250, 252, ${accentOpacity}))`;

  return `${overlay}, url('${resolveDocumentBackgroundAsset(themeMode)}')`;
};

export const buildDocumentBackgroundCss = (
  themeMode: ExportThemeMode,
  options: DocumentBackgroundStyleOptions = {}
) => {
  const backgroundSize = options.backgroundSize ?? 'cover';
  const backgroundPosition = options.backgroundPosition ?? 'center';

  return [
    `background-color:${resolveDocumentBackgroundBaseColor(themeMode)}`,
    `background-image:${buildDocumentBackgroundImageLayer(themeMode, options)}`,
    `background-size:${backgroundSize}`,
    `background-position:${backgroundPosition}`,
    'background-repeat:no-repeat',
  ].join('; ');
};

export const getDocumentBackgroundStyle = (
  themeMode: ExportThemeMode,
  options?: DocumentBackgroundStyleOptions
): CSSProperties => ({
  backgroundColor: resolveDocumentBackgroundBaseColor(themeMode),
  backgroundImage: buildDocumentBackgroundImageLayer(themeMode, options),
  backgroundSize: options?.backgroundSize ?? 'cover',
  backgroundPosition: options?.backgroundPosition ?? 'center',
  backgroundRepeat: 'no-repeat',
});

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error ?? new Error('FILE_BACKGROUND_READ_FAILED'));
    reader.readAsDataURL(blob);
  });

// Architecture-sensitive:
// jsPDF fallback exports cannot rely on CSS background URLs the same way the
// HTML snapshot path can, so we cache a data URL once per theme and reuse it
// across every page in that export.
export const loadDocumentBackgroundDataUrl = async (themeMode: ExportThemeMode) => {
  if (typeof window === 'undefined' || typeof fetch === 'undefined') {
    return null;
  }

  if (!backgroundDataUrlCache.has(themeMode)) {
    const assetUrl = resolveDocumentBackgroundAsset(themeMode);
    backgroundDataUrlCache.set(
      themeMode,
      fetch(assetUrl, { cache: 'force-cache' })
        .then(async (response) => {
          if (!response.ok) {
            return null;
          }

          const blob = await response.blob();
          return blobToDataUrl(blob);
        })
        .catch(() => null)
    );
  }

  return backgroundDataUrlCache.get(themeMode) ?? null;
};
