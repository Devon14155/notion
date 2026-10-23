export type WorkspaceNote = {
  id: string;
  title: string;
  content: string;
  updatedAt: number;
  favorite: boolean;
  icon: string;
  trashed?: boolean;
};

export type WorkspaceBackup = {
  schemaVersion?: number;
  version?: number;
  exportedAt?: string;
  notes: WorkspaceNote[];
};

function isWorkspaceNote(value: unknown): value is WorkspaceNote {
  if (!value || typeof value !== "object") return false;
  const note = value as Record<string, unknown>;
  return typeof note.id === "string" &&
    note.id.length > 0 &&
    typeof note.title === "string" &&
    typeof note.content === "string" &&
    typeof note.updatedAt === "number" &&
    Number.isFinite(note.updatedAt) &&
    typeof note.favorite === "boolean" &&
    typeof note.icon === "string" &&
    (note.trashed === undefined || typeof note.trashed === "boolean");
}

/** Parse both the current backup envelope and the earlier raw-array format. */
export function parseWorkspaceBackup(raw: string): WorkspaceNote[] {
  const parsed: unknown = JSON.parse(raw);
  const candidate = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>).notes
      : null;
  if (!Array.isArray(candidate) || !candidate.every(isWorkspaceNote)) {
    throw new Error("Invalid workspace backup: expected a notes array with valid page records.");
  }
  const ids = new Set<string>();
  for (const note of candidate) {
    if (ids.has(note.id)) throw new Error("Invalid workspace backup: duplicate page IDs.");
    ids.add(note.id);
  }
  return candidate;
}

export function searchNotes<T extends Pick<WorkspaceNote, "title" | "content">>(
  notes: T[],
  query: string
): T[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return notes;
  return notes.filter((note) => {
    const plainText = note.content
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;|&#160;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'");
    return note.title.toLocaleLowerCase().includes(needle) ||
      plainText.toLocaleLowerCase().includes(needle);
  });
}
