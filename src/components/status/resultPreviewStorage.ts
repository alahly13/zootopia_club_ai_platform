import { ResultPreviewType } from './resultPreviewModel';
import { ExportThemeMode } from '../../utils/exporters';

export interface DetachedResultPreviewSnapshot {
  id: string;
  title: string;
  type: ResultPreviewType;
  data: unknown;
  topicImage?: string | null;
  sourceTool?: string | null;
  createdAt?: string | null;
  previewThemeMode?: ExportThemeMode;
}

type SnapshotStore = Record<string, DetachedResultPreviewSnapshot>;

const STORAGE_KEY = 'zootopia_detached_result_previews';
const MAX_SNAPSHOTS = 18;
const SNAPSHOT_TTL_MS = 1000 * 60 * 60 * 24;

function getStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readSnapshots(): SnapshotStore {
  const storage = getStorage();
  if (!storage) return {};

  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as SnapshotStore;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeSnapshots(store: SnapshotStore) {
  const storage = getStorage();
  if (!storage) return;

  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Detached preview is additive UX. Failing closed here is safer than blocking
    // the main preview workflow with storage quota or privacy-mode errors.
  }
}

function pruneSnapshots(store: SnapshotStore): SnapshotStore {
  const now = Date.now();
  const sorted = Object.values(store)
    .filter((snapshot) => {
      const createdAt = Date.parse(snapshot.createdAt || '');
      return Number.isNaN(createdAt) || now - createdAt <= SNAPSHOT_TTL_MS;
    })
    .sort((left, right) => Date.parse(right.createdAt || '') - Date.parse(left.createdAt || ''));

  return sorted.slice(0, MAX_SNAPSHOTS).reduce<SnapshotStore>((accumulator, snapshot) => {
    accumulator[snapshot.id] = snapshot;
    return accumulator;
  }, {});
}

/**
 * Detached previews intentionally use localStorage instead of route-state only.
 * That keeps new-tab / refreshed preview pages working without coupling the page
 * to any live component tree or transient in-memory React state.
 */
export function createDetachedResultPreviewSnapshot(
  snapshot: Omit<DetachedResultPreviewSnapshot, 'id'>
) {
  const id = `preview-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const store = pruneSnapshots(readSnapshots());
  const nextSnapshot: DetachedResultPreviewSnapshot = {
    ...snapshot,
    id,
    createdAt: snapshot.createdAt || new Date().toISOString(),
  };

  store[id] = nextSnapshot;
  writeSnapshots(pruneSnapshots(store));

  return {
    id,
    path: `/preview/${id}`,
  };
}

export function readDetachedResultPreviewSnapshot(
  id: string | undefined
): DetachedResultPreviewSnapshot | null {
  if (!id) return null;

  const store = pruneSnapshots(readSnapshots());
  writeSnapshots(store);

  return store[id] || null;
}

export function openDetachedResultPreview(
  snapshot: Omit<DetachedResultPreviewSnapshot, 'id'>
) {
  if (typeof window === 'undefined') {
    return null;
  }

  const { id, path } = createDetachedResultPreviewSnapshot(snapshot);
  window.open(path, '_blank', 'noopener,noreferrer');
  return id;
}
