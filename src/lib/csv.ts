import type { DatabaseCell, WorkspaceDatabase } from "./workspace";

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
  const records: string[][] = [
    database.properties.map((property) => property.name),
    ...database.rows.map((row) => database.properties.map((property) => escapeCsvCell(row.cells[property.id])))
  ];
  return records.map((record) => record.map(escapeCsvCell).join(",")).join("\r\n") + "\r\n";
}
