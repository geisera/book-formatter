# Book Formatter

Local-first book formatting application, built with Next.js, React, TypeScript,
direct ProseMirror and Dexie/IndexedDB. No account, cloud database, analytics or
manuscript upload is used by the foundation.

## Run

Node.js 24 or newer. `npm ci`, then `npm run dev`.
`npm run build` produces a static application in `out/`.
Deploy with Vercel's Next.js preset or serve `out/` over HTTPS.
Offline installation requires HTTPS (localhost is allowed for development).
The managed preview launcher serves the production build, so build before previewing.

## Foundation implemented

- Local bookshelf; book creation and independent chapter documents.
- Paragraphs, headings, scene breaks, bold, italic, undo/redo and keyboard shortcuts.
- Transactional IndexedDB autosave with revision-based conflict protection.
- Offline app shell and manifest. Wait for “Offline app ready” before disconnecting.
- ZIP backup/restore; restore duplicates rather than overwrites a book.
- Versioned semantic schema, bounded backup extraction and schema validation.
- Storage persistence request, capacity warning, save errors and unsaved-close warning.

Browser storage is not encrypted or permanent. Keep independent backups.
If saving fails, download a backup before reloading. A conflicting tab never
silently overwrites the committed database copy. Schema changes need explicit
Dexie migrations; version 1 is the initial baseline.

## Verification

`npm run typecheck`, `npm test`, `npm run build`.
`npx playwright install chromium` then `npm run test:e2e` verifies two-chapter
editing, offline tab restart, and backup restore into a fresh browser context.
GitHub Actions runs all of these checks on pushes and pull requests.

## Backup v1

A `.book.zip` includes `manifest.json` (`format: book-formatter`, `version: 1`)
and `manuscript.json` (book metadata, schema version, revision, stable section IDs,
and ProseMirror chapter JSON). Restore regenerates identities for an independent
copy. Foundation limit: 20 MB compressed, 50 MB expanded. No binary assets or
edition settings exist yet; those require a versioned format extension.

## Scope

This is the first foundation slice, **not completed PRD Milestone 1**.
See [the baseline PRD](docs/PRD.md). Remaining M1 work: DOCX/Markdown import,
one design template, local EPUB export and EPUBCheck, full-length novel benchmarks,
PDF feasibility/quality proof, and broader interruption/quota/browser tests.
Full PWA installation compatibility, including raster icons on browsers requiring
them, needs a cross-browser pass. No publication-ready exports are claimed.

No project source license has been selected. Third-party license records are
in `docs/dependency-licenses.json`; commercial licensing review remains required.
