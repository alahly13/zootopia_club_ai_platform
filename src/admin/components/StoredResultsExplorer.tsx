import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowUpRight,
  Clock3,
  Database,
  Download,
  Eye,
  FileText,
  FolderOpen,
  Loader2,
  Search,
  Sparkles,
  UserRound,
  Video,
} from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import {
  downloadGeneratedAsset,
  formatAssetExpirationLabel,
  formatGeneratedAssetTimestamp,
  getGeneratedAssetPreviewData,
  getGeneratedAssetPreviewType,
  listAllGeneratedAssetsForAdmin,
  openGeneratedAsset,
} from '../../services/generatedAssetService';
import {
  buildGeneratedAssetAdminMetadataRows,
  formatGeneratedAssetBytes,
  getGeneratedAssetCustomizationSummary,
  getGeneratedAssetExecutionMetadata,
  getGeneratedAssetSourceUpload,
} from '../../services/generatedAssetMetadata';
import { logger } from '../../utils/logger';
import { GeneratedAsset } from '../../types/generatedAsset';
import { GeneratedAssetImage } from '../../components/assets/GeneratedAssetImage';
import { ResultPreview, useResultPreviewThemeMode } from '../../components/status/ResultPreview';
import { useGeneratedAssetObjectUrl } from '../../hooks/useGeneratedAssetObjectUrl';
import { cn, User } from '../../utils';

type AdminAssetBucket = 'all' | 'image' | 'edited-image' | 'document' | 'media' | 'other';
type DateWindowId = 'all' | '24h' | '3d';

interface UserAssetGroup {
  userId: string;
  owner: Pick<User, 'id' | 'name' | 'email' | 'role'> | null;
  assets: GeneratedAsset[];
  activeAssetCount: number;
  newestAssetAt: number;
}

const humanizeValue = (value: string) =>
  value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());

const getAssetBucket = (asset: GeneratedAsset): AdminAssetBucket => {
  if (asset.assetType === 'image') return 'image';
  if (asset.assetType === 'edited-image') return 'edited-image';
  if (['pdf', 'docx', 'markdown', 'json'].includes(asset.assetType)) return 'document';
  if (['video', 'audio'].includes(asset.assetType)) return 'media';
  return 'other';
};

const StoredResultsExplorer: React.FC = () => {
  const { t } = useTranslation();
  const { allUsers, notify } = useAuth();
  const [assets, setAssets] = React.useState<GeneratedAsset[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [assetTypeFilter, setAssetTypeFilter] = React.useState<AdminAssetBucket>('all');
  const [toolFilter, setToolFilter] = React.useState('all');
  const [providerFilter, setProviderFilter] = React.useState('all');
  const [dateWindow, setDateWindow] = React.useState<DateWindowId>('all');
  const [showExpired, setShowExpired] = React.useState(false);
  const [selectedUserId, setSelectedUserId] = React.useState<string>('');
  const [selectedAssetId, setSelectedAssetId] = React.useState<string>('');
  const [previewAsset, setPreviewAsset] = React.useState<GeneratedAsset | null>(null);
  const [previewThemeMode, setPreviewThemeMode] = useResultPreviewThemeMode({
    sourceTool: 'admin-stored-results',
    type: 'image',
  });
  const { objectUrl: previewAssetObjectUrl } = useGeneratedAssetObjectUrl(previewAsset);

  const ownerLookup = React.useMemo(() => {
    return new Map(allUsers.map((user) => [user.id, user]));
  }, [allUsers]);

  const loadAssets = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const items = await listAllGeneratedAssetsForAdmin({
        includeExpired: showExpired,
      });
      setAssets(items);
    } catch (error) {
      logger.error('Failed to load stored results explorer.', {
        area: 'admin-stored-results',
        event: 'load-stored-results-failed',
        error,
      });
      notify.error('Failed to load stored results.');
    } finally {
      setIsLoading(false);
    }
  }, [notify, showExpired]);

  React.useEffect(() => {
    void loadAssets();
  }, [loadAssets]);

  const toolOptions = React.useMemo(() => {
    const toolIds = Array.from(
      new Set(
        assets
          .map((asset) => asset.toolId)
          .filter((toolId): toolId is string => typeof toolId === 'string' && toolId.trim().length > 0)
      )
    ).sort((left, right) => left.localeCompare(right));

    return [
      { id: 'all', label: t('allTools', { defaultValue: 'All tools' }) },
      ...toolIds.map((toolId) => ({
        id: toolId,
        label: humanizeValue(toolId),
      })),
    ];
  }, [assets, t]);

  const providerOptions = React.useMemo(() => {
    const providers = Array.from(
      new Set(
        assets
          .map((asset) => asset.provider)
          .filter((provider): provider is string => typeof provider === 'string' && provider.trim().length > 0)
      )
    ).sort((left, right) => left.localeCompare(right));

    return [
      { id: 'all', label: t('allProviders', { defaultValue: 'All providers' }) },
      ...providers.map((provider) => ({
        id: provider,
        label: provider,
      })),
    ];
  }, [assets, t]);

  React.useEffect(() => {
    if (!toolOptions.some((tool) => tool.id === toolFilter)) {
      setToolFilter('all');
    }
  }, [toolFilter, toolOptions]);

  React.useEffect(() => {
    if (!providerOptions.some((provider) => provider.id === providerFilter)) {
      setProviderFilter('all');
    }
  }, [providerFilter, providerOptions]);

  const filteredAssets = React.useMemo(() => {
    const now = Date.now();
    const query = searchQuery.trim().toLowerCase();

    return assets.filter((asset) => {
      const owner = ownerLookup.get(asset.userId);
      const isExpired = asset.expiresAt.toMillis() <= now;

      if (!showExpired && isExpired) {
        return false;
      }

      if (assetTypeFilter !== 'all' && getAssetBucket(asset) !== assetTypeFilter) {
        return false;
      }

      if (toolFilter !== 'all' && asset.toolId !== toolFilter) {
        return false;
      }

      if (providerFilter !== 'all' && asset.provider !== providerFilter) {
        return false;
      }

      if (dateWindow === '24h' && asset.createdAt.toMillis() < now - 24 * 60 * 60 * 1000) {
        return false;
      }

      if (dateWindow === '3d' && asset.createdAt.toMillis() < now - 3 * 24 * 60 * 60 * 1000) {
        return false;
      }

      if (!query) {
        return true;
      }

      const searchable = [
        asset.title,
        asset.prompt,
        asset.modelId,
        asset.family,
        asset.provider,
        asset.toolId,
        asset.assetType,
        owner?.name,
        owner?.email,
        asset.userId,
      ]
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        .join(' ')
        .toLowerCase();

      return searchable.includes(query);
    });
  }, [
    assetTypeFilter,
    assets,
    dateWindow,
    ownerLookup,
    providerFilter,
    searchQuery,
    showExpired,
    toolFilter,
  ]);

  const groupedUsers = React.useMemo<UserAssetGroup[]>(() => {
    /**
     * Admin explorer grouping rule:
     * organize by owner first, then assets, then per-asset metadata.
     * This preserves the ownership boundary visually instead of flattening
     * all stored results into one ambiguous global asset table.
     */
    const grouped = new Map<string, GeneratedAsset[]>();

    for (const asset of filteredAssets) {
      const existing = grouped.get(asset.userId) || [];
      existing.push(asset);
      grouped.set(asset.userId, existing);
    }

    return Array.from(grouped.entries())
      .map(([userId, userAssets]) => ({
        userId,
        owner: ownerLookup.get(userId) || null,
        assets: [...userAssets].sort(
          (left, right) => right.createdAt.toMillis() - left.createdAt.toMillis()
        ),
        activeAssetCount: userAssets.length,
        newestAssetAt: Math.max(...userAssets.map((asset) => asset.createdAt.toMillis())),
      }))
      .sort((left, right) => right.newestAssetAt - left.newestAssetAt);
  }, [filteredAssets, ownerLookup]);

  React.useEffect(() => {
    if (!groupedUsers.length) {
      setSelectedUserId('');
      return;
    }

    if (!groupedUsers.some((group) => group.userId === selectedUserId)) {
      setSelectedUserId(groupedUsers[0].userId);
    }
  }, [groupedUsers, selectedUserId]);

  const selectedUserGroup = React.useMemo(
    () => groupedUsers.find((group) => group.userId === selectedUserId) || null,
    [groupedUsers, selectedUserId]
  );

  React.useEffect(() => {
    const nextAssets = selectedUserGroup?.assets || [];
    if (!nextAssets.length) {
      setSelectedAssetId('');
      return;
    }

    if (!nextAssets.some((asset) => asset.id === selectedAssetId)) {
      setSelectedAssetId(nextAssets[0].id);
    }
  }, [selectedAssetId, selectedUserGroup]);

  const selectedAsset = React.useMemo(
    () => selectedUserGroup?.assets.find((asset) => asset.id === selectedAssetId) || null,
    [selectedAssetId, selectedUserGroup]
  );

  const previewType = previewAsset ? getGeneratedAssetPreviewType(previewAsset) : null;

  const getAssetPlaceholder = React.useCallback((asset: GeneratedAsset) => {
    if (asset.assetType === 'video') {
      return <Video size={28} />;
    }

    if (['pdf', 'docx', 'markdown', 'json'].includes(asset.assetType)) {
      return <FileText size={28} />;
    }

    return <FolderOpen size={28} />;
  }, []);

  const openAsset = React.useCallback(
    (asset: GeneratedAsset) => {
      void openGeneratedAsset(asset).catch((error) => {
        logger.error('Failed to open admin-view asset.', {
          area: 'admin-stored-results',
          event: 'open-stored-asset-failed',
          assetId: asset.id,
          resultTitle: asset.title,
          error,
        });
        notify.error('Failed to open this stored asset.');
      });
    },
    [notify]
  );

  const handleDownload = React.useCallback(
    async (asset: GeneratedAsset) => {
      try {
        await downloadGeneratedAsset(asset);
      } catch (error) {
        logger.error('Failed to download admin-view asset.', {
          area: 'admin-stored-results',
          event: 'download-stored-asset-failed',
          assetId: asset.id,
          resultTitle: asset.title,
          error,
        });
        notify.error('Failed to download this stored asset.');
      }
    },
    [notify]
  );

  const metadataRows = React.useMemo(() => {
    if (!selectedAsset) return [];

    return buildGeneratedAssetAdminMetadataRows(
      selectedAsset,
      selectedUserGroup?.owner || undefined
    );
  }, [selectedAsset, selectedUserGroup?.owner]);

  const sourceUpload = selectedAsset ? getGeneratedAssetSourceUpload(selectedAsset) : null;
  const executionMetadata = selectedAsset ? getGeneratedAssetExecutionMetadata(selectedAsset) : null;
  const customizationSummary = selectedAsset
    ? getGeneratedAssetCustomizationSummary(selectedAsset)
    : null;

  return (
    <div className="space-y-6">
      <div className="rounded-[2.5rem] border border-zinc-200 bg-white/80 p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-[1.5rem] bg-emerald-500/10 text-emerald-500">
              <Database size={24} />
            </div>
            <div>
              <h3 className="text-xl font-black tracking-tight text-zinc-900 dark:text-white">
                {t('storedResultsExplorer', { defaultValue: 'Stored Results Explorer' })}
              </h3>
              <p className="mt-1 max-w-3xl text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
                {t('storedResultsExplorerHint', {
                  defaultValue:
                    'Browse storage-backed results grouped by owner, inspect rich metadata, and verify which tool, provider, model, and retention window produced each saved asset.',
                })}
              </p>
            </div>
          </div>

          <button
            onClick={() => void loadAssets()}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2.5 text-xs font-black uppercase tracking-[0.18em] text-white shadow-lg shadow-emerald-900/20 transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-zinc-300 dark:disabled:bg-zinc-700"
          >
            <Loader2 size={16} className={cn(isLoading && 'animate-spin')} />
            {t('refreshResults', { defaultValue: 'Refresh Results' })}
          </button>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-5">
          <div className="relative xl:col-span-2">
            <Search className="pointer-events-none absolute start-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={t('searchUsersAssets', {
                defaultValue: 'Search user, asset title, model, provider, or tool',
              })}
              className="w-full rounded-2xl border border-zinc-200 bg-white py-3 ps-11 pe-4 text-sm text-zinc-900 outline-none transition-colors focus:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white"
            />
          </div>

          <select
            value={assetTypeFilter}
            onChange={(event) => setAssetTypeFilter(event.target.value as AdminAssetBucket)}
            className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700 outline-none transition-colors focus:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200"
          >
            <option value="all">{t('allAssetTypes', { defaultValue: 'All asset types' })}</option>
            <option value="image">{t('images', { defaultValue: 'Images' })}</option>
            <option value="edited-image">{t('editedImages', { defaultValue: 'Edited images' })}</option>
            <option value="document">{t('documents', { defaultValue: 'Documents' })}</option>
            <option value="media">{t('mediaAssets', { defaultValue: 'Media' })}</option>
            <option value="other">{t('otherAssets', { defaultValue: 'Other' })}</option>
          </select>

          <select
            value={toolFilter}
            onChange={(event) => setToolFilter(event.target.value)}
            className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700 outline-none transition-colors focus:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200"
          >
            {toolOptions.map((tool) => (
              <option key={tool.id} value={tool.id}>
                {tool.label}
              </option>
            ))}
          </select>

          <select
            value={providerFilter}
            onChange={(event) => setProviderFilter(event.target.value)}
            className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700 outline-none transition-colors focus:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200"
          >
            {providerOptions.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.label}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {[
            { id: 'all', label: t('allTime', { defaultValue: 'All time' }) },
            { id: '24h', label: t('last24Hours', { defaultValue: 'Last 24H' }) },
            { id: '3d', label: t('last3Days', { defaultValue: 'Last 3D' }) },
          ].map((option) => (
            <button
              key={option.id}
              onClick={() => setDateWindow(option.id as DateWindowId)}
              className={cn(
                'rounded-full px-4 py-2 text-[11px] font-black uppercase tracking-[0.18em] transition-colors',
                dateWindow === option.id
                  ? 'bg-emerald-600 text-white'
                  : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-800'
              )}
            >
              {option.label}
            </button>
          ))}

          <button
            onClick={() => setShowExpired((current) => !current)}
            className={cn(
              'rounded-full px-4 py-2 text-[11px] font-black uppercase tracking-[0.18em] transition-colors',
              showExpired
                ? 'bg-amber-500 text-white'
                : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-800'
            )}
          >
            {showExpired
              ? t('hideExpiredAssets', { defaultValue: 'Hide expired' })
              : t('showExpiredAssets', { defaultValue: 'Show expired' })}
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center rounded-[2.5rem] border border-zinc-200 bg-white/70 py-20 dark:border-zinc-800 dark:bg-zinc-900/40">
          <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
        </div>
      ) : groupedUsers.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-5 rounded-[2.5rem] border border-zinc-200 bg-white/70 px-6 py-20 text-center dark:border-zinc-800 dark:bg-zinc-900/40">
          <div className="flex h-20 w-20 items-center justify-center rounded-[2rem] bg-zinc-100 text-zinc-400 dark:bg-zinc-950 dark:text-zinc-600">
            <Sparkles size={34} />
          </div>
          <div className="space-y-2">
            <p className="text-lg font-black text-zinc-900 dark:text-white">
              {t('noStoredResultsFound', { defaultValue: 'No stored results found.' })}
            </p>
            <p className="max-w-2xl text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
              {t('noStoredResultsFoundHint', {
                defaultValue:
                  'The current filters returned no persisted assets. Try widening the date window, provider, or tool filters.',
              })}
            </p>
          </div>
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
          <div className="rounded-[2.5rem] border border-zinc-200 bg-white/80 p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h4 className="text-lg font-black text-zinc-900 dark:text-white">
                  {t('usersWithStoredAssets', { defaultValue: 'Users' })}
                </h4>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  {groupedUsers.length} {t('owners', { defaultValue: 'owners' })}
                </p>
              </div>
              <div className="rounded-2xl bg-emerald-500/10 px-3 py-2 text-[11px] font-black uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-300">
                {filteredAssets.length} {t('assets', { defaultValue: 'assets' })}
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {groupedUsers.map((group) => (
                <button
                  key={group.userId}
                  onClick={() => setSelectedUserId(group.userId)}
                  className={cn(
                    'w-full rounded-[1.75rem] border px-4 py-4 text-left transition-colors',
                    selectedUserId === group.userId
                      ? 'border-emerald-400 bg-emerald-500/10 dark:border-emerald-500/60 dark:bg-emerald-500/10'
                      : 'border-zinc-200 bg-zinc-50 hover:bg-white dark:border-zinc-800 dark:bg-zinc-950/50 dark:hover:bg-zinc-900'
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-zinc-900 dark:text-white">
                        {group.owner?.name || group.userId}
                      </p>
                      <p className="mt-1 truncate text-xs text-zinc-500 dark:text-zinc-400">
                        {group.owner?.email || group.userId}
                      </p>
                    </div>
                    <div className="rounded-xl bg-white px-2.5 py-1 text-[11px] font-black text-zinc-600 shadow-sm dark:bg-zinc-900 dark:text-zinc-300">
                      {group.activeAssetCount}
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-zinc-400">
                    <Clock3 size={13} />
                    {t('latestAsset', { defaultValue: 'Latest' })}:{' '}
                    {formatGeneratedAssetTimestamp(new Date(group.newestAssetAt))}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-6">
            {selectedUserGroup && (
              <div className="rounded-[2.5rem] border border-zinc-200 bg-white/80 p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex items-start gap-4">
                    <div className="flex h-14 w-14 items-center justify-center rounded-[1.5rem] bg-zinc-100 text-zinc-500 dark:bg-zinc-950 dark:text-zinc-300">
                      <UserRound size={24} />
                    </div>
                    <div>
                      <h4 className="text-xl font-black tracking-tight text-zinc-900 dark:text-white">
                        {selectedUserGroup.owner?.name || selectedUserGroup.userId}
                      </h4>
                      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                        {selectedUserGroup.owner?.email || selectedUserGroup.userId}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <div className="rounded-[1.5rem] border border-zinc-200 bg-white/70 px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-950/60">
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-400">
                        {t('assets', { defaultValue: 'Assets' })}
                      </p>
                      <p className="mt-1 text-lg font-black text-zinc-900 dark:text-white">
                        {selectedUserGroup.activeAssetCount}
                      </p>
                    </div>
                    <div className="rounded-[1.5rem] border border-zinc-200 bg-white/70 px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-950/60">
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-400">
                        {t('role', { defaultValue: 'Role' })}
                      </p>
                      <p className="mt-1 text-lg font-black text-zinc-900 dark:text-white">
                        {selectedUserGroup.owner?.role || 'Unknown'}
                      </p>
                    </div>
                    <div className="rounded-[1.5rem] border border-zinc-200 bg-white/70 px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-950/60">
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-400">
                        {t('latestAsset', { defaultValue: 'Latest' })}
                      </p>
                      <p className="mt-1 text-sm font-bold text-zinc-900 dark:text-white">
                        {formatGeneratedAssetTimestamp(new Date(selectedUserGroup.newestAssetAt))}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.15fr)_360px]">
              <div className="rounded-[2.5rem] border border-zinc-200 bg-white/80 p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-lg font-black text-zinc-900 dark:text-white">
                      {t('storedAssetsByUser', { defaultValue: 'Stored assets' })}
                    </h4>
                    <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                      {t('storedAssetsByUserHint', {
                        defaultValue:
                          'Select an asset to inspect its retention, source, and execution metadata.',
                      })}
                    </p>
                  </div>
                </div>

                <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
                  {(selectedUserGroup?.assets || []).map((asset) => (
                    <button
                      key={asset.id}
                      onClick={() => setSelectedAssetId(asset.id)}
                      className={cn(
                        'overflow-hidden rounded-[2rem] border text-left transition-all',
                        selectedAssetId === asset.id
                          ? 'border-emerald-400 bg-emerald-500/10 dark:border-emerald-500/60 dark:bg-emerald-500/10'
                          : 'border-zinc-200 bg-zinc-50 hover:border-emerald-300 hover:bg-white dark:border-zinc-800 dark:bg-zinc-950/50 dark:hover:border-emerald-500/40 dark:hover:bg-zinc-900'
                      )}
                    >
                      <div className="aspect-[16/10] overflow-hidden border-b border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900">
                        {asset.assetType === 'image' || asset.assetType === 'edited-image' ? (
                          <GeneratedAssetImage
                            asset={asset}
                            alt={asset.title}
                            className="h-full w-full object-cover"
                            fallbackClassName="flex h-full w-full items-center justify-center text-zinc-400"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-zinc-400">
                            {getAssetPlaceholder(asset)}
                          </div>
                        )}
                      </div>

                      <div className="space-y-3 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-300">
                            {asset.assetType}
                          </span>
                          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-400">
                            {formatAssetExpirationLabel(asset)}
                          </span>
                        </div>
                        <div>
                          <p className="truncate text-sm font-black text-zinc-900 dark:text-white">
                            {asset.title}
                          </p>
                          <p className="mt-1 truncate text-xs text-zinc-500 dark:text-zinc-400">
                            {asset.provider} / {asset.modelId}
                          </p>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-[11px] text-zinc-600 dark:text-zinc-300">
                          <div>
                            <p className="font-black uppercase tracking-[0.16em] text-zinc-400">
                              {t('tool', { defaultValue: 'Tool' })}
                            </p>
                            <p className="mt-1 truncate">{humanizeValue(asset.toolId)}</p>
                          </div>
                          <div>
                            <p className="font-black uppercase tracking-[0.16em] text-zinc-400">
                              {t('saved', { defaultValue: 'Saved' })}
                            </p>
                            <p className="mt-1 truncate">{formatGeneratedAssetTimestamp(asset.createdAt)}</p>
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-[2.5rem] border border-zinc-200 bg-white/80 p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50">
                {selectedAsset ? (
                  <div className="space-y-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className="text-lg font-black text-zinc-900 dark:text-white">
                          {selectedAsset.title}
                        </h4>
                        <p className="mt-1 text-xs uppercase tracking-[0.18em] text-zinc-400">
                          {selectedAsset.provider} / {selectedAsset.modelId}
                        </p>
                      </div>
                      <span className="rounded-full bg-zinc-100 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500 dark:bg-zinc-950 dark:text-zinc-300">
                        {formatAssetExpirationLabel(selectedAsset)}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {previewType && (
                        <button
                          onClick={() => setPreviewAsset(selectedAsset)}
                          className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-[11px] font-black uppercase tracking-[0.18em] text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                        >
                          <Eye size={15} />
                          {t('preview', { defaultValue: 'Preview' })}
                        </button>
                      )}
                      <button
                        onClick={() => openAsset(selectedAsset)}
                        className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-[11px] font-black uppercase tracking-[0.18em] text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                      >
                        <ArrowUpRight size={15} />
                        {t('openAsset', { defaultValue: 'Open' })}
                      </button>
                      <button
                        onClick={() => void handleDownload(selectedAsset)}
                        className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-3 py-2.5 text-[11px] font-black uppercase tracking-[0.18em] text-white transition-colors hover:bg-emerald-500"
                      >
                        <Download size={15} />
                        {t('download', { defaultValue: 'Download' })}
                      </button>
                    </div>

                    <div className="grid grid-cols-1 gap-3 rounded-[2rem] border border-zinc-200 bg-white/70 p-4 text-[11px] dark:border-zinc-800 dark:bg-zinc-950/60">
                      {metadataRows.map((row) => (
                        <div
                          key={`${selectedAsset.id}-${row.label}`}
                          className="flex items-start justify-between gap-3"
                        >
                          <span className="font-black uppercase tracking-[0.18em] text-zinc-400">
                            {row.label}
                          </span>
                          <span className="max-w-[60%] break-words text-right text-zinc-600 dark:text-zinc-300">
                            {row.value}
                          </span>
                        </div>
                      ))}
                    </div>

                    {sourceUpload && (
                      <div className="rounded-[2rem] border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950/60">
                        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-zinc-400">
                          {t('sourceUpload', { defaultValue: 'Source upload' })}
                        </p>
                        <div className="mt-3 space-y-2 text-sm text-zinc-600 dark:text-zinc-300">
                          <p><span className="font-black text-zinc-500 dark:text-zinc-400">{t('file', { defaultValue: 'File' })}: </span>{sourceUpload.fileName}</p>
                          <p><span className="font-black text-zinc-500 dark:text-zinc-400">{t('type', { defaultValue: 'Type' })}: </span>{sourceUpload.fileType || sourceUpload.mimeType}</p>
                          <p><span className="font-black text-zinc-500 dark:text-zinc-400">{t('size', { defaultValue: 'Size' })}: </span>{formatGeneratedAssetBytes(sourceUpload.sizeBytes)}</p>
                          {sourceUpload.processToolId && (
                            <p><span className="font-black text-zinc-500 dark:text-zinc-400">{t('processTool', { defaultValue: 'Process tool' })}: </span>{humanizeValue(sourceUpload.processToolId)}</p>
                          )}
                        </div>
                      </div>
                    )}

                    {selectedAsset.prompt && (
                      <div className="rounded-[2rem] border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950/60">
                        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-zinc-400">
                          {t('prompt', { defaultValue: 'Prompt' })}
                        </p>
                        <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
                          {selectedAsset.prompt}
                        </p>
                      </div>
                    )}

                    {(selectedAsset.editPromptHistory.length > 0 || customizationSummary || executionMetadata) && (
                      <div className="rounded-[2rem] border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950/60">
                        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-zinc-400">
                          {t('executionContext', { defaultValue: 'Execution context' })}
                        </p>
                        <div className="mt-3 space-y-3 text-sm text-zinc-600 dark:text-zinc-300">
                          {executionMetadata && (
                            <p>
                              <span className="font-black text-zinc-500 dark:text-zinc-400">
                                {t('requestType', { defaultValue: 'Request type' })}:{' '}
                              </span>
                              {executionMetadata.generationType || executionMetadata.requestType || 'Not recorded'}
                            </p>
                          )}
                          {typeof executionMetadata?.creditsUsed === 'number' && (
                            <p>
                              <span className="font-black text-zinc-500 dark:text-zinc-400">
                                {t('creditsUsed', { defaultValue: 'Credits used' })}:{' '}
                              </span>
                              {executionMetadata.creditsUsed}
                            </p>
                          )}
                          {customizationSummary && (
                            <p>
                              <span className="font-black text-zinc-500 dark:text-zinc-400">
                                {t('customization', { defaultValue: 'Customization' })}:{' '}
                              </span>
                              {customizationSummary}
                            </p>
                          )}
                          {selectedAsset.editPromptHistory.length > 0 && (
                            <div>
                              <p className="font-black text-zinc-500 dark:text-zinc-400">
                                {t('editPromptHistory', { defaultValue: 'Edit prompt history' })}
                              </p>
                              <div className="mt-2 space-y-2">
                                {selectedAsset.editPromptHistory.map((prompt, index) => (
                                  <div
                                    key={`${selectedAsset.id}-prompt-${index}`}
                                    className="rounded-2xl border border-zinc-200 bg-white/80 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/70"
                                  >
                                    <span className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-400">
                                      V{index + 1}
                                    </span>
                                    <p className="mt-1 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
                                      {prompt}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex h-full min-h-[420px] flex-col items-center justify-center gap-4 text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-[1.5rem] bg-zinc-100 text-zinc-400 dark:bg-zinc-950 dark:text-zinc-600">
                      <FolderOpen size={28} />
                    </div>
                    <div className="space-y-2">
                      <p className="text-lg font-black text-zinc-900 dark:text-white">
                        {t('selectStoredAsset', { defaultValue: 'Select a stored asset' })}
                      </p>
                      <p className="text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
                        {t('selectStoredAssetHint', {
                          defaultValue:
                            'Choose an asset from the selected user to inspect its metadata and retrieval details.',
                        })}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {previewAsset && previewType && (
        <ResultPreview
          isOpen={!!previewAsset}
          onClose={() => setPreviewAsset(null)}
          title={previewAsset.title}
          type={previewType}
          data={getGeneratedAssetPreviewData(previewAsset, previewAssetObjectUrl)}
          sourceTool="admin-stored-results"
          previewThemeMode={previewThemeMode}
          onPreviewThemeModeChange={setPreviewThemeMode}
          createdAt={previewAsset.createdAt}
        />
      )}
    </div>
  );
};

export default StoredResultsExplorer;
