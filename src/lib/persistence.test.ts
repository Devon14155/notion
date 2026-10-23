import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadPersistedWorkspace, savePersistedWorkspace } from "./persistence";
import type { WorkspaceNote } from "./workspace";

const STORAGE_KEY = "notion-workspace-notes-v1";
const sampleNotes: WorkspaceNote[] = [
  {
    id: "persisted-note",
    title: "My private notes",
    content: "<p>Stays on this device</p>",
    updatedAt: 123,
    favorite: true,
    icon: "📝"
  }
];

const records = new Map<string, string>();

beforeEach(() => {
  records.clear();
  vi.stubGlobal("indexedDB", undefined);
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => records.get(key) ?? null,
    setItem: (key: string, value: string) => { records.set(key, value); },
    removeItem: (key: string) => { records.delete(key); },
    clear: () => records.clear()
  });
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("local workspace persistence fallback", () => {
  it("loads an existing raw-array localStorage workspace", async () => {
    records.set(STORAGE_KEY, JSON.stringify(sampleNotes));

    await expect(loadPersistedWorkspace()).resolves.toEqual({
      notes: sampleNotes,
      backend: "localStorage"
    });
  });

  it("loads an existing versioned localStorage snapshot", async () => {
    records.set(STORAGE_KEY, JSON.stringify({
      schemaVersion: 1,
      savedAt: 456,
      notes: sampleNotes
    }));

    const result = await loadPersistedWorkspace();
    expect(result.notes).toEqual(sampleNotes);
    expect(result.backend).toBe("localStorage");
  });

  it("returns no snapshot when this is a first-time workspace", async () => {
    await expect(loadPersistedWorkspace()).resolves.toEqual({
      notes: null,
      backend: "localStorage"
    });
  });

  it("saves a versioned fallback snapshot with a timestamp", async () => {
    await expect(savePersistedWorkspace(sampleNotes)).resolves.toBe("localStorage");

    const saved = JSON.parse(records.get(STORAGE_KEY) ?? "null") as {
      schemaVersion: number;
      savedAt: number;
      notes: WorkspaceNote[];
    };
    expect(saved.schemaVersion).toBe(1);
    expect(saved.savedAt).toBeGreaterThan(0);
    expect(saved.notes).toEqual(sampleNotes);
  });
});
