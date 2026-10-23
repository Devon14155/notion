import type { DatabaseCell, DatabaseProperty, DatabaseRow, WorkspaceDatabase } from "./workspace";

function escapeCsvCell(value: DatabaseCell | undefined): string {
  if (value === null || value === undefined) return "";
  const text = typeof value === "boolean" ? String(value) : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Serialize a structured database as RFC 4180-style CSV.
 * Columns follow the database's property order; missing and null values become empty fields.
 */
export function serializeDatabaseCsv(database: WorkspaceDatabase): string {
  const records: Array<Array<string | number | boolean | null | undefined>> = [
    database.properties.map((property) => property.name),
    ...database.rows.map((row) => database.properties.map((property) => row.cells[property.id]))
  ];
  return records.map((record) => record.map(escapeCsvCell).join(",")).join("\r\n") + "\r\n";
}


const DEFAULT_STATUS_OPTIONS = ["Not started", "In progress", "Done"];
const MAX_IMPORTED_ROWS = 10_000;

function parseCsvRecords(input: string): string[][] {
  const csv = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  if (!csv.trim()) throw new Error("The CSV file is empty.");

  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let inQuotes = false;
  let afterQuote = false;

  const finishField = () => {
    record.push(field);
    field = "";
    afterQuote = false;
  };
  const finishRecord = () => {
    finishField();
    records.push(record);
    record = [];
  };

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];

    if (inQuotes) {
      if (character === '"') {
        if (csv[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
          afterQuote = true;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (afterQuote) {
      if (character === ",") {
        finishField();
      } else if (character === "\r" || character === "\n") {
        finishRecord();
        if (character === "\r" && csv[index + 1] === "\n") index += 1;
      } else {
        throw new Error("The CSV contains unexpected characters after a quoted field.");
      }
      continue;
    }

    if (character === '"') {
      if (field.length > 0) {
        throw new Error("The CSV contains a quote inside an unquoted field.");
      }
      inQuotes = true;
    } else if (character === ",") {
      finishField();
    } else if (character === "\r" || character === "\n") {
      finishRecord();
      if (character === "\r" && csv[index + 1] === "\n") index += 1;
    } else {
      field += character;
    }
  }

  if (inQuotes) throw new Error("The CSV ends before a quoted field is closed.");
  if (afterQuote || field.length > 0 || record.length > 0) {
    finishField();
    records.push(record);
  }

  return records;
}

function isIsoDate(value: string): boolean {
  if (value === "") return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function defaultCellValue(property: DatabaseProperty): DatabaseCell {
  if (property.type === "checkbox") return false;
  if (property.type === "number") return null;
  if (property.type === "status" || property.type === "select") {
    if (property.type === "status" && !property.options?.length) return DEFAULT_STATUS_OPTIONS[0];
    return property.options?.[0] ?? "";
  }
  return "";
}

function importCellValue(rawValue: string, property: DatabaseProperty): DatabaseCell {
  const trimmed = rawValue.trim();

  switch (property.type) {
    case "text":
      return rawValue;
    case "number": {
      if (trimmed === "") return null;
      const value = Number(trimmed);
      if (!Number.isFinite(value)) {
        throw new Error(`“${rawValue}” is not a valid number for “${property.name}”.`);
      }
      return value;
    }
    case "checkbox": {
      if (trimmed === "" || /^(false|no|0)$/i.test(trimmed)) return false;
      if (/^(true|yes|1)$/i.test(trimmed)) return true;
      throw new Error(`“${rawValue}” is not a valid checkbox value for “${property.name}” (use true/false, yes/no, or 1/0).`);
    }
    case "date":
      if (!isIsoDate(trimmed)) {
        throw new Error(`“${rawValue}” is not a valid YYYY-MM-DD date for “${property.name}”.`);
      }
      return trimmed;
    case "status":
    case "select": {
      if (trimmed === "") return "";
      let options = property.options ? [...property.options] : [];
      if (property.type === "status" && options.length === 0) options = [...DEFAULT_STATUS_OPTIONS];
      const existing = options.find((option) => option.trim().toLocaleLowerCase() === trimmed.toLocaleLowerCase());
      if (existing) return existing;
      options.push(trimmed);
      property.options = options;
      return trimmed;
    }
  }
}

/**
 * Append CSV records to an existing local database. Headers match existing properties
 * by name (case-insensitively); unknown headers become text properties. Values for
 * typed properties are validated before a new database value is returned, so a bad
 * row never partially mutates the workspace.
 */
export function importDatabaseCsv(input: string, database: WorkspaceDatabase): WorkspaceDatabase {
  const records = parseCsvRecords(input);
  const rawHeaders = records[0];
  const headers = rawHeaders.map((header) => header.trim());
  if (headers.length === 0 || headers.some((header) => header.length === 0)) {
    throw new Error("The CSV must have a non-empty header for every column.");
  }
  if (new Set(headers.map((header) => header.toLocaleLowerCase())).size !== headers.length) {
    throw new Error("The CSV contains duplicate column names.");
  }
  if (records.length - 1 > MAX_IMPORTED_ROWS) {
    throw new Error(`The CSV exceeds the ${MAX_IMPORTED_ROWS.toLocaleString()} row import limit.`);
  }

  const properties: DatabaseProperty[] = database.properties.map((property) => ({
    ...property,
    ...(property.options ? { options: [...property.options] } : {})
  }));
  const propertiesByName = new Map(properties.map((property) => [property.name.trim().toLocaleLowerCase(), property]));
  const headerProperties = headers.map((header) => {
    const normalized = header.toLocaleLowerCase();
    const existing = propertiesByName.get(normalized);
    if (existing) return existing;
    const property: DatabaseProperty = {
      id: globalThis.crypto.randomUUID(),
      name: header,
      type: "text"
    };
    properties.push(property);
    propertiesByName.set(normalized, property);
    return property;
  });

  const newRows: DatabaseRow[] = [];
  for (const record of records.slice(1)) {
    if (!record.some((value) => value.trim().length > 0)) continue;
    if (record.length > headers.length) {
      throw new Error("A CSV row contains more values than the header has columns.");
    }

    const values = headers.map((_, index) => record[index] ?? "");
    const cells: Record<string, DatabaseCell> = Object.fromEntries(
      properties.map((property) => [property.id, defaultCellValue(property)])
    );

    values.forEach((rawValue, index) => {
      const property = headerProperties[index];
      cells[property.id] = importCellValue(rawValue, property);
    });
    newRows.push({ id: globalThis.crypto.randomUUID(), cells });
  }

  return { ...database, properties, rows: [...database.rows, ...newRows] };
}
