import { parseWorkspaceBackup, type WorkspaceNote } from "./workspace";

export type StorageBackend = "indexeddb" | "localStorage";

type WorkspaceSnapshot = {
  schemaVersion: 1;
  savedAt: number;
  notes: WorkspaceNote[];
};

type LoadedWorkspace = {
  notes: WorkspaceNote[] | null;
  backend: StorageBackend;
};

const DATABASE_NAME = "notion-workspace";
const DATABASE_VERSION = 1;
const OBJECT_STORE = "snapshots";
const SNAPSHOT_KEY = "current-workspace";
const LEGACY_STORAGE_KEY = "notion-workspace-notes-v1";

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction was aborted."));
  });
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is not supported in this browser."));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(OBJECT_STORE)) {
        request.result.createObjectStore(OBJECT_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open the local workspace database."));
    request.onblocked = () => reject(new Error("Workspace storage upgrade is blocked by another open tab."));
  });
}

function snapshotFromUnknown(value: unknown, fallbackSavedAt = 0): WorkspaceSnapshot | null {
  if (Array.isArray(value)) {
    return {
      schemaVersion: 1,
      savedAt: fallbackSavedAt,
      notes: parseWorkspaceBackup(JSON.stringify(value))
    };
  }
  if (!value || typeof value !== "object") return null;
  const snapshot = value as Record<string, unknown>;
  if (!Array.isArray(snapshot.notes)) return null;
  const savedAt = typeof snapshot.savedAt === "number" && Number.isFinite(snapshot.savedAt)
    ? snapshot.savedAt
    : fallbackSavedAt;
  return {
    schemaVersion: 1,
    savedAt,
    notes: parseWorkspaceBackup(JSON.stringify(snapshot.notes))
  };
}

async function readIndexedDbSnapshot(): Promise<WorkspaceSnapshot | null> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(OBJECT_STORE, "readonly");
    const completion = transactionDone(transaction);
    const result = await requestResult(transaction.objectStore(OBJECT_STORE).get(SNAPSHOT_KEY));
    await completion;
    return result === undefined ? null : snapshotFromUnknown(result);
  } finally {
    database.close();
  }
}

async function writeIndexedDbSnapshot(snapshot: WorkspaceSnapshot): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(OBJECT_STORE, "readwrite");
    const completion = transactionDone(transaction);
    transaction.objectStore(OBJECT_STORE).put(snapshot, SNAPSHOT_KEY);
    await completion;
  } finally {
    database.close();
  }
}

function readLegacySnapshot(): WorkspaceSnapshot | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return snapshotFromUnknown(parsed, 0);
  } catch (error) {
    console.warn("The legacy local workspace snapshot could not be read.", error);
    return null;
  }
}

/**
 * Prefer the newest valid IndexedDB or legacy localStorage snapshot.
 * Existing localStorage workspaces are migrated without requiring user action.
 */
export async function loadPersistedWorkspace(): Promise<LoadedWorkspace> {
  const legacy = readLegacySnapshot();

  try {
    const indexed = await readIndexedDbSnapshot();
    if (indexed && (!legacy || indexed.savedAt >= legacy.savedAt)) {
      return { notes: indexed.notes, backend: "indexeddb" };
    }

    if (legacy) {
      const migrated = { ...legacy, savedAt: Math.max(Date.now(), legacy.savedAt) };
      try {
        await writeIndexedDbSnapshot(migrated);
        return { notes: legacy.notes, backend: "indexeddb" };
      } catch (error) {
        console.warn("Could not migrate this workspace to IndexedDB; using browser storage instead.", error);
        return { notes: legacy.notes, backend: "localStorage" };
      }
    }

    return { notes: null, backend: "indexeddb" };
  } catch (error) {
    console.warn("IndexedDB is unavailable; falling back to localStorage.", error);
    return { notes: legacy?.notes ?? null, backend: "localStorage" };
  }
}

/**
 * IndexedDB is the primary store because it handles larger offline workspaces
 * and embedded images much better than synchronous localStorage writes.
 * localStorage remains a compatibility fallback for restricted browsers.
 */
export async function savePersistedWorkspace(notes: WorkspaceNote[]): Promise<StorageBackend> {
  const snapshot: WorkspaceSnapshot = {
    schemaVersion: 1,
    savedAt: Date.now(),
    notes
  };

  try {
    await writeIndexedDbSnapshot(snapshot);
    return "indexeddb";
  } catch (indexedError) {
    if (typeof localStorage === "undefined") {
      throw indexedError;
    }

    try {
      localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(snapshot));
      return "localStorage";
    } catch (localStorageError) {
      throw new Error(
        "Could not save the workspace in either IndexedDB or localStorage. Export a JSON backup and remove large items before continuing.",
        { cause: localStorageError }
      );
    }
  }
}
