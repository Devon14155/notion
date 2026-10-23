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
  if (
    typeof property.id !== "string" || property.id.trim().length === 0 ||
    typeof property.name !== "string" || property.name.trim().length === 0 ||
    typeof property.type !== "string" || !databasePropertyTypes.has(property.type as DatabasePropertyType) ||
    (property.options !== undefined &&
      (!Array.isArray(property.options) || !property.options.every((option) => typeof option === "string")))
  ) {
    return false;
  }

  if (property.options !== undefined &&
      property.type !== "status" && property.type !== "select") {
    return false;
  }

  if (Array.isArray(property.options)) {
    const normalizedOptions = property.options.map((option) => (option as string).trim().toLocaleLowerCase());
    if (normalizedOptions.some((option) => option.length === 0) ||
        new Set(normalizedOptions).size !== normalizedOptions.length) {
      return false;
    }
  }

  return true;
}

function isDatabaseRow(value: unknown): value is DatabaseRow {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || row.id.trim().length === 0 ||
      !row.cells || typeof row.cells !== "object" || Array.isArray(row.cells)) return false;
  return Object.values(row.cells as Record<string, unknown>).every((cell) =>
    cell === null || typeof cell === "string" || typeof cell === "boolean" ||
    (typeof cell === "number" && Number.isFinite(cell))
  );
}

function isValidIsoDate(value: string): boolean {
  if (value === "") return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isCellValidForProperty(value: DatabaseCell, property: DatabaseProperty): boolean {
  if (value === null) return true;

  switch (property.type) {
    case "text":
      return typeof value === "string";
    case "checkbox":
      return typeof value === "boolean";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "date":
      return typeof value === "string" && isValidIsoDate(value);
    case "status":
    case "select": {
      if (typeof value !== "string") return false;
      const trimmedValue = value.trim();
      if (trimmedValue === "" || !property.options?.length) return true;
      return property.options.some((option) => option.trim() === trimmedValue);
    }
  }
}

function isWorkspaceDatabase(value: unknown): value is WorkspaceDatabase {
  if (!value || typeof value !== "object") return false;
  const database = value as Record<string, unknown>;
  if (!Array.isArray(database.properties) || database.properties.length === 0 || !database.properties.every(isDatabaseProperty) ||
      !Array.isArray(database.rows) || !database.rows.every(isDatabaseRow) ||
      (database.view !== "table" && database.view !== "board" && database.view !== "calendar")) return false;

  const propertyIds = new Set<string>();
  const propertyNames = new Set<string>();
  for (const property of database.properties) {
    const normalizedName = property.name.trim().toLocaleLowerCase();
    if (propertyIds.has(property.id) || propertyNames.has(normalizedName)) return false;
    propertyIds.add(property.id);
    propertyNames.add(normalizedName);
  }

  const propertiesById = new Map(database.properties.map((property) => [property.id, property]));
  const rowIds = new Set<string>();
  for (const row of database.rows) {
    if (rowIds.has(row.id)) return false;
    rowIds.add(row.id);

    for (const [propertyId, cell] of Object.entries(row.cells)) {
      const property = propertiesById.get(propertyId);
      if (!property || !isCellValidForProperty(cell as DatabaseCell, property)) return false;
    }
  }
  return true;
}

function isWorkspaceNote(value: unknown): value is WorkspaceNote {
  if (!value || typeof value !== "object") return false;
  const note = value as Record<string, unknown>;
  return typeof note.id === "string" &&
    note.id.trim().length > 0 &&
    typeof note.title === "string" &&
    typeof note.content === "string" &&
    typeof note.updatedAt === "number" &&
    Number.isFinite(note.updatedAt) &&
    typeof note.favorite === "boolean" &&
    typeof note.icon === "string" &&
    (note.parentId === undefined || (typeof note.parentId === "string" && note.parentId.trim().length > 0)) &&
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


/**
 * Merge an imported backup with the current workspace and validate the resulting
 * graph. Checking only the incoming file is insufficient: a partial backup can
 * introduce a cycle through a page that already exists locally.
 */
export function mergeWorkspaceNotes(
  existing: WorkspaceNote[],
  incoming: WorkspaceNote[]
): WorkspaceNote[] {
  const validatedIncoming = parseWorkspaceBackup(JSON.stringify(incoming));
  const mergedById = new Map(existing.map((note) => [note.id, note]));
  for (const note of validatedIncoming) mergedById.set(note.id, note);
  return parseWorkspaceBackup(JSON.stringify([...mergedById.values()]));
}
