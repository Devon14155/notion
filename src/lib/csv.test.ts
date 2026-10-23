import { describe, expect, it } from "vitest";
import { serializeDatabaseCsv } from "./csv";
import type { WorkspaceDatabase } from "./workspace";

describe("serializeDatabaseCsv", () => {
  it("exports properties in their existing order and serializes typed cell values", () => {
    const database: WorkspaceDatabase = {
      view: "table",
      properties: [
        { id: "name", name: "Name", type: "text" },
        { id: "count", name: "Count", type: "number" },
        { id: "done", name: "Done?", type: "checkbox" },
        { id: "due", name: "Due", type: "date" }
      ],
      rows: [
        { id: "a", cells: { name: "Planning", count: 3, done: true, due: "2026-10-23" } },
        { id: "b", cells: { name: "Review", count: null, done: false, due: "" } }
      ]
    };

    expect(serializeDatabaseCsv(database)).toBe(
      "Name,Count,Done?,Due\r\nPlanning,3,true,2026-10-23\r\nReview,,false,\r\n"
    );
  });

  it("escapes commas, quotes, and line breaks according to CSV quoting rules", () => {
    const database: WorkspaceDatabase = {
      view: "table",
      properties: [{ id: "name", name: "Name, label", type: "text" }],
      rows: [
        { id: "a", cells: { name: 'A "quoted", entry' } },
        { id: "b", cells: { name: "Line one\nLine two" } }
      ]
    };

    expect(serializeDatabaseCsv(database)).toBe(
      '"Name, label"\r\n"A ""quoted"", entry"\r\n"Line one\nLine two"\r\n'
    );
  });

  it("exports a header row for a database without entries", () => {
    const database: WorkspaceDatabase = {
      view: "table",
      properties: [{ id: "name", name: "Name", type: "text" }],
      rows: []
    };

    expect(serializeDatabaseCsv(database)).toBe("Name\r\n");
  });
});
