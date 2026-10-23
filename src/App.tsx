import { useEffect, useMemo, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import { parseWorkspaceBackup, searchNotes } from "./lib/workspace";
import PageTree from "./components/PageTree";
import {
  Search, Plus, ChevronDown, ChevronRight, Home, Inbox, Settings2,
  PanelLeftClose, PanelLeft, FileText, Star, Clock3, Trash2, MoreHorizontal,
  CheckSquare, CalendarDays, LayoutGrid, BookOpen, Command, Sun, Moon,
  Bold, Italic, List, ListOrdered, Heading2, Quote, SearchX, X
} from "lucide-react";

type Note = {
  id: string;
  title: string;
  content: string;
  updatedAt: number;
  favorite: boolean;
  icon: string;
  parentId?: string;
  trashed?: boolean;
};

const slashCommands = [
  { id: "text", label: "Text", description: "Start with plain text", keywords: "paragraph normal" },
  { id: "heading1", label: "Heading 1", description: "A large section heading", keywords: "title h1" },
  { id: "heading2", label: "Heading 2", description: "A medium section heading", keywords: "h2" },
  { id: "heading3", label: "Heading 3", description: "A small section heading", keywords: "h3" },
  { id: "bulletList", label: "Bulleted list", description: "Create a simple list", keywords: "unordered bullets" },
  { id: "orderedList", label: "Numbered list", description: "Create a numbered list", keywords: "ordered numbers" },
  { id: "taskList", label: "Checklist", description: "Add tasks you can check off", keywords: "todo tasks checkbox to do" },
  { id: "quote", label: "Quote", description: "Highlight a quotation", keywords: "blockquote" },
  { id: "codeBlock", label: "Code block", description: "Display code with formatting", keywords: "code programming" },
  { id: "divider", label: "Divider", description: "Separate sections visually", keywords: "line separator horizontal rule" },
] as const;

type SlashCommandId = (typeof slashCommands)[number]["id"];
type SlashMenuState = {
  query: string;
  left: number;
  top: number;
  selectedIndex: number;
};

const STORAGE_KEY = "notion-workspace-notes-v1";
const starterNotes: Note[] = [
  { id: "welcome", title: "Welcome to your workspace", content: "<h2>A calmer place to think.</h2><p>This is your personal workspace. Create pages, capture ideas, and organize your work — with your content saved locally in this browser.</p><h2>Make it yours</h2><ul><li>Rename this page by editing its title.</li><li>Use the toolbar to format text.</li><li>Create a page from the sidebar with the <strong>New page</strong> button.</li><li>Star important pages to find them quickly.</li></ul><blockquote><p>Your workspace should work for you, not the other way around.</p></blockquote>", updatedAt: Date.now(), favorite: true, icon: "✳️" },
  { id: "ideas", title: "Ideas & inspiration", content: "<h2>Ideas worth exploring</h2><p>Keep loose thoughts here before they become plans.</p><ul><li>Build a personal knowledge garden</li><li>Make space for deep work</li><li>Capture first, organize later</li></ul>", updatedAt: Date.now() - 3600000, favorite: false, icon: "💡" },
  { id: "weekly", title: "Weekly planning", content: "<h2>This week</h2><p>Choose a few meaningful outcomes instead of an endless list.</p><ul><li>Review priorities</li><li>Break one large task into small steps</li><li>Leave room to think</li></ul>", updatedAt: Date.now() - 86400000, favorite: false, icon: "🗓️" }
];

function loadNotes(): Note[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return starterNotes;
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((n) => n && typeof n.id === "string" && typeof n.title === "string" && typeof n.content === "string")) return parsed as Note[];
  } catch (error) {
    console.error("Could not load local workspace data", error);
  }
  return starterNotes;
}

function App() {
  const [notes, setNotes] = useState<Note[]>(loadNotes);
  const [activeId, setActiveId] = useState("welcome");
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [dark, setDark] = useState(false);
  const [section, setSection] = useState<"all" | "favorites" | "recent" | "trash">("all");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [slashMenu, setSlashMenu] = useState<SlashMenuState | null>(null);
  const slashMenuRef = useRef<SlashMenuState | null>(null);
  const editorAreaRef = useRef<HTMLDivElement>(null);
  const [toast, setToast] = useState("");

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(notes)); }
    catch (error) { console.error("Could not persist workspace data", error); setToast("Storage is full. Export or remove some pages."); }
  }, [notes]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const modifier = event.metaKey || event.ctrlKey;
      const target = event.target as HTMLElement | null;
      const typing = !!target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
      if (modifier && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
        window.setTimeout(() => document.getElementById("global-search")?.focus(), 0);
      } else if (modifier && event.key.toLowerCase() === "n" && !typing) {
        event.preventDefault();
        createNote();
      } else if (event.key === "Escape" && searchOpen) {
        setSearchOpen(false);
        setQuery("");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [searchOpen, notes]);

  const visibleNotes = useMemo(() => {
    const active = notes.filter((n) => section === "trash" ? n.trashed : !n.trashed);
    const scoped = section === "favorites" ? active.filter((n) => n.favorite) : section === "recent" ? [...active].sort((a,b) => b.updatedAt-a.updatedAt) : active;
    const q = query.trim().toLowerCase();
    return q ? searchNotes(scoped, q) : scoped;
  }, [notes, query, section]);

  const activeNote = notes.find((n) => n.id === activeId && (section === "trash" ? n.trashed : !n.trashed)) ?? visibleNotes[0] ?? null;

  const updateSlashMenu = (current: Editor) => {
    const selection = current.state.selection;
    const $from = selection.$from;
    const text = $from.parent.textContent;
    const match = /^\/([a-z0-9 ]*)$/i.exec(text);
    if (!selection.empty || !$from.parent.isTextblock || $from.parentOffset !== $from.parent.content.size || !match) {
      slashMenuRef.current = null;
      setSlashMenu(null);
      return;
    }

    let left = 12;
    let top = 8;
    const area = editorAreaRef.current;
    if (area) {
      try {
        const coords = current.view.coordsAtPos(selection.from);
        const bounds = area.getBoundingClientRect();
        left = Math.max(8, Math.min(Math.max(8, bounds.width - 265), coords.left - bounds.left));
        top = Math.max(8, coords.bottom - bounds.top + 4);
      } catch {
        // The command menu remains usable at its default position if layout coordinates are unavailable.
      }
    }
    const next: SlashMenuState = { query: match[1].toLowerCase(), left, top, selectedIndex: 0 };
    slashMenuRef.current = next;
    setSlashMenu(next);
  };

  const editor = useEditor({
    extensions: [StarterKit, TaskList.configure({ nested: true }), TaskItem.configure({ nested: true }), Placeholder.configure({ placeholder: "Start writing, or type / for commands…" })],
    content: activeNote?.content ?? "",
    onUpdate: ({ editor: current }) => {
      const content = current.getHTML();
      setNotes((prev) => prev.map((n) => n.id === activeId ? { ...n, content, updatedAt: Date.now() } : n));
      updateSlashMenu(current);
    },
    onSelectionUpdate: ({ editor: current }) => updateSlashMenu(current),
    editorProps: {
      attributes: { class: "tiptap", "aria-label": "Page content editor" },
      handleKeyDown: (_view, event) => {
        const currentMenu = slashMenuRef.current;
        if (!currentMenu) return false;
        const matches = slashCommands.filter((command) => (command.label + " " + command.keywords).toLowerCase().includes(currentMenu.query));
        if (event.key === "Escape") {
          event.preventDefault();
          slashMenuRef.current = null;
          setSlashMenu(null);
          return true;
        }
        if (event.key === "ArrowDown" && matches.length) {
          event.preventDefault();
          const next = { ...currentMenu, selectedIndex: (currentMenu.selectedIndex + 1) % matches.length };
          slashMenuRef.current = next;
          setSlashMenu(next);
          return true;
        }
        if (event.key === "ArrowUp" && matches.length) {
          event.preventDefault();
          const next = { ...currentMenu, selectedIndex: (currentMenu.selectedIndex - 1 + matches.length) % matches.length };
          slashMenuRef.current = next;
          setSlashMenu(next);
          return true;
        }
        if ((event.key === "Enter" || event.key === "Tab") && matches.length) {
          event.preventDefault();
          executeSlashCommand(matches[currentMenu.selectedIndex % matches.length].id);
          return true;
        }
        return false;
      }
    }
  }, [activeId]);

  useEffect(() => {
    slashMenuRef.current = null;
    setSlashMenu(null);
    if (editor && activeNote) {
      const current = editor.getHTML();
      if (current !== activeNote.content) editor.commands.setContent(activeNote.content || "");
    }
  }, [activeId, editor]);

  const executeSlashCommand = (commandId: SlashCommandId) => {
    if (!editor) return;
    const { selection } = editor.state;
    const $from = selection.$from;
    if (!selection.empty || !$from.parent.isTextblock || !/^\/([a-z0-9 ]*)$/i.test($from.parent.textContent)) {
      slashMenuRef.current = null;
      setSlashMenu(null);
      return;
    }

    const from = $from.start();
    const to = $from.end();
    const chain = editor.chain().focus().deleteRange({ from, to });
    slashMenuRef.current = null;
    setSlashMenu(null);
    switch (commandId) {
      case "text": chain.setParagraph().run(); break;
      case "heading1": chain.setHeading({ level: 1 }).run(); break;
      case "heading2": chain.setHeading({ level: 2 }).run(); break;
      case "heading3": chain.setHeading({ level: 3 }).run(); break;
      case "bulletList": chain.toggleBulletList().run(); break;
      case "orderedList": chain.toggleOrderedList().run(); break;
      case "taskList": chain.toggleTaskList().run(); break;
      case "quote": chain.toggleBlockquote().run(); break;
      case "codeBlock": chain.setCodeBlock().run(); break;
      case "divider": chain.setHorizontalRule().run(); break;
    }
  };

  const createNote = (parentId?: string) => {
    const note: Note = { id: crypto.randomUUID(), title: "Untitled", content: "<p></p>", updatedAt: Date.now(), favorite: false, icon: "📄", ...(parentId ? { parentId } : {}) };
    setNotes((prev) => [note, ...prev]);
    if (parentId) setExpandedIds((prev) => new Set(prev).add(parentId));
    setActiveId(note.id);
    setSection("all");
    setQuery("");
    setToast("New page created");
    if (window.innerWidth < 760) setMobileMenu(false);
  };

  const renameActive = (title: string) => {
    if (!activeNote) return;
    setNotes((prev) => prev.map((n) => n.id === activeNote.id ? { ...n, title, updatedAt: Date.now() } : n));
  };

  const toggleFavorite = () => {
    if (!activeNote) return;
    setNotes((prev) => prev.map((n) => n.id === activeNote.id ? { ...n, favorite: !n.favorite } : n));
  };

  const moveToTrash = () => {
    if (!activeNote) return;
    const id = activeNote.id;
    setNotes((prev) => prev.map((n) => n.id === id ? { ...n, trashed: true, updatedAt: Date.now() } : n));
    const next = notes.find((n) => n.id !== id && !n.trashed);
    setActiveId(next?.id ?? "");
    setToast("Page moved to trash");
  };

  const restoreNote = (id: string) => {
    setNotes((prev) => prev.map((n) => n.id === id ? { ...n, trashed: false } : n));
    setActiveId(id);
    setSection("all");
  };

  const permanentlyDelete = (id: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== id).map((n) => n.parentId === id ? { ...n, parentId: undefined } : n));
    if (activeId === id) setActiveId("");
    setToast("Page permanently deleted");
  };

  const exportNotes = () => {
    const payload = JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(), notes }, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = "notion-workspace-backup.json"; link.click();
    URL.revokeObjectURL(url);
    setToast("Backup exported");
  };

  const importNotes = async (file?: File) => {
    if (!file) return;
    try {
      const incoming = parseWorkspaceBackup(await file.text());
      setNotes((prev) => {
        const byId = new Map(prev.map((n) => [n.id, n]));
        incoming.forEach((n: Note) => byId.set(n.id, n));
        return [...byId.values()];
      });
      setToast("Backup imported");
    } catch { setToast("Could not import: invalid backup file"); }
  };

  const chooseSection = (value: typeof section) => { setSection(value); setQuery(""); if (value === "trash") { setActiveId(notes.find(n => n.trashed)?.id ?? ""); } else if (value === "favorites") { setActiveId(notes.find(n => n.favorite && !n.trashed)?.id ?? ""); } else { setActiveId(notes.find(n => !n.trashed)?.id ?? ""); } };

  const filteredSlashCommands = slashMenu ? slashCommands.filter((command) => (command.label + " " + command.keywords).toLowerCase().includes(slashMenu.query)) : [];

  return (
    <div className={dark ? "app-shell dark" : "app-shell"}>
      {mobileMenu && <button className="mobile-backdrop" aria-label="Close navigation" onClick={() => setMobileMenu(false)} />}
      <aside className={`sidebar ${sidebarOpen ? "" : "sidebar-collapsed"} ${mobileMenu ? "mobile-visible" : ""}`}>
        <div className="workspace-switcher">
          <div className="workspace-mark">n</div>
          <div className="workspace-meta"><strong>My workspace</strong><span>Personal space</span></div>
          <button className="icon-button subtle" aria-label="Workspace options" onClick={() => setToast("Workspace settings are coming next")}><ChevronDown size={15}/></button>
        </div>
        <div className="sidebar-actions">
          <button className="nav-item" onClick={() => { setSearchOpen(true); setTimeout(() => document.getElementById("global-search")?.focus(), 30); }}><Search size={16}/><span>Search</span><kbd>⌘ K</kbd></button>
          <button className="nav-item" onClick={() => setToast("Inbox is ready for a future notification integration")}><Inbox size={16}/><span>Inbox</span></button>
          <button className="nav-item" onClick={() => chooseSection("all")}><Home size={16}/><span>Home</span></button>
        </div>
        <div className="side-label">WORKSPACE <button className="tiny-icon" aria-label="Add page" onClick={() => createNote()}><Plus size={15}/></button></div>
        <nav className="page-nav" aria-label="Workspace navigation">
          <button className={`nav-item ${section === "all" ? "selected" : ""}`} onClick={() => chooseSection("all")}><ChevronDown size={14}/><FileText size={15}/><span>Private pages</span></button>
          <PageTree pages={notes.filter(n => !n.trashed)} activeId={activeNote?.id ?? ""} expandedIds={expandedIds} onSelect={id => { setActiveId(id); setSection("all"); setMobileMenu(false); }} onToggleExpanded={id => setExpandedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; })} onCreateChild={parentId => createNote(parentId)} />
          <button className="nav-item muted-nav" onClick={() => createNote()}><Plus size={15}/><span>Add a page</span></button>
        </nav>
        <div className="side-label">PERSONAL</div>
        <nav className="page-nav">
          <button className={`nav-item ${section === "favorites" ? "selected" : ""}`} onClick={() => chooseSection("favorites")}><Star size={16}/><span>Favorites</span></button>
          <button className={`nav-item ${section === "recent" ? "selected" : ""}`} onClick={() => chooseSection("recent")}><Clock3 size={16}/><span>Recently edited</span></button>
          <button className={`nav-item ${section === "trash" ? "selected" : ""}`} onClick={() => chooseSection("trash")}><Trash2 size={16}/><span>Trash</span></button>
        </nav>
        <div className="sidebar-bottom">
          <button className="nav-item" onClick={() => setToast("Settings panel is coming next")}><Settings2 size={16}/><span>Settings</span></button>
          <div className="storage-note"><span className="status-dot"/><span>Saved on this device</span></div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumbs">
            <button className="icon-button mobile-menu-button" aria-label="Open navigation" onClick={() => setMobileMenu(true)}><PanelLeft size={17}/></button>
            <button className="icon-button desktop-sidebar-toggle" aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"} onClick={() => setSidebarOpen(v => !v)}>{sidebarOpen ? <PanelLeftClose size={17}/> : <PanelLeft size={17}/>}</button>
            <span className="crumb-muted">Private pages</span><ChevronRight size={13}/><span className="crumb-current">{activeNote?.title || (section === "trash" ? "Trash" : "Your pages")}</span>
          </div>
          <div className="topbar-actions">
            <button className="icon-button" aria-label="Toggle color theme" onClick={() => setDark(v => !v)}>{dark ? <Sun size={16}/> : <Moon size={16}/>}</button>
            <button className="icon-button" aria-label="Search pages" onClick={() => setSearchOpen(true)}><Search size={16}/></button>
            <button className="share-button" onClick={exportNotes}>Export backup <ChevronDown size={14}/></button>
            <button className="icon-button more-button" aria-label="More options" onClick={() => document.getElementById("import-file")?.click()}><MoreHorizontal size={18}/></button>
            <input id="import-file" type="file" accept="application/json,.json" hidden onChange={e => { void importNotes(e.target.files?.[0]); e.currentTarget.value = ""; }}/>
          </div>
        </header>

        {searchOpen && <div className="search-overlay" role="dialog" aria-modal="true" aria-label="Search workspace" onMouseDown={e => { if (e.target === e.currentTarget) setSearchOpen(false); }}>
          <div className="search-dialog">
            <div className="search-input-row"><Search size={18}/><input id="global-search" autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Search pages and content…" onKeyDown={e => { if(e.key === "Escape") { setSearchOpen(false); setQuery(""); } }}/><kbd>ESC</kbd><button className="icon-button" onClick={() => { setSearchOpen(false); setQuery(""); }} aria-label="Close search"><X size={16}/></button></div>
            <div className="search-results-label">{query ? `RESULTS FOR “${query}”` : "YOUR PAGES"}</div>
            {visibleNotes.length ? visibleNotes.map(note => <button className="search-result" key={note.id} onClick={() => { setActiveId(note.id); setSection(note.trashed ? "trash" : "all"); setSearchOpen(false); setQuery(""); }}><span>{note.icon}</span><span className="search-result-copy"><strong>{note.title || "Untitled"}</strong><small>{note.content.replace(/<[^>]+>/g," ").slice(0,85)}</small></span><ChevronRight size={15}/></button>) : <div className="empty-search"><SearchX size={25}/><span>No matching pages</span><small>Try another search term.</small></div>}
            <div className="search-footer"><span><kbd>↵</kbd> Open page</span><span>Searches titles and page text</span></div>
          </div>
        </div>}

        <div className="page-scroll">
          {activeNote ? <article className="document">
            <div className="page-actions-row"><div className="page-icon-large">{activeNote.icon || "📄"}</div><div className="page-actions"><span className="saved-label"><span className="status-dot"/> Saved locally</span><button className={`icon-button ${activeNote.favorite ? "is-favorite" : ""}`} onClick={toggleFavorite} aria-label={activeNote.favorite ? "Remove from favorites" : "Add to favorites"}><Star size={16} fill={activeNote.favorite ? "currentColor" : "none"}/></button><button className="icon-button" aria-label="Move page to trash" onClick={moveToTrash}><Trash2 size={16}/></button></div></div>
            <input className="document-title" value={activeNote.title} onChange={e => renameActive(e.target.value)} aria-label="Page title" placeholder="Untitled"/>
            <div className="document-meta"><span><Clock3 size={12}/> Edited {new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(activeNote.updatedAt)}</span><span className="meta-divider">·</span><span>Private</span></div>
            {section === "trash" && <div className="trash-banner"><Trash2 size={16}/> This page is in the trash. <button onClick={() => restoreNote(activeNote.id)}>Restore page</button><button className="permanent-delete" onClick={() => permanentlyDelete(activeNote.id)}>Delete permanently</button></div>}
            <div className="editor-toolbar" role="toolbar" aria-label="Text formatting">
              <button className={editor?.isActive("bold") ? "tool-active" : ""} onClick={() => editor?.chain().focus().toggleBold().run()} aria-label="Bold"><Bold size={15}/></button>
              <button className={editor?.isActive("italic") ? "tool-active" : ""} onClick={() => editor?.chain().focus().toggleItalic().run()} aria-label="Italic"><Italic size={15}/></button>
              <span className="toolbar-separator"/>
              <button className={editor?.isActive("heading", { level: 2 }) ? "tool-active" : ""} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} aria-label="Heading"><Heading2 size={16}/></button>
              <button className={editor?.isActive("bulletList") ? "tool-active" : ""} onClick={() => editor?.chain().focus().toggleBulletList().run()} aria-label="Bulleted list"><List size={16}/></button>
              <button className={editor?.isActive("orderedList") ? "tool-active" : ""} onClick={() => editor?.chain().focus().toggleOrderedList().run()} aria-label="Numbered list"><ListOrdered size={16}/></button>
              <button className={editor?.isActive("taskList") ? "tool-active" : ""} onClick={() => editor?.chain().focus().toggleTaskList().run()} aria-label="Checklist"><CheckSquare size={15}/></button>
              <button className={editor?.isActive("blockquote") ? "tool-active" : ""} onClick={() => editor?.chain().focus().toggleBlockquote().run()} aria-label="Quote"><Quote size={15}/></button>
            </div>
            <div className="editor-area" ref={editorAreaRef}>
              <EditorContent editor={editor}/>
              {slashMenu && filteredSlashCommands.length > 0 && <div className="slash-command-menu" role="listbox" aria-label="Slash commands" style={{ left: slashMenu.left, top: slashMenu.top }}>
                {filteredSlashCommands.map((command, index) => <button key={command.id} type="button" role="option" aria-selected={slashMenu.selectedIndex === index} className={`slash-command-option ${slashMenu.selectedIndex === index ? "selected" : ""}`} onMouseDown={event => event.preventDefault()} onClick={() => executeSlashCommand(command.id)}>
                  <span className="slash-command-glyph">{command.id === "heading1" ? "H1" : command.id === "heading2" ? "H2" : command.id === "heading3" ? "H3" : command.id === "bulletList" ? "•" : command.id === "orderedList" ? "1." : command.id === "taskList" ? "☑" : command.id === "quote" ? "“" : command.id === "codeBlock" ? "</>" : command.id === "divider" ? "—" : "T"}</span>
                  <span className="slash-command-copy"><strong>{command.label}</strong><small>{command.description}</small></span>
                  {slashMenu.selectedIndex === index && <kbd>↵</kbd>}
                </button>)}
              </div>}
              {slashMenu && filteredSlashCommands.length === 0 && <div className="slash-command-menu slash-command-empty" style={{ left: slashMenu.left, top: slashMenu.top }}>No matching commands</div>}
            </div>
            <div className="document-end"><span>✳</span><span>Made for your thoughts.</span></div>
          </article> : <div className="empty-state"><div className="empty-state-icon">{section === "trash" ? "🗑️" : "✳️"}</div><h2>{section === "trash" ? "Trash is empty" : "A little room to think"}</h2><p>{section === "trash" ? "Deleted pages will show up here." : "Create a page and start capturing your ideas."}</p>{section !== "trash" && <button className="primary-button" onClick={() => createNote()}><Plus size={16}/> Create a page</button>}</div>}
        </div>
        <footer className="statusbar"><div><span className="status-dot"/>{notes.filter(n => !n.trashed).length} pages <span className="status-separator">·</span> Local workspace</div><div className="status-shortcuts"><span><Command size={11}/> K to search</span><span><BookOpen size={12}/> Your space, your rules</span></div></footer>
      </main>
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

export default App;