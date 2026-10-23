# Notion — Local-First Workspace

A clean, responsive workspace for notes and ideas. The core application is designed to run locally in the browser without a paid API or a required application server.

> **Status:** early implementation. The current version includes page editing, browser-local persistence, search, favorites, recently edited pages, trash, JSON backup import/export, themes, keyboard shortcuts, and an initial CI workflow. It is not yet a production-ready Notion replacement.

## Features

- **Rich-text pages:** headings, bold, italic, ordered and unordered lists, and blockquotes via Tiptap.
- **Local persistence:** page content is stored in this browser's local storage. There is no account or cloud sync.
- **Workspace navigation:** pages, favorites, recently edited pages, and trash.
- **Search:** search page titles and editor text.
- **Backups:** export all workspace data to JSON and import a validated backup.
- **Appearance:** light and dark themes, responsive sidebar, and mobile navigation.
- **Keyboard shortcuts:** `Ctrl/Cmd + K` opens search; `Ctrl/Cmd + N` creates a page when focus is not in a text-editing field.
- **Automated checks:** unit tests cover backup validation and text search; GitHub Actions runs tests and a production build.

## Requirements

- Node.js 20 or newer
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
- Clearing site data or using another browser/device can make local notes unavailable.
- Export regular JSON backups using **Export backup**.
- Import merges pages by ID; records with duplicate IDs within one backup or malformed page records are rejected.
- No synchronization or end-to-end encrypted cloud backup is implemented yet.

## Current limitations

- No nested page hierarchy or database/table/board views yet.
- No multi-device sync, user accounts, collaboration, or server-side storage.
- Browser local storage has limited capacity and is not a substitute for a durable database for large workspaces.
- Accessibility, browser compatibility, security review, and end-to-end tests still need further work before production use.

## Architecture

- React 18 + TypeScript
- Vite
- Tiptap / ProseMirror
- Lucide icons
- Vitest

The core app has no required paid service or API. Google Fonts are currently loaded by the stylesheet when network access is available; system fonts remain fallback options.
