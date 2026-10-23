import { ChevronDown, ChevronRight, Plus, FileText } from "lucide-react";
import type { ReactNode } from "react";
import type { WorkspaceNote } from "../lib/workspace";

type PageTreeProps = {
  pages: WorkspaceNote[];
  activeId: string;
  expandedIds: ReadonlySet<string>;
  onSelect: (id: string) => void;
  onToggleExpanded: (id: string) => void;
  onCreateChild: (parentId: string) => void;
};

export default function PageTree({
  pages,
  activeId,
  expandedIds,
  onSelect,
  onToggleExpanded,
  onCreateChild,
}: PageTreeProps) {
  const pageIds = new Set(pages.map((page) => page.id));
  const childrenByParent = new Map<string, WorkspaceNote[]>();

  for (const page of pages) {
    if (!page.parentId || !pageIds.has(page.parentId) || page.parentId === page.id) continue;
    const siblings = childrenByParent.get(page.parentId) ?? [];
    siblings.push(page);
    childrenByParent.set(page.parentId, siblings);
  }

  const roots = pages.filter(
    (page) => !page.parentId || !pageIds.has(page.parentId) || page.parentId === page.id
  );
  const visited = new Set<string>();

  const renderPage = (page: WorkspaceNote, depth: number): ReactNode => {
    if (visited.has(page.id)) return null;
    visited.add(page.id);
    const children = childrenByParent.get(page.id) ?? [];
    const hasChildren = children.length > 0;
    const expanded = expandedIds.has(page.id);

    return (
      <div className="page-tree-node" key={page.id}>
        <div className={`page-tree-row ${activeId === page.id ? "active" : ""}`}>
          <button
            className="page-tree-expand"
            style={{ marginLeft: 7 + depth * 15 }}
            aria-label={hasChildren ? `${expanded ? "Collapse" : "Expand"} ${page.title || "Untitled"} subpages` : "No subpages"}
            disabled={!hasChildren}
            tabIndex={hasChildren ? 0 : -1}
            onClick={() => onToggleExpanded(page.id)}
          >
            {hasChildren ? (expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />) : <span className="page-tree-leaf" />}
          </button>
          <button
            className="page-tree-link"
            aria-current={activeId === page.id ? "page" : undefined}
            onClick={() => onSelect(page.id)}
            title={page.title || "Untitled"}
          >
            <span className="page-emoji">{page.icon || <FileText size={13} />}</span>
            <span className="page-link-title">{page.title || "Untitled"}</span>
          </button>
          <button
            className="page-tree-add"
            aria-label={`Add subpage to ${page.title || "Untitled"}`}
            title="Add subpage"
            onClick={() => onCreateChild(page.id)}
          >
            <Plus size={13} />
          </button>
        </div>
        {hasChildren && expanded && <div className="page-tree-children">{children.map((child) => renderPage(child, depth + 1))}</div>}
      </div>
    );
  };

  const renderedRoots = roots.map((root) => renderPage(root, 0));
  // Corrupt or cyclic imported hierarchies should remain reachable instead of disappearing.
  const unvisited = pages.filter((page) => !visited.has(page.id)).map((page) => renderPage(page, 0));

  return <div className="page-tree">{renderedRoots}{unvisited}</div>;
}
