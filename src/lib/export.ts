import createDOMPurify from "dompurify";
import type { WorkspaceNote } from "./workspace";

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeEditorHtml(html: string): string {
  const purifier = createDOMPurify(window);
  return purifier.sanitize(html, {
    ALLOWED_TAGS: [
      "a", "b", "blockquote", "br", "code", "del", "div", "em", "h1", "h2",
      "h3", "h4", "h5", "h6", "hr", "i", "img", "input", "label", "li",
      "ol", "p", "pre", "s", "span", "strong", "table", "tbody", "td",
      "tfoot", "th", "thead", "tr", "u", "ul"
    ],
    ALLOWED_ATTR: [
      "alt", "checked", "class", "colspan", "data-checked", "data-type",
      "disabled", "height", "href", "rel", "rowspan", "src", "target",
      "title", "type", "width"
    ],
    ALLOW_DATA_ATTR: false,
    RETURN_TRUSTED_TYPE: false
  });
}
function databaseTable(note: WorkspaceNote): string {
  const database = note.database;
  if (!database) return "";
  const headers = database.properties.map((property) => `<th scope="col">${escapeHtml(property.name)}</th>`).join("");
  const rows = database.rows.map((row) => {
    const cells = database.properties.map((property) => {
      const value = row.cells[property.id];
      return `<td>${escapeHtml(value === null || value === undefined ? "" : value)}</td>`;
    }).join("");
    return `<tr>${cells}</tr>`;
  }).join("\n");
  return `<table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`;
}

/** Create a self-contained, script-free HTML export of a page or structured database. */
export function createPageHtml(note: WorkspaceNote, exportedAt = new Date().toISOString()): string {
  const title = note.title.trim() || "Untitled";
  const content = note.kind === "database" ? databaseTable(note) : sanitizeEditorHtml(note.content);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Local Workspace">
<meta name="exported-at" content="${escapeHtml(exportedAt)}">
<title>${escapeHtml(title)}</title>
<style>
:root{color-scheme:light dark}body{max-width:860px;margin:48px auto;padding:0 24px;font:16px/1.7 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:CanvasText;background:Canvas}h1{font-size:2.2rem;line-height:1.2;letter-spacing:-.04em}img{max-width:100%;height:auto}table{width:100%;border-collapse:collapse;margin:24px 0;font-size:.92rem}th,td{padding:9px 12px;border:1px solid color-mix(in srgb,CanvasText 18%,Canvas);text-align:left;vertical-align:top}th{background:color-mix(in srgb,CanvasText 6%,Canvas)}blockquote{margin-left:0;padding-left:18px;border-left:3px solid color-mix(in srgb,CanvasText 25%,Canvas)}pre{overflow:auto;padding:14px;border-radius:8px;background:color-mix(in srgb,CanvasText 7%,Canvas)}a{overflow-wrap:anywhere}
@media print{body{max-width:none;margin:0;padding:0;color:#111;background:#fff}a{color:inherit;text-decoration:underline}table,pre,blockquote{break-inside:avoid}}
</style>
</head>
<body>
<main>
<h1>${escapeHtml(title)}</h1>
${content}
</main>
</body>
</html>
`;
}

export function pageExportFilename(title: string): string {
  const slug = title.trim().toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
  return `${slug || "untitled"}.html`;
}
