import { describe, expect, it } from "vitest";
import { databaseCsvFileContent, importDatabaseCsv, serializeDatabaseCsv } from "./csv";
import type { WorkspaceDatabase } from "./workspace";

describe("serializeDatabaseCsv", () => {
  it("adds a real UTF-8 byte-order mark only for file downloads", () => {
    const fixture: WorkspaceDatabase = {
      view: "table",
      properties: [{ id: "name", name: "Name", type: "text" }],
      rows: [{ id: "row-1", cells: { name: "Plan" } }]
    };
    const raw = serializeDatabaseCsv(fixture);
    const download = databaseCsvFileContent(fixture);
    expect(raw.charCodeAt(0)).not.toBe(0xfeff);
    expect(download.charCodeAt(0)).toBe(0xfeff);
    expect(download).toContain("Name,");
  });

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


describe("importDatabaseCsv", () => {
  const typedDatabase: WorkspaceDatabase = {
    view: "table",
    properties: [
      { id: "name", name: "Name", type: "text" },
      { id: "count", name: "Count", type: "number" },
      { id: "done", name: "Done?", type: "checkbox" },
      { id: "due", name: "Due date", type: "date" },
      { id: "status", name: "Status", type: "status", options: ["Not started", "In progress", "Done"] }
    ],
    rows: []
  };

  it("imports quoted and multiline values, converts typed cells, and adds text columns", () => {
    const csv = [
      "Name,Count,Done?,Due date,Status,Notes",
      '"Planning, phase 1",4,yes,2026-10-23,Blocked,"Line one',
      'Line two"',
      ""
    ].join("\r\n");

    const result = importDatabaseCsv(csv, typedDatabase);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].cells).toMatchObject({
      name: "Planning, phase 1",
      count: 4,
      done: true,
      due: "2026-10-23",
      status: "Blocked"
    });
    expect(result.rows[0].cells[result.properties[5].id]).toBe("Line one\r\nLine two");
    expect(result.properties[5]).toMatchObject({ name: "Notes", type: "text" });
    expect(result.properties[4].options).toContain("Blocked");
    expect(typedDatabase.rows).toEqual([]);
    expect(typedDatabase.properties[4].options).toEqual(["Not started", "In progress", "Done"]);
  });

  it("matches existing property names without creating duplicate columns", () => {
    const result = importDatabaseCsv("name,COUNT\nPlan,8\n", typedDatabase);
    expect(result.properties).toHaveLength(typedDatabase.properties.length);
    expect(result.rows[0].cells.name).toBe("Plan");
    expect(result.rows[0].cells.count).toBe(8);
  });

  it("rejects invalid typed values without changing the input database", () => {
    const before = JSON.stringify(typedDatabase);
    expect(() => importDatabaseCsv("Name,Count\nPlan,not-a-number\n", typedDatabase)).toThrow(/valid number/);
    expect(JSON.stringify(typedDatabase)).toBe(before);
    expect(() => importDatabaseCsv("Name,Due date\nPlan,yesterday\n", typedDatabase)).toThrow(/YYYY-MM-DD/);
    expect(() => importDatabaseCsv("Name,Done?\nPlan,maybe\n", typedDatabase)).toThrow(/checkbox value/);
  });

  it("rejects duplicate headers and malformed quoting", () => {
    expect(() => importDatabaseCsv("Name,name\nA,B\n", typedDatabase)).toThrow(/duplicate column names/);
    expect(() => importDatabaseCsv('Name,Count\n"unfinished,2\n', typedDatabase)).toThrow(/quoted field is closed/);
  });

  it("rejects records with more values than the header", () => {
    expect(() => importDatabaseCsv("Name,Count\nPlan,2,unexpected\n", typedDatabase)).toThrow(/more values than the header/);
  });

  it("ignores blank lines and handles a byte-order mark", () => {
    const result = importDatabaseCsv("\uFEFFName,Count\r\n\r\nPlan,2\r\n", typedDatabase);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].cells.name).toBe("Plan");
  });
});
