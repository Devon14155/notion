import { useEffect, useMemo, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extensions";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Table, TableRow, TableHeader, TableCell } from "@tiptap/extension-table";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import { duplicateWorkspaceNote, mergeWorkspaceNotes, parseWorkspaceBackup, searchNotes, type WorkspaceDatabase } from "./lib/workspace";
import { loadPersistedWorkspace, savePersistedWorkspace, type StorageBackend } from "./lib/persistence";
import DatabaseView from "./components/DatabaseView";
import PageTree from "./components/PageTree";
import {
  Search, Plus, ChevronDown, ChevronRight, Home, Inbox, Settings2,
  PanelLeftClose, PanelLeft, FileText, Star, Clock3, Trash2, MoreHorizontal,
  CheckSquare, CalendarDays, LayoutGrid, BookOpen, Command, Sun, Moon,
  Bold, Italic, List, ListOrdered, Heading2, Quote, SearchX, X, Table2, Copy, ImagePlus, Link2, ExternalLink, Download, Upload, Undo2, Redo2, Code2, Minus
} from "lucide-react";

type Note = {
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

const slashCommands = [
  { id: "text", label: "Text", description: "Start with plain text", keywords: "paragraph normal" },
  { id: "heading1", label: "Heading 1", description: "A large section heading", keywords: "title h1" },
  { id: "heading2", label: "Heading 2", description: "A medium section heading", keywords: "h2" },
  { id: "heading3", label: "Heading 3", description: "A small section heading", keywords: "h3" },
  { id: "bulletList", label: "Bulleted list", description: "Create a simple list", keywords: "unordered bullets" },
  { id: "orderedList", label: "Numbered list", description: "Create a numbered list", keywords: "ordered numbers" },
  { id: "taskList", label: "Checklist", description: "Add tasks you can check off", keywords: "todo tasks checkbox to do" },
  { id: "table", label: "Table", description: "Insert an editable 3 × 3 table", keywords: "grid rows columns database" },
  { id: "image", label: "Image", description: "Insert an image from a URL", keywords: "picture photo illustration media" },
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

const pageIcons = ["📄", "✳️", "📝", "💡", "📚", "✅", "🎯", "🗓️", "💼", "🧠", "⭐", "🚀", "🌱", "🎨", "🔬", "💻", "📌", "❤️", "📈", "🧪", "🏠", "🎓", "🛠️", "🌍"];

const STORAGE_KEY = "notion-workspace-notes-v1";
const starterNotes: Note[] = [
  { id: "welcome", title: "Welcome to your workspace", content: "<h2>A calmer place to think.</h2><p>This is your personal workspace. Create pages, capture ideas, and organize your work — with your content saved locally in this browser.</p><h2>Make it yours</h2><ul><li>Rename this page by editing its title.</li><li>Use the toolbar to format text.</li><li>Create a page from the sidebar with the <strong>New page</strong> button.</li><li>Star important pages to find them quickly.</li></ul><blockquote><p>Your workspace should work for you, not the other way around.</p></blockquote>", updatedAt: Date.now(), favorite: true, icon: "✳️" },
  { id: "ideas", title: "Ideas & inspiration", content: "<h2>Ideas worth exploring</h2><p>Keep loose thoughts here before they become plans.</p><ul><li>Build a personal knowledge garden</li><li>Make space for deep work</li><li>Capture first, organize later</li></ul>", updatedAt: Date.now() - 3600000, favorite: false, icon: "💡" },
  { id: "weekly", title: "Weekly planning", content: "<h2>This week</h2><p>Choose a few meaningful outcomes instead of an endless list.</p><ul><li>Review priorities</li><li>Break one large task into small steps</li><li>Leave room to think</li></ul>", updatedAt: Date.now() - 86400000, favorite: false, icon: "🗓️" }
];

function notePreview(note: Note): string {
  if (note.kind === "database" && note.database) {
    const preview = note.database.rows.slice(0, 3).map((row) => note.database!.properties.map((property) => {
      const value = row.cells[property.id];
      return value === null || value === undefined || value === false ? "" : String(value);
    }).filter(Boolean).join(" · ")).filter(Boolean).join(" — ");
    return preview.slice(0, 85) || "Structured database";
  }
  return note.content.replace(/<[^>]+>/g, " ").replace(/\\s+/g, " ").trim().slice(0, 85);
}

function loadNotes(): Note[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return starterNotes;
    return parseWorkspaceBackup(raw) as Note[];
  } catch (error) {
    console.error("Could not load local workspace data", error);
  }
  return starterNotes;
}

function App() {
  const [notes, setNotes] = useState<Note[]>(loadNotes);
  const [storageReady, setStorageReady] = useState(false);
  const [storageBackend, setStorageBackend] = useState<StorageBackend>("indexeddb");
  const previousBackendRef = useRef<StorageBackend>("indexeddb");
  const latestNotesRef = useRef<Note[]>(notes);
  const storageReadyRef = useRef(false);
  const [activeId, setActiveId] = useState("welcome");
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem("notion-workspace-theme-v1") === "dark"; }
    catch { return false; }
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [section, setSection] = useState<"all" | "favorites" | "recent" | "trash">("all");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [slashMenu, setSlashMenu] = useState<SlashMenuState | null>(null);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [pageLinkPickerOpen, setPageLinkPickerOpen] = useState(false);
  const [pageLinkQuery, setPageLinkQuery] = useState("");
  const slashMenuRef = useRef<SlashMenuState | null>(null);
  const editorAreaRef = useRef<HTMLDivElement>(null);
  const imageFileInputRef = useRef<HTMLInputElement>(null);
  const [toast, setToast] = useState("");

  useEffect(() => {
    try { localStorage.setItem("notion-workspace-theme-v1", dark ? "dark" : "light"); }
    catch (error) { console.warn("Could not save the theme preference.", error); }
  }, [dark]);

  useEffect(() => {
    let cancelled = false;
    void loadPersistedWorkspace().then((snapshot) => {
      if (cancelled) return;
      if (snapshot.notes) setNotes(snapshot.notes as Note[]);
      setStorageBackend(snapshot.backend);
      previousBackendRef.current = snapshot.backend;
      latestNotesRef.current = (snapshot.notes ?? notes) as Note[];
      storageReadyRef.current = true;
      setStorageReady(true);
      if (snapshot.backend === "localStorage") {
        setToast("Using limited browser storage. Export backups regularly.");
      }
    }).catch((error: unknown) => {
      if (cancelled) return;
      console.error("Could not hydrate workspace data", error);
      setStorageBackend("localStorage");
      previousBackendRef.current = "localStorage";
      storageReadyRef.current = true;
      setStorageReady(true);
      setToast("Workspace storage is limited. Export a JSON backup regularly.");
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    latestNotesRef.current = notes;
  }, [notes]);

  useEffect(() => {
    if (!storageReady) return;
    const timer = window.setTimeout(() => {
      void savePersistedWorkspace(notes).then((backend) => {
        setStorageBackend(backend);
        if (backend !== previousBackendRef.current) {
          previousBackendRef.current = backend;
          if (backend === "localStorage") {
            setToast("IndexedDB is unavailable. Using limited browser storage; export backups regularly.");
          }
        }
      }).catch((error: unknown) => {
        console.error("Could not persist workspace data", error);
        setToast("Workspace could not be saved. Export a JSON backup and remove large items.");
      });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [notes, storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    const flushOnPageHide = () => {
      void savePersistedWorkspace(latestNotesRef.current).catch((error: unknown) => {
        console.error("Could not flush the workspace before closing", error);
      });
    };
    window.addEventListener("pagehide", flushOnPageHide);
    return () => window.removeEventListener("pagehide", flushOnPageHide);
  }, [storageReady]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!settingsOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSettingsOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [settingsOpen]);

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
    shouldRerenderOnTransaction: true,
    extensions: [StarterKit, TaskList, TaskItem.configure({ nested: true }), Table.configure({ resizable: true }), TableRow, TableHeader, TableCell, Image.configure({ allowBase64: true, HTMLAttributes: { class: "page-image", loading: "lazy" } }), Link.configure({ openOnClick: false, autolink: true, defaultProtocol: "https", HTMLAttributes: { target: "_blank", rel: "noopener noreferrer nofollow" } }), Placeholder.configure({ placeholder: "Start writing, or type / for commands…" })],
    content: activeNote?.content ?? "",
    onUpdate: ({ editor: current }) => {
      const content = current.getHTML();
      setNotes((prev) => prev.map((n) => n.id === activeId ? { ...n, content, updatedAt: Date.now() } : n));
      updateSlashMenu(current);
    },
    onSelectionUpdate: ({ editor: current }) => updateSlashMenu(current),
    editorProps: {
      attributes: { class: "tiptap", "aria-label": "Page content editor" },
      handleClick: (_view, _position, event) => {
        const target = event.target;
        if (!(target instanceof Element)) return false;
        const anchor = target.closest<HTMLAnchorElement>("a[href]");
        const href = anchor?.getAttribute("href") ?? "";
        if (!href.startsWith("#page=")) return false;
        let pageId = "";
        try { pageId = decodeURIComponent(href.slice(6)); } catch { return false; }
        if (!pageId || !latestNotesRef.current.some((note) => note.id === pageId && !note.trashed)) return false;
        event.preventDefault();
        setActiveId(pageId);
        setSection("all");
        setMobileMenu(false);
        setPageLinkPickerOpen(false);
        return true;
      },
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
    setIconPickerOpen(false);
    setPageLinkPickerOpen(false);
    setPageLinkQuery("");
    if (editor && activeNote) {
      const current = editor.getHTML();
      if (current !== activeNote.content) editor.commands.setContent(activeNote.content || "");
    }
  }, [activeId, editor]);

  const insertExternalLink = () => {
    if (!editor) return;
    const input = window.prompt("Paste an HTTPS or HTTP web address");
    if (!input?.trim()) return;
    let parsed: URL;
    try {
      parsed = new URL(input.trim());
    } catch {
      setToast("Enter a valid web address.");
      return;
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      setToast("Links must use HTTP or HTTPS.");
      return;
    }
    if (editor.state.selection.empty) {
      editor.chain().focus().insertContent({
        type: "text",
        text: parsed.toString(),
        marks: [{ type: "link", attrs: { href: parsed.toString() } }]
      }).run();
    } else {
      editor.chain().focus().setLink({ href: parsed.toString() }).run();
    }
    setPageLinkPickerOpen(false);
  };

  const insertPageLink = (targetPage: Note) => {
    if (!editor) return;
    const href = `#page=${encodeURIComponent(targetPage.id)}`;
    if (editor.state.selection.empty) {
      editor.chain().focus().insertContent({
        type: "text",
        text: targetPage.title.trim() || "Untitled",
        marks: [{ type: "link", attrs: { href } }]
      }).run();
    } else {
      editor.chain().focus().setLink({ href }).run();
    }
    setPageLinkPickerOpen(false);
    setPageLinkQuery("");
    setToast(`Linked to ${targetPage.title.trim() || "Untitled"}`);
  };

  const insertImageFromUrl = () => {
    if (!editor) return;
    const input = window.prompt("Paste an HTTPS image URL");
    if (!input?.trim()) return;
    let parsed: URL;
    try {
      parsed = new URL(input.trim());
    } catch {
      setToast("Enter a valid HTTPS image URL.");
      return;
    }
    if (parsed.protocol !== "https:") {
      setToast("For safety, image URLs must use HTTPS.");
      return;
    }
    editor.chain().focus().insertContent({
      type: "image",
      attrs: { src: parsed.toString(), alt: "" }
    }).run();
  };

  const handleImageFile = (file?: File) => {
    if (!file) return;
    const allowedTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
    if (!allowedTypes.has(file.type)) {
      setToast("Choose a PNG, JPEG, WebP, or GIF image.");
      return;
    }
    const maxBytes = 512 * 1024;
    if (file.size > maxBytes) {
      setToast("Images must be 512 KB or smaller to protect local storage.");
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => setToast("Could not read that image file.");
    reader.onload = () => {
      if (typeof reader.result !== "string" || !editor) {
        setToast("Could not insert that image.");
        return;
      }
      editor.chain().focus().insertContent({
        type: "image",
        attrs: { src: reader.result, alt: file.name.replace(/\\.[^.]+$/, "").slice(0, 120) }
      }).run();
      setToast("Image inserted and saved locally");
    };
    reader.readAsDataURL(file);
  };

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
      case "table": chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(); break;
      case "image": chain.run(); insertImageFromUrl(); break;
      case "quote": chain.toggleBlockquote().run(); break;
      case "codeBlock": chain.setCodeBlock().run(); break;
      case "divider": chain.setHorizontalRule().run(); break;
    }
  };

  const duplicateActive = () => {
    if (!activeNote) return;
    const duplicate = duplicateWorkspaceNote(activeNote, crypto.randomUUID(), Date.now()) as Note;
    setNotes((prev) => [duplicate, ...prev]);
    setActiveId(duplicate.id);
    setSection("all");
    setQuery("");
    if (duplicate.parentId) setExpandedIds((prev) => new Set(prev).add(duplicate.parentId!));
    if (window.innerWidth < 760) setMobileMenu(false);
    setToast(activeNote.kind === "database" ? "Database duplicated" : "Page duplicated");
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

  const createDatabase = () => {
    const note: Note = {
      id: crypto.randomUUID(),
      title: "Untitled database",
      content: "<p></p>",
      updatedAt: Date.now(),
      favorite: false,
      icon: "🗃️",
      kind: "database",
      database: {
        view: "table",
        properties: [
          { id: "name", name: "Name", type: "text" },
          { id: "status", name: "Status", type: "status", options: ["Not started", "In progress", "Done"] }
        ],
        rows: []
      }
    };
    setNotes((prev) => [note, ...prev]);
    setActiveId(note.id);
    setSection("all");
    setQuery("");
    setToast("Database created");
    if (window.innerWidth < 760) setMobileMenu(false);
  };

  const updateActiveDatabase = (database: WorkspaceDatabase) => {
    if (!activeNote) return;
    const id = activeNote.id;
    setNotes((prev) => prev.map((note) => note.id === id
      ? { ...note, kind: "database", database, updatedAt: Date.now() }
      : note));
  };

  const renameActive = (title: string) => {
    if (!activeNote) return;
    setNotes((prev) => prev.map((n) => n.id === activeNote.id ? { ...n, title, updatedAt: Date.now() } : n));
  };

  const choosePageIcon = (icon: string) => {
    if (!activeNote) return;
    const id = activeNote.id;
    setNotes((prev) => prev.map((n) => n.id === id ? { ...n, icon, updatedAt: Date.now() } : n));
    setIconPickerOpen(false);
    setToast("Page icon updated");
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
      setNotes((prev) => mergeWorkspaceNotes(prev, incoming) as Note[]);
      setToast("Backup imported");
    } catch { setToast("Could not import: invalid backup file"); }
  };

  const chooseSection = (value: typeof section) => { setSection(value); setQuery(""); if (value === "trash") { setActiveId(notes.find(n => n.trashed)?.id ?? ""); } else if (value === "favorites") { setActiveId(notes.find(n => n.favorite && !n.trashed)?.id ?? ""); } else { setActiveId(notes.find(n => !n.trashed)?.id ?? ""); } };

  const filteredSlashCommands = slashMenu ? slashCommands.filter((command) => (command.label + " " + command.keywords).toLowerCase().includes(slashMenu.query)) : [];
  const linkablePages = notes.filter((note) => !note.trashed && note.id !== activeNote?.id && (note.title || "Untitled").toLocaleLowerCase().includes(pageLinkQuery.trim().toLocaleLowerCase())).slice(0, 30);

  if (!storageReady) {
    return <div className="workspace-loading" role="status" aria-live="polite"><span className="workspace-loading-mark">✳</span><strong>Opening your workspace</strong><span>Reading your locally saved pages…</span></div>;
  }

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
          <button className="nav-item muted-nav" onClick={createDatabase}><Table2 size={15}/><span>Add a database</span></button>
        </nav>
        <div className="side-label">PERSONAL</div>
        <nav className="page-nav">
          <button className={`nav-item ${section === "favorites" ? "selected" : ""}`} onClick={() => chooseSection("favorites")}><Star size={16}/><span>Favorites</span></button>
          <button className={`nav-item ${section === "recent" ? "selected" : ""}`} onClick={() => chooseSection("recent")}><Clock3 size={16}/><span>Recently edited</span></button>
          <button className={`nav-item ${section === "trash" ? "selected" : ""}`} onClick={() => chooseSection("trash")}><Trash2 size={16}/><span>Trash</span></button>
        </nav>
        <div className="sidebar-bottom">
          <button className="nav-item" onClick={() => setSettingsOpen(true)}><Settings2 size={16}/><span>Settings</span></button>
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
            {visibleNotes.length ? visibleNotes.map(note => <button className="search-result" key={note.id} onClick={() => { setActiveId(note.id); setSection(note.trashed ? "trash" : "all"); setSearchOpen(false); setQuery(""); }}><span>{note.icon}</span><span className="search-result-copy"><strong>{note.title || "Untitled"}</strong><small>{notePreview(note)}</small></span><ChevronRight size={15}/></button>) : <div className="empty-search"><SearchX size={25}/><span>No matching pages</span><small>Try another search term.</small></div>}
            <div className="search-footer"><span><kbd>↵</kbd> Open page</span><span>Searches titles and page text</span></div>
          </div>
        </div>}

        {settingsOpen && <div className="settings-overlay" role="dialog" aria-modal="true" aria-labelledby="settings-title" onMouseDown={(event) => { if (event.target === event.currentTarget) setSettingsOpen(false); }}>
          <section className="settings-dialog">
            <header className="settings-header">
              <div><h2 id="settings-title">Settings</h2><p>Make this workspace feel like yours.</p></div>
              <button className="icon-button" aria-label="Close settings" autoFocus onClick={() => setSettingsOpen(false)}><X size={17}/></button>
            </header>
            <div className="settings-body">
              <section className="settings-section">
                <div><h3>Appearance</h3><p>Choose your preferred theme. This setting stays on this device.</p></div>
                <div className="settings-theme-options" role="group" aria-label="Color theme">
                  <button className={!dark ? "selected" : ""} aria-pressed={!dark} onClick={() => setDark(false)}><Sun size={18}/><span>Light</span>{!dark && <CheckSquare size={15}/>}</button>
                  <button className={dark ? "selected" : ""} aria-pressed={dark} onClick={() => setDark(true)}><Moon size={18}/><span>Dark</span>{dark && <CheckSquare size={15}/>}</button>
                </div>
              </section>
              <section className="settings-section">
                <div><h3>Data and storage</h3><p>Your notes stay in this browser profile. This app does not send page content to a server.</p></div>
                <div className="settings-storage-status"><span className="status-dot"/><span>Current storage: <strong>{storageBackend === "indexeddb" ? "IndexedDB on this device" : "Browser localStorage fallback"}</strong></span></div>
                <p className="settings-hint">There is no account or sync yet. Export backups regularly, especially before clearing browser data or changing devices.</p>
                <div className="settings-actions">
                  <button className="database-action-button primary" onClick={exportNotes}><Download size={14}/> Export workspace backup</button>
                  <button className="database-action-button" onClick={() => document.getElementById("import-file")?.click()}><Upload size={14}/> Import backup</button>
                </div>
              </section>
              <section className="settings-section">
                <div><h3>Keyboard shortcuts</h3><p>Faster ways to move around and write.</p></div>
                <div className="settings-shortcuts">
                  <div><span>Open workspace search</span><kbd>Ctrl / ⌘ K</kbd></div>
                  <div><span>Undo editor change</span><kbd>Ctrl / ⌘ Z</kbd></div>
                  <div><span>Redo editor change</span><kbd>Ctrl / ⌘ Shift Z</kbd></div>
                  <div><span>Create a page</span><kbd>Ctrl / ⌘ N</kbd></div>
                  <div><span>Open editor commands</span><kbd>/</kbd></div>
                  <div><span>Close a menu</span><kbd>Esc</kbd></div>
                </div>
              </section>
            </div>
            <footer className="settings-footer"><span>Local-first by design</span><button className="database-action-button" onClick={() => setSettingsOpen(false)}>Done</button></footer>
          </section>
        </div>}
        <div className="page-scroll">
          {activeNote ? (activeNote.kind === "database" && activeNote.database && section !== "trash" ? <DatabaseView title={activeNote.title} icon={activeNote.icon} onIconChange={choosePageIcon} favorite={activeNote.favorite} updatedAt={activeNote.updatedAt} database={activeNote.database} onRename={renameActive} onDatabaseChange={updateActiveDatabase} onToggleFavorite={toggleFavorite} onDuplicate={duplicateActive} onTrash={moveToTrash} /> : <article className="document">
            <div className="page-actions-row"><div className="page-icon-picker-wrap"><button type="button" className="page-icon-large page-icon-picker-trigger" aria-label="Change page icon" aria-expanded={iconPickerOpen} onClick={() => setIconPickerOpen(value => !value)}>{activeNote.icon || "📄"}</button>{iconPickerOpen && <div className="page-icon-picker" role="group" aria-label="Choose page icon">{pageIcons.map(icon => <button key={icon} type="button" className={activeNote.icon === icon ? "chosen" : ""} aria-label={`Use ${icon} as page icon`} onClick={() => choosePageIcon(icon)}>{icon}</button>)}</div>}</div><div className="page-actions"><span className="saved-label"><span className="status-dot"/> {storageBackend === "indexeddb" ? "Saved on this device" : "Saved in browser storage"}</span><button className={`icon-button ${activeNote.favorite ? "is-favorite" : ""}`} onClick={toggleFavorite} aria-label={activeNote.favorite ? "Remove from favorites" : "Add to favorites"}><Star size={16} fill={activeNote.favorite ? "currentColor" : "none"}/></button>{section !== "trash" && <button className="icon-button" onClick={duplicateActive} aria-label="Duplicate page" title="Duplicate page"><Copy size={15}/></button>}<button className="icon-button" aria-label="Move page to trash" onClick={moveToTrash}><Trash2 size={16}/></button></div></div>
            <input className="document-title" value={activeNote.title} onChange={e => renameActive(e.target.value)} aria-label="Page title" placeholder="Untitled"/>
            <div className="document-meta"><span><Clock3 size={12}/> Edited {new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(activeNote.updatedAt)}</span><span className="meta-divider">·</span><span>Private</span></div>
            {section === "trash" && <div className="trash-banner"><Trash2 size={16}/> This page is in the trash. <button onClick={() => restoreNote(activeNote.id)}>Restore page</button><button className="permanent-delete" onClick={() => permanentlyDelete(activeNote.id)}>Delete permanently</button></div>}
            <div className="editor-toolbar" role="toolbar" aria-label="Text formatting">
              <button type="button" className="editor-history-button" disabled={!editor?.can().chain().focus().undo().run()} onClick={() => editor?.chain().focus().undo().run()} aria-label="Undo" title="Undo (Ctrl/⌘ Z)"><Undo2 size={15}/></button>
              <button type="button" className="editor-history-button" disabled={!editor?.can().chain().focus().redo().run()} onClick={() => editor?.chain().focus().redo().run()} aria-label="Redo" title="Redo (Ctrl/⌘ Shift Z)"><Redo2 size={15}/></button>
              <span className="toolbar-separator"/>
              <button className={editor?.isActive("bold") ? "tool-active" : ""} onClick={() => editor?.chain().focus().toggleBold().run()} aria-label="Bold"><Bold size={15}/></button>
              <button className={editor?.isActive("italic") ? "tool-active" : ""} onClick={() => editor?.chain().focus().toggleItalic().run()} aria-label="Italic"><Italic size={15}/></button>
              <span className="toolbar-separator"/>
              <button className={editor?.isActive("heading", { level: 2 }) ? "tool-active" : ""} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} aria-label="Heading"><Heading2 size={16}/></button>
              <button className={editor?.isActive("bulletList") ? "tool-active" : ""} onClick={() => editor?.chain().focus().toggleBulletList().run()} aria-label="Bulleted list"><List size={16}/></button>
              <button className={editor?.isActive("orderedList") ? "tool-active" : ""} onClick={() => editor?.chain().focus().toggleOrderedList().run()} aria-label="Numbered list"><ListOrdered size={16}/></button>
              <button className={editor?.isActive("taskList") ? "tool-active" : ""} onClick={() => editor?.chain().focus().toggleTaskList().run()} aria-label="Checklist"><CheckSquare size={15}/></button>
              <button className={editor?.isActive("table") ? "tool-active" : ""} onClick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} aria-label="Insert table"><Table2 size={15}/></button>
              <button type="button" onClick={() => imageFileInputRef.current?.click()} aria-label="Insert local image" title="Insert local image (512 KB max)"><ImagePlus size={15}/></button>
              <input ref={imageFileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(event) => { handleImageFile(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} />
              <div className="page-link-picker-wrap">
                <button type="button" className={pageLinkPickerOpen || editor?.isActive("link") ? "tool-active" : ""} aria-label="Insert link" aria-expanded={pageLinkPickerOpen} onClick={() => { setPageLinkPickerOpen((value) => !value); setPageLinkQuery(""); }}><Link2 size={15}/></button>
                {pageLinkPickerOpen && <div className="page-link-picker" role="dialog" aria-label="Insert link">
                  <label className="page-link-search"><Search size={14}/><input autoFocus value={pageLinkQuery} onChange={(event) => setPageLinkQuery(event.target.value)} placeholder="Find a page…" aria-label="Find a page to link"/></label>
                  <button className="page-link-external" onMouseDown={(event) => event.preventDefault()} onClick={insertExternalLink}><ExternalLink size={14}/><span>Link to web address…</span></button>
                  <div className="page-link-options">
                    {linkablePages.map((page) => <button key={page.id} onMouseDown={(event) => event.preventDefault()} onClick={() => insertPageLink(page)}><span className="page-link-picker-icon">{page.icon || "📄"}</span><span className="page-link-picker-copy"><strong>{page.title || "Untitled"}</strong><small>{page.kind === "database" ? "Database" : page.parentId ? "Subpage" : "Page"}</small></span></button>)}
                    {linkablePages.length === 0 && <p>{pageLinkQuery ? "No matching pages." : "Create another page to link to it."}</p>}
                  </div>
                </div>}
              </div>
              <button className={editor?.isActive("blockquote") ? "tool-active" : ""} onClick={() => editor?.chain().focus().toggleBlockquote().run()} aria-label="Quote"><Quote size={15}/></button>
              <button className={editor?.isActive("codeBlock") ? "tool-active" : ""} onClick={() => editor?.chain().focus().toggleCodeBlock().run()} aria-label="Code block" title="Code block"><Code2 size={15}/></button>
              <button type="button" onClick={() => editor?.chain().focus().setHorizontalRule().run()} aria-label="Insert divider" title="Insert divider"><Minus size={15}/></button>
            </div>
            <div className="editor-area" ref={editorAreaRef}>
              <EditorContent editor={editor}/>
              {slashMenu && filteredSlashCommands.length > 0 && <div className="slash-command-menu" role="listbox" aria-label="Slash commands" style={{ left: slashMenu.left, top: slashMenu.top }}>
                {filteredSlashCommands.map((command, index) => <button key={command.id} type="button" role="option" aria-selected={slashMenu.selectedIndex === index} className={`slash-command-option ${slashMenu.selectedIndex === index ? "selected" : ""}`} onMouseDown={event => event.preventDefault()} onClick={() => executeSlashCommand(command.id)}>
                  <span className="slash-command-glyph">{command.id === "heading1" ? "H1" : command.id === "heading2" ? "H2" : command.id === "heading3" ? "H3" : command.id === "bulletList" ? "•" : command.id === "orderedList" ? "1." : command.id === "taskList" ? "☑" : command.id === "table" ? "▦" : command.id === "image" ? "▧" : command.id === "quote" ? "“" : command.id === "codeBlock" ? "</>" : command.id === "divider" ? "—" : "T"}</span>
                  <span className="slash-command-copy"><strong>{command.label}</strong><small>{command.description}</small></span>
                  {slashMenu.selectedIndex === index && <kbd>↵</kbd>}
                </button>)}
              </div>}
              {slashMenu && filteredSlashCommands.length === 0 && <div className="slash-command-menu slash-command-empty" style={{ left: slashMenu.left, top: slashMenu.top }}>No matching commands</div>}
            </div>
            <div className="document-end"><span>✳</span><span>Made for your thoughts.</span></div>
          </article>) : <div className="empty-state"><div className="empty-state-icon">{section === "trash" ? "🗑️" : "✳️"}</div><h2>{section === "trash" ? "Trash is empty" : "A little room to think"}</h2><p>{section === "trash" ? "Deleted pages will show up here." : "Create a page and start capturing your ideas."}</p>{section !== "trash" && <button className="primary-button" onClick={() => createNote()}><Plus size={16}/> Create a page</button>}</div>}
        </div>
        <footer className="statusbar"><div><span className="status-dot"/>{notes.filter(n => !n.trashed).length} pages <span className="status-separator">·</span> Local workspace</div><div className="status-shortcuts"><span><Command size={11}/> K to search</span><span><BookOpen size={12}/> Your space, your rules</span></div></footer>
      </main>
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

export default App;