import * as React from 'react';
import type { GeneratedAsset } from '../types/generatedAsset';
import { createGeneratedAssetObjectUrl } from '../services/generatedAssetService';
import { logger } from '../utils/logger';

type GeneratedAssetImageTarget = Pick<
  GeneratedAsset,
  'id' | 'title' | 'mimeType' | 'downloadUrl' | 'storagePath' | 'storageUrl'
>;

export function useGeneratedAssetObjectUrl(asset: GeneratedAssetImageTarget | null | undefined) {
  const [objectUrl, setObjectUrl] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);

  React.useEffect(() => {
    if (!asset?.id) {
      setObjectUrl(null);
      return;
    }

    let isDisposed = false;
    let nextObjectUrl: string | null = null;

    setIsLoading(true);

    void createGeneratedAssetObjectUrl(asset)
      .then((resolvedUrl) => {
        if (isDisposed) {
          URL.revokeObjectURL(resolvedUrl);
          return;
        }

        nextObjectUrl = resolvedUrl;
        setObjectUrl(resolvedUrl);
      })
      .catch((error) => {
        if (!isDisposed) {
          setObjectUrl(null);
        }

        logger.warn('Failed to resolve generated asset object URL.', {
          area: 'generated-assets',
          event: 'resolve-object-url-failed',
          assetId: asset.id,
          error,
        });
      })
      .finally(() => {
        if (!isDisposed) {
          setIsLoading(false);
        }
      });

    return () => {
      isDisposed = true;
      if (nextObjectUrl) {
        URL.revokeObjectURL(nextObjectUrl);
      }
    };
  }, [asset?.id, asset?.storagePath, asset?.downloadUrl, asset?.storageUrl]);

  return {
    objectUrl,
    isLoading,
  };
}
