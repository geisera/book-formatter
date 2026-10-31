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
- Chapter-wide and book-wide find/replace with match navigation, case/whole-word options and replace undo/redo.
- Embedded PNG/JPEG images with captions, alt text, alignment and width controls; images are included in EPUB, PDF and backups.
- Classic ebook design: body font/size/leading, paragraph indents/spacing, headings and ornaments.
- Live semantic ebook preview with chapter navigation, reading width, light/dark and reader zoom.
- Edition settings stored independently from chapter text and carried through project backups.
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
frequently saved manuscript content in IndexedDB version 2. Ebook edition settings live under `manuscript.json.editions.ebook`, with independent
schema/template versions. Print edition settings and embedded images are preserved in project backups.

## Scope

This is the first foundation slice, **not completed PRD Milestone 1**.
See [the baseline PRD](docs/PRD.md). Remaining M1 work: full-length novel editing benchmarks,
physical print proofing, and broader interruption/quota/browser tests.
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
into the live page, activates links, or fetches remote images. Text, emphasis, headings, scene breaks and supported embedded PNG/JPEG images
reach ProseMirror. Lists/quotes/tables lose layout and produce review warnings.
DOCX image positioning and captions may require review after import. DOCX headers,
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

## Design and preview

Open a book, then select **Design** above the workspace. Classic v1 settings apply
to its ebook edition: included Libre Baskerville or system Georgia, body size
(14–24 px), leading (1.2–2.2), indent (0–3 em), paragraph spacing (0–1.5 em),
centered/left chapter titles, chapter opening space (1–5 em), and scene ornament.
Opening paragraphs and paragraphs after scenes/headings have no first-line indent.
Settings autosave with the book, without modifying chapter JSON. Books/backups
from earlier versions use Classic defaults until the author changes their design.

The desktop workspace places the semantic ebook preview beside the editor or
design controls. Smaller screens stack panels. The editor stays mounted while
switching modes so its undo history is preserved. The preview renders React text
from ProseMirror JSON, never from the editor DOM or imported HTML. Deferred
content updates display an updating indicator. Only the selected chapter renders.

Phone/ereader/tablet width, light/dark theme, and reader text zoom are temporary
preview controls, not saved design choices. Width is capped to available space;
this is a reflowable simulation, not a specific device or print proof. Local EPUB export is available from Publish. The Print tab supports offline PDF proofs in 5 × 8, 5.5 × 8.5 and 6 × 9 inch trim sizes; advanced print production remains outstanding.

Fonts are self-hosted and precached for offline use; see [font records](docs/fonts.md).
No remote font service or manuscript upload is used. New tests verify offline
import → design → preview → backup → restore, unchanged semantic content, old
backup compatibility, invalid settings, and editor undo across modes.

## Local EPUB export

Open a book and choose **Publish** (or **Export EPUB** in the sidebar). Check its
title, author and BCP 47 language tag. Resolve missing metadata and empty sections,
review import/layout warnings, then choose **Generate & download EPUB**.
The app waits for committed local saves, copies an immutable snapshot, loads only
self-hosted cached font assets and builds the EPUB in a cancellable Web Worker.
No manuscript is uploaded. Missing cached font/worker files fail with retry guidance.

The EPUB 3.3-targeted package contains an uncompressed first `mimetype` entry,
container/OPF, title page, navigation, separate XHTML chapters, Classic CSS,
licensed Libre Baskerville WOFF files (when selected) and the OFL notice.
System Georgia is not bundled. Reader font preferences can override CSS. The
EPUB package uses `version="3.0"`, as required for EPUB 3, not `3.3`.
Optional PNG/JPEG cover artwork and embedded manuscript images are included in EPUB
exports. Images support alternative text, captions and layout settings; unsupported
images still receive diagnostics.

`META-INF/book-formatter-build.json` records manuscript schema, book ID, revision,
renderer, template/design settings, timestamp and SHA-256 input fingerprint.
Export history is a separate IndexedDB v3 table. It stores the last 20 displayed
records with exact snapshot and artifact fingerprints, not copies of the EPUB
files. Older records remain in the database. History is local to this browser
and is not currently included in project backups; manuscript language/design
settings continue to travel with backups. A different manuscript/design snapshot
marks an earlier export accordingly.

Browser-local checks are deliberately limited. Each generated file's history
says **EPUBCheck not run**; no publication-ready label is assigned. The official
EPUBCheck tool is run separately on our test fixtures and actual offline
browser-generated fixture in CI. User manuscripts are never submitted to that
CI job. See [validation evidence and limits](docs/epub-validation.md).

To validate locally, install the verified official EPUBCheck 5.4.0 distribution,
set `EPUBCHECK_JAR` to its JAR path, and run `npm run check:epub`. Java 17+ is
used in CI. Reports and fixture EPUBs are generated in ignored `artifacts/epub/`.
The source and dependencies remain pinned in the lockfile.

## Offline print proof

Open a book → **Print**, choose a 5 × 8, 5.5 × 8.5 or 6 × 9 inch trim size,
and build a PDF proof. Inspect the actual PDF using
facing/single pages, page selection and zoom, then choose **Download PDF proof**.
The preview and download share the exact same file bytes. Print uses independent
Classic v1 typography and mirrored margins; ebook design controls do not change it.
The profile persists in project backups; older projects use the same default.

Fonts are embedded; chapters open on right-hand pages; intentional blanks and
header/folio rules are applied. A worker keeps generation cancellable and offline.
Print history is stored separately in IndexedDB v4 and records source/file SHA-256.
It does not archive PDFs. Limitations and stale-snapshot warnings remain visible.
This proof is not a certified retailer-ready paperback; see
[feasibility evidence and scope](docs/print-feasibility.md).

`npm run proof:pdf` creates a mixed sample and a 114,000-word / 402-page fixture.
Install `scripts/pdf-proof-requirements.txt`, then run
`python scripts/inspect-print.py` to independently check geometry, embedding,
margins, text retention, headers, chapter starts and blank pages. CI also runs
this inspection on actual PDFs generated by its offline browser acceptance tests.
