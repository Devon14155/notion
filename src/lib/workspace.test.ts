import { describe, expect, it } from "vitest";
import { parseWorkspaceBackup, searchNotes, type WorkspaceDatabase, type WorkspaceNote } from "./workspace";

const notes: WorkspaceNote[] = [
  { id: "one", title: "Meeting notes", content: "<p>Discuss the launch plan</p>", updatedAt: 10, favorite: true, icon: "📝" },
  { id: "two", title: "Recipes", content: "<p>Tomato soup &amp; bread</p>", updatedAt: 20, favorite: false, icon: "🍲" }
];

const database: WorkspaceDatabase = {
  view: "table",
  properties: [
    { id: "title", name: "Name", type: "text" },
    { id: "status", name: "Status", type: "status", options: ["Not started", "Done"] }
  ],
  rows: [{ id: "row-1", cells: { title: "Review draft", status: "Done" } }]
};

describe("parseWorkspaceBackup", () => {
  it("reads the current versioned backup envelope", () => {
    expect(parseWorkspaceBackup(JSON.stringify({ schemaVersion: 1, notes }))).toEqual(notes);
  });

  it("keeps compatibility with the earlier raw-array format", () => {
    expect(parseWorkspaceBackup(JSON.stringify(notes))).toEqual(notes);
  });

  it("rejects malformed records rather than importing partial data", () => {
    expect(() => parseWorkspaceBackup(JSON.stringify({ notes: [{ id: "bad", title: "Broken" }] }))).toThrow(/Invalid workspace backup/);
  });

  it("rejects duplicate page IDs", () => {
    expect(() => parseWorkspaceBackup(JSON.stringify({ notes: [notes[0], notes[0]] }))).toThrow(/duplicate page IDs/);
  });

  it("preserves nested page relationships", () => {
    const nested = [{ ...notes[0] }, { ...notes[1], parentId: "one" }];
    expect(parseWorkspaceBackup(JSON.stringify({ schemaVersion: 1, notes: nested }))).toEqual(nested);
  });

  it("rejects cyclic page hierarchies", () => {
    const cyclic = [
      { ...notes[0], parentId: "two" },
      { ...notes[1], parentId: "one" }
    ];
    expect(() => parseWorkspaceBackup(JSON.stringify({ notes: cyclic }))).toThrow(/hierarchy contains a cycle/);
  });

  it("preserves structured database pages and cell values", () => {
    const databaseNote: WorkspaceNote = { ...notes[0], kind: "database", database };
    expect(parseWorkspaceBackup(JSON.stringify({ schemaVersion: 1, notes: [databaseNote] }))).toEqual([databaseNote]);
  });

  it("rejects database rows that reference unknown properties", () => {
    const malformed = { ...notes[0], kind: "database", database: { ...database, rows: [{ id: "row-1", cells: { missing: "value" } }] } };
    expect(() => parseWorkspaceBackup(JSON.stringify({ notes: [malformed] }))).toThrow(/Invalid workspace backup/);
  });

  it("rejects invalid JSON", () => {
    expect(() => parseWorkspaceBackup("{")).toThrow();
  });
});

describe("searchNotes", () => {
  it("matches titles case-insensitively", () => {
    expect(searchNotes(notes, "MEETING").map((n) => n.id)).toEqual(["one"]);
  });

  it("searches visible text in rich-text HTML", () => {
    expect(searchNotes(notes, "launch plan").map((n) => n.id)).toEqual(["one"]);
  });

  it("decodes common HTML entities before matching", () => {
    expect(searchNotes(notes, "soup & bread").map((n) => n.id)).toEqual(["two"]);
  });

  it("returns all records for a blank query", () => {
    expect(searchNotes(notes, "  ")).toEqual(notes);
  });
});
