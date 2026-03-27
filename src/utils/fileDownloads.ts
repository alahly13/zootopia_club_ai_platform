import { logger } from './logger';

type DownloadContext = {
  area: string;
  event: string;
  assetId?: string;
  resultTitle?: string;
  resultType?: string;
  sourceTool?: string | null;
};

export function sanitizeDownloadFileName(
  value: string,
  fallbackBaseName = 'zootopia-result'
) {
  const trimmed = String(value || '')
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return trimmed || fallbackBaseName;
}

export function buildDownloadFileName(
  baseName: string,
  extension: string,
  fallbackBaseName = 'zootopia-result'
) {
  const safeBaseName = sanitizeDownloadFileName(baseName, fallbackBaseName)
    .replace(/\.+$/g, '')
    .trim();
  const safeExtension = String(extension || '')
    .trim()
    .replace(/^\.+/, '')
    .replace(/[^a-z0-9]+/gi, '')
    .toLowerCase();

  return safeExtension ? `${safeBaseName}.${safeExtension}` : safeBaseName;
}

export async function downloadBlobToFile(input: {
  blob: Blob;
  fileName: string;
  context: DownloadContext;
}) {
  const { blob, fileName, context } = input;
  const safeFileName = sanitizeDownloadFileName(fileName);

  if (!(blob instanceof Blob) || blob.size <= 0) {
    const error = new Error('DOWNLOAD_BLOB_EMPTY');
    logger.error('Download aborted because blob payload is missing or empty.', {
      ...context,
      fileName: safeFileName,
      error,
    });
    throw error;
  }

  logger.info('Starting blob download.', {
    ...context,
    fileName: safeFileName,
    sizeBytes: blob.size,
    mimeType: blob.type || 'application/octet-stream',
  });

  const objectUrl = URL.createObjectURL(blob);

  try {
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = safeFileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    logger.info('Blob download completed.', {
      ...context,
      fileName: safeFileName,
      sizeBytes: blob.size,
      mimeType: blob.type || 'application/octet-stream',
    });

    return true;
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  }
}

export async function downloadUrlToFile(input: {
  url: string;
  fileName: string;
  context: DownloadContext;
}) {
  const { url, fileName, context } = input;
  const safeFileName = sanitizeDownloadFileName(fileName);

  if (!url?.trim()) {
    const error = new Error('DOWNLOAD_URL_MISSING');
    logger.error('Download aborted because URL is missing.', {
      ...context,
      fileName: safeFileName,
      error,
    });
    throw error;
  }

  logger.info('Starting client-side download.', {
    ...context,
    fileName: safeFileName,
  });

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`DOWNLOAD_RESPONSE_${response.status}`);
    }

    const blob = await response.blob();
    return downloadBlobToFile({
      blob,
      fileName: safeFileName,
      context,
    });
  } catch (error) {
    logger.warn('Blob download failed, attempting direct-open fallback.', {
      ...context,
      fileName: safeFileName,
      error,
    });

    const openedWindow = window.open(url, '_blank', 'noopener,noreferrer');
    if (openedWindow) {
      logger.info('Direct-open fallback used for download.', {
        ...context,
        fileName: safeFileName,
      });
      return true;
    }

    logger.error('Download failed after fallback attempt.', {
      ...context,
      fileName: safeFileName,
      error,
    });
    throw error;
  }
}
