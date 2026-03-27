import * as React from 'react';
import { Image as ImageIcon, Loader2 } from 'lucide-react';
import type { GeneratedAsset } from '../../types/generatedAsset';
import { useGeneratedAssetObjectUrl } from '../../hooks/useGeneratedAssetObjectUrl';

interface GeneratedAssetImageProps {
  asset: Pick<GeneratedAsset, 'id' | 'title' | 'mimeType' | 'downloadUrl' | 'storagePath' | 'storageUrl'>;
  alt?: string;
  className?: string;
  fallbackClassName?: string;
}

export const GeneratedAssetImage: React.FC<GeneratedAssetImageProps> = ({
  asset,
  alt,
  className,
  fallbackClassName,
}) => {
  const { objectUrl, isLoading } = useGeneratedAssetObjectUrl(asset);

  if (objectUrl) {
    return (
      <img
        src={objectUrl}
        alt={alt || asset.title}
        className={className}
        referrerPolicy="no-referrer"
      />
    );
  }

  return (
    <div className={fallbackClassName || 'flex h-full w-full items-center justify-center text-zinc-400'}>
      {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImageIcon size={34} />}
    </div>
  );
};
