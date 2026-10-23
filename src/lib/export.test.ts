import { describe, expect, it } from "vitest";
import { createPageHtml, pageExportFilename } from "./export";
import type { WorkspaceNote } from "./workspace";

const page: WorkspaceNote = {
  id: "page-1",
  title: "My <Notes> & Ideas",
  content: "<p>Hello <strong>world</strong>.</p>",
  updatedAt: 123,
  favorite: false,
  icon: "📝"
};

describe("page HTML export", () => {
  it("creates a complete HTML document with an escaped title and editor content", () => {
    const html = createPageHtml(page, "2026-10-23T12:00:00.000Z");
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("<title>My &lt;Notes&gt; &amp; Ideas</title>");
    expect(html).toContain('<meta name="exported-at" content="2026-10-23T12:00:00.000Z">');
    expect(html).toContain("<p>Hello <strong>world</strong>.</p>");
    expect(html).not.toContain("<script");
  });

  it("removes executable markup and event handlers from imported content", () => {
    const unsafe: WorkspaceNote = {
      ...page,
      content: '<p onclick="alert(1)">Safe text</p><script>alert(1)</script><img src="javascript:alert(1)" onerror="alert(1)">'
    };
    const html = createPageHtml(unsafe);
    expect(html).toContain("<p>Safe text</p>");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("onclick=");
    expect(html).not.toContain("onerror=");
    expect(html).not.toContain("javascript:");
  });

  it("exports structured database rows as escaped table cells", () => {
    const database: WorkspaceNote = {
      ...page,
      kind: "database",
      database: {
        view: "table",
        properties: [{ id: "name", name: "Name", type: "text" }],
        rows: [{ id: "row-1", cells: { name: "<img src=x onerror=alert(1)>" } }]
      }
    };
    const html = createPageHtml(database);
    expect(html).toContain("<th scope=\"col\">Name</th>");
    expect(html).toContain("<td>&lt;img src=x onerror=alert(1)&gt;</td>");
    expect(html).not.toContain("<img src=x");
  });

  it("creates filesystem-friendly filenames and handles empty titles", () => {
    expect(pageExportFilename("  Project / Roadmap! ")).toBe("project-roadmap.html");
    expect(pageExportFilename("")).toBe("untitled.html");
  });
});
