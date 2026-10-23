export type DatabasePropertyType = "text" | "status" | "date" | "number" | "checkbox" | "select";
export type DatabaseCell = string | number | boolean | null;

export type DatabaseProperty = {
  id: string;
  name: string;
  type: DatabasePropertyType;
  options?: string[];
};

export type DatabaseRow = {
  id: string;
  cells: Record<string, DatabaseCell>;
};

export type WorkspaceDatabase = {
  properties: DatabaseProperty[];
  rows: DatabaseRow[];
  view: "table" | "board" | "calendar";
};

export type WorkspaceNote = {
  id: string;
  title: string;
  content: string;
  updatedAt: number;
  favorite: boolean;
  icon: string;
  parentId?: string;
  kind?: "page" | "database";
  database?: WorkspaceDatabase;
  trashed?: boolean;
};

export type WorkspaceBackup = {
  schemaVersion?: number;
  version?: number;
  exportedAt?: string;
  notes: WorkspaceNote[];
};

const databasePropertyTypes = new Set<DatabasePropertyType>(["text", "status", "date", "number", "checkbox", "select"]);

function isDatabaseProperty(value: unknown): value is DatabaseProperty {
  if (!value || typeof value !== "object") return false;
  const property = value as Record<string, unknown>;
  return typeof property.id === "string" && property.id.length > 0 &&
    typeof property.name === "string" && property.name.trim().length > 0 &&
    typeof property.type === "string" && databasePropertyTypes.has(property.type as DatabasePropertyType) &&
    (property.options === undefined || (Array.isArray(property.options) && property.options.every((option) => typeof option === "string")));
}

function isDatabaseRow(value: unknown): value is DatabaseRow {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || !row.id || !row.cells || typeof row.cells !== "object" || Array.isArray(row.cells)) return false;
  return Object.values(row.cells as Record<string, unknown>).every((cell) =>
    cell === null || typeof cell === "string" || typeof cell === "boolean" || (typeof cell === "number" && Number.isFinite(cell))
  );
}

function isWorkspaceDatabase(value: unknown): value is WorkspaceDatabase {
  if (!value || typeof value !== "object") return false;
  const database = value as Record<string, unknown>;
  if (!Array.isArray(database.properties) || database.properties.length === 0 || !database.properties.every(isDatabaseProperty) ||
      !Array.isArray(database.rows) || !database.rows.every(isDatabaseRow) ||
      (database.view !== "table" && database.view !== "board" && database.view !== "calendar")) return false;

  const propertyIds = new Set<string>();
  for (const property of database.properties) {
    if (propertyIds.has(property.id)) return false;
    propertyIds.add(property.id);
  }
  const rowIds = new Set<string>();
  for (const row of database.rows) {
    if (rowIds.has(row.id)) return false;
    rowIds.add(row.id);
    if (Object.keys(row.cells).some((propertyId) => !propertyIds.has(propertyId))) return false;
  }
  return true;
}

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
    (note.parentId === undefined || (typeof note.parentId === "string" && note.parentId.length > 0)) &&
    (note.kind === undefined || note.kind === "page" || note.kind === "database") &&
    (note.database === undefined || isWorkspaceDatabase(note.database)) &&
    (note.kind !== "database" || isWorkspaceDatabase(note.database)) &&
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
  const byId = new Map(candidate.map((note) => [note.id, note]));
  for (const note of candidate) {
    const ancestry = new Set<string>();
    let current: WorkspaceNote | undefined = note;
    while (current) {
      if (ancestry.has(current.id)) {
        throw new Error("Invalid workspace backup: page hierarchy contains a cycle.");
      }
      ancestry.add(current.id);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
  }
  return candidate;
}

export function searchNotes<T extends Pick<WorkspaceNote, "title" | "content"> & Partial<Pick<WorkspaceNote, "database">>>(
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
    const databaseText = note.database
      ? note.database.rows.flatMap((row) => Object.values(row.cells)).map((value) => value === null ? "" : String(value)).join(" ")
      : "";
    return note.title.toLocaleLowerCase().includes(needle) ||
      plainText.toLocaleLowerCase().includes(needle) ||
      databaseText.toLocaleLowerCase().includes(needle);
  });
}

/** Make an independent copy of a page, including its structured database payload. */
export function duplicateWorkspaceNote(
  note: WorkspaceNote,
  newId: string,
  updatedAt: number
): WorkspaceNote {
  return {
    ...note,
    id: newId,
    title: `${note.title.trim() || "Untitled"} (copy)`,
    updatedAt,
    favorite: false,
    trashed: false,
    ...(note.database ? {
      database: {
        ...note.database,
        properties: note.database.properties.map((property) => ({
          ...property,
          ...(property.options ? { options: [...property.options] } : {})
        })),
        rows: note.database.rows.map((row) => ({ ...row, cells: { ...row.cells } }))
      }
    } : {})
  };
}

