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
- Browser-local DOCX, Markdown and text import in a cancellable worker.
- Chapter-boundary review, renaming, conversion diagnostics and retained originals.
- ZIP backup/restore including original imports; restore duplicates existing books.
- Versioned semantic schema, bounded backup extraction and schema validation.
- Storage persistence request, capacity warning, save errors and unsaved-close warning.

Browser storage is not encrypted or permanent. Keep independent backups.
If saving fails, download a backup before reloading. A conflicting tab never
silently overwrites the committed database copy. Schema changes need explicit
Dexie migrations; version 1 is the initial baseline.

## Verification

`npm run typecheck`, `npm test`, `npm run build`.
The build bundles an offline import worker using esbuild before static export.
`npx playwright install chromium` then `npm run test:e2e` verifies two-chapter
editing, offline tab restart, and backup restore into a fresh browser context.
GitHub Actions runs all of these checks on pushes and pull requests, including
offline DOCX/Markdown import, emphasis/scene breaks, invalid file retry, cancellation,
and byte-for-byte original-file restore.

## Backup v1

A `.book.zip` includes `manifest.json` (`format: book-formatter`, `version: 1`)
and `manuscript.json` (book metadata, schema version, revision, stable section IDs,
and ProseMirror chapter JSON). Restore regenerates identities for an independent
copy. Foundation limit: 20 MB compressed, 50 MB expanded. Imported projects add `source.json` (original filename and format) and
`source/original` (original bytes), referenced from `manifest.source`. Older backups
without an import remain supported. Source bytes are stored separately from
frequently saved manuscript content in IndexedDB version 2. Edition settings and
inline media are not implemented yet.

## Scope

This is the first foundation slice, **not completed PRD Milestone 1**.
See [the baseline PRD](docs/PRD.md). Remaining M1 work: one design template, local EPUB export and EPUBCheck, full-length novel benchmarks,
PDF feasibility/quality proof, and broader interruption/quota/browser tests.
Full PWA installation compatibility, including raster icons on browsers requiring
them, needs a cross-browser pass. No publication-ready exports are claimed.

No project source license has been selected. Third-party license records are
in `docs/dependency-licenses.json`; commercial licensing review remains required.

## Import support and limits

Choose **Import a manuscript** on the bookshelf. Select a local DOCX, `.md`,
`.markdown` or `.txt` file, inspect diagnostics, choose Heading 1 / Heading 2 / one
section, rename detected sections, then import as a new local book. Nothing is
saved until that final step; cancel leaves your bookshelf unchanged. Import
creates the book and original in one IndexedDB transaction.

Mammoth converts DOCX to inert HTML, parsed through rehype into an explicit
semantic allowlist. Markdown uses unified/remark. Neither parser injects HTML
into the live page, activates links, or fetches remote images. Only text, emphasis,
headings and scene breaks reach ProseMirror. Lists/quotes/tables lose layout and
produce review warnings. Images become visible placeholders. DOCX headers,
footers, comments, tracked changes and unsupported embedded objects produce
warnings; always review against the retained source. Raw Markdown HTML remains
literal text. Original files and conversion reports are downloadable/viewable
from the imported book. They also travel with its backup.

Limits: 10 MB input; DOCX expansion 40 MB total / 15 MB per member / 5,000
members; 100 levels of semantic nesting; 100,000 blocks; 30-second worker timeout.
Paths, duplicate archive entries and XML entity/doctype declarations are rejected.
Text must be UTF-8 or BOM-marked UTF-16. Unsupported encodings get a retry message.
The worker can be terminated without affecting an existing manuscript.

The importer has a synthetic 80,000-word unit fixture, not a full performance
qualification or proof of fidelity for every Word manuscript.
