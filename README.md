# Notion — Local-First Workspace

A clean, responsive workspace for notes and ideas. The core application is designed to run locally in the browser without a paid API or a required application server.

> **Status:** active early implementation. The app includes rich-text editing, nested pages, slash commands, browser-local persistence, search, favorites, recently edited pages, trash, JSON backup import/export, themes, keyboard shortcuts, and automated CI. It is not yet a production-ready Notion replacement.

## Features

- **Rich-text pages:** headings, bold, italic, ordered and unordered lists, interactive task checklists, editable inline tables, image blocks from HTTPS URLs or local raster uploads (512 KB limit), blockquotes, plus a searchable `/` command menu for text, headings, lists, checklists, tables, images, quotes, code blocks, and dividers via Tiptap.
- **Nested pages:** create subpages from any page row, expand or collapse page branches, and retain parent/child relationships in backups.
- **Page identity:** choose from a built-in emoji icon palette to make pages easier to recognize.
- **Duplicate pages:** duplicate any active page or database into an independent record, retaining nested-page placement and deep-copying database rows and property definitions.
- **Local databases:** create structured database pages with custom text, status, select, date, number, and checkbox properties; add/remove rows and properties, rename properties by double-clicking their headers, filter and sort table views, and switch to a status-grouped board. Database cells are included in workspace search and JSON backups.
- **Local persistence:** page content is stored in this browser's local storage. There is no account or cloud sync.
- **Installable offline app:** includes a web app manifest and service worker that caches the app shell and visited static assets, allowing the workspace to reopen offline after its first successful load on a supported browser. Installation and service workers require a secure context (HTTPS, or localhost for development).
- **Workspace navigation:** pages, favorites, recently edited pages, and trash.
- **Search:** search page titles and editor text.
- **Backups:** export all workspace data to JSON and import a validated backup.
- **Appearance:** light and dark themes, responsive sidebar, and mobile navigation.
- **Keyboard shortcuts:** `Ctrl/Cmd + K` opens search; `Ctrl/Cmd + N` creates a page when focus is not in a text-editing field; use the arrow keys and `Enter`/`Tab` to navigate slash commands.
- **Automated checks:** unit tests cover backup validation, structured database data, database-cell search, and safe duplication; GitHub Actions reports dependency advisories, runs tests, and builds production bundles with separate React/editor chunks.

## Requirements

- Node.js 22 or newer
- npm

## Run locally

```bash
npm install
npm run dev
```

Open the local URL printed by Vite.

## Validate

```bash
npm test
npm run build
npm run preview
```

## Data, privacy, and backups

- Notes stay in the browser profile where they were created.
- Clearing site data or using another browser/device can make local notes unavailable. Offline app-shell caching does not sync or back up note data by itself.
- Export regular JSON backups using **Export backup**.
- Import merges pages by ID; records with duplicate IDs, malformed fields, or cyclic parent/child relationships within one backup are rejected.
- No synchronization or end-to-end encrypted cloud backup is implemented yet.

## Current limitations

- Database features are intentionally focused: no formulas, relations, rollups, aggregations, calendar views, or per-view filters yet. Inline editor tables are document content; database pages are separate structured data.
- No multi-device sync, user accounts, collaboration, or server-side storage.
- Browser local storage has limited capacity and is not a substitute for a durable database for large workspaces.
- Accessibility, browser compatibility, security review, dependency auditing, and end-to-end tests still need further work before production use.

## Architecture

- React 18 + TypeScript
- Vite
- Tiptap / ProseMirror
- Lucide icons
- Vitest

The core app has no required paid service or API. Google Fonts are currently loaded by the stylesheet when network access is available; system fonts remain fallback options.
