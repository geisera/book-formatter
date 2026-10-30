# BOOK FORMATTER — Product Requirements Document

**Version:** 1.1  
**Date:** October 30, 2026  
**Status:** Proposed baseline  
**Product:** Commercial local-first web-based book formatter  
**Primary audience:** Independent fiction authors and small publishers  
**Initial outputs:** EPUB 3.3 and print-ready paperback PDF

## 1. Vision and product principles

Book Formatter allows authors to import manuscripts, organize book structure, choose professional typography, preview editions, and export publication-ready books through an installable browser application. The initial focus is novels, novellas, and short-story collections.

Non-negotiable principles:

1. **Local-first from initial development.** The browser's local project is the authoritative working copy; cloud synchronization is strictly optional.
2. **Offline-capable.** After first online installation, core project management, editing, formatting, and supported production functions work without connectivity.
3. **Direct ProseMirror.** Use ProseMirror packages directly; do not introduce Tiptap as the primary editor abstraction.
4. **Open-source preference.** Prefer well-maintained MIT/BSD/Apache/ISC licensed dependencies where appropriate; review all copyleft and font obligations before commercial deployment.
5. **Portable author-owned data.** Provide complete local project backup and restore; no mandatory cloud account.
6. **Separate content from presentation.** Manuscript schema, design templates, EPUB renderer, print renderer, and account services are independent modules.
7. **Production quality first.** Standards checks and visual print proofing determine export readiness.
8. **Privacy by design.** Never transmit local manuscripts without transparent user authorization.

## 2. Users and scope

Primary user: independent fiction author with a 30,000–150,000 word DOCX or Markdown manuscript, producing ebooks and paperbacks for self-publishing distributors. Secondary user: prolific author seeking reusable templates and multiple editions. Later user: small publisher needing team and imprint features.

### MVP includes

- Installable PWA and offline startup.
- Guest/local-only projects, IndexedDB local persistence, durable save indicators, and portable backups.
- Local DOCX, Markdown, and plain-text import; structure detection and diagnostics.
- Chapter-based ProseMirror editing with paragraph, bold, italic, heading, scene break, undo/redo, and basic find/replace.
- Front matter, body matter, and back matter; chapter rearrangement and TOC.
- Three templates: Classic, Modern, Gothic; controlled typography options.
- Multiple edition configurations from one manuscript.
- Ebook reader preview and facing-page paperback preview.
- Local EPUB generation and validation, paperback PDF generation and validation.
- Three print trim sizes: 5 × 8, 5.5 × 8.5, and 6 × 9 inches.
- Local export history, storage warnings, recovery support.

### Deliberately outside MVP

Full drafting suite; real-time collaboration; native mobile apps; direct retailer submission; hardcover and full-bleed production; complex academic/technical layout; audiobooks; AI rewriting; cover illustration generation; arbitrary desktop-publishing-style layout.

## 3. Standard author workflow

1. Open app as guest or optionally authenticate.
2. Create local project with title and author; optionally enter subtitle, series, imprint, language, description, ISBN, and edition metadata.
3. Import local DOCX/Markdown/text, parse and inspect chapter boundaries, emphasis, scene breaks, and assets.
4. Review structure; correct chapters, front/back matter, and title handling.
5. Edit chapters in ProseMirror; autosave to the local project.
6. Choose design template and configure ebook and paperback editions separately.
7. View device-responsive ebook preview and paginated paperback preview.
8. Run quality assurance; generate, validate, and download EPUB/PDF.
9. Export complete portable project backup; optionally enable cloud synchronization.

**WF-001:** Opening or editing a local project does not require authentication.  
**WF-002:** Switching templates never mutates the manuscript.  
**WF-003:** Edition configuration is independent of manuscript content.  
**WF-004:** A failed import/export/sync must not corrupt a project.  
**WF-005:** Each artifact identifies exact manuscript, template, and renderer versions.  
**WF-006:** User-facing status distinguishes local save from cloud synchronization.

## 4. Local-first storage and offline operation

Preferred stack: IndexedDB accessed through Dexie; OPFS for large binaries when supported, with fallback; Service Worker and Cache API for installed application assets. Detect features rather than assuming identical browser support.

**LOCAL-001:** All projects are created and stored locally first.  
**LOCAL-002:** Local creation, editing, structure, and design work offline after app installation.  
**LOCAL-003:** Autosave writes are transactional where supported, versioned, and recoverable after interruptions.  
**LOCAL-004:** Local changes survive ordinary reloads and browser restarts.  
**LOCAL-005:** Request persistent storage where browser-supported; surface storage quota and eviction warnings.  
**LOCAL-006:** Never claim browser data is permanent; encourage independent backups.  
**LOCAL-007:** Export an open documented ZIP project package containing manifest, manuscript JSON, chapter content, metadata, media, and edition settings.  
**LOCAL-008:** Restore a backup into a clean browser profile.  
**LOCAL-009:** Support schema migrations and project integrity checks.  
**LOCAL-010:** Deletion requires confirmation; account or subscription status cannot block access to local project data.  
**LOCAL-011:** The UI identifies Saved locally, Save failed, Offline, Sync pending, Synchronized, and Conflict.

Offline operation must be exercised as an automated end-to-end acceptance test, not deferred to a later milestone.

## 5. Optional cloud synchronization

Cloud infrastructure, when enabled, uses authenticated PostgreSQL/Supabase plus private asset storage. Sync is opt-in per project and preserves local edit authority. MVP may ship without cross-device sync, but the architecture must support it from day one.

**SYNC-001:** Sync can be enabled and disabled without sacrificing local usability.  
**SYNC-002:** Queue pending changes while offline; retry on reconnection.  
**SYNC-003:** Use revision identifiers, parent revision, checksums, and concurrency controls.  
**SYNC-004:** Never silently overwrite divergent changes; preserve both and provide keep-local, restore-cloud, or duplicate options.  
**SYNC-005:** Keep manuscript and assets consistent.  
**SYNC-006:** Authenticate and authorize cloud operations, enforce tenant isolation and appropriate RLS.  
**SYNC-007:** Treat real-time collaborative merging/Yjs as a future feature, not required for initial sync.

## 6. ProseMirror editing architecture

Use `prosemirror-model`, `prosemirror-state`, `prosemirror-view`, `prosemirror-transform`, `prosemirror-commands`, `prosemirror-history`, `prosemirror-keymap`, `prosemirror-inputrules`, and appropriate schema/list utilities as needed. Maintain an explicit application-owned semantic manuscript schema.

**EDIT-001:** Each chapter is an independently editable structured ProseMirror document, avoiding one enormous editor instance.  
**EDIT-002:** Supported nodes: paragraph, heading/chapter title, scene break, quote, image, and lists as justified.  
**EDIT-003:** Supported marks: emphasis, strong emphasis, hyperlink where appropriate.  
**EDIT-004:** Chapter metadata/order live in a separate book-level structure with stable IDs.  
**EDIT-005:** Support text editing, formatting, undo/redo, keyboard shortcuts, safe paste, find/replace, and autosave.  
**EDIT-006:** Validate and sanitize imported/pasted data against the schema.  
**EDIT-007:** Store content independently of design CSS, maintain schema migrations, and test round-trip serialization.  
**EDIT-008:** Do not render all chapters as simultaneously active editors.

## 7. Import and book structure

Browser-local parsers: Mammoth.js for DOCX and unified/remark for Markdown, with custom transformations to the semantic schema. Treat all uploaded files and archives as untrusted; guard against zip traversal/bombs, unsupported embedded content, and unsafe HTML.

**IMP-001:** Import DOCX, Markdown, and basic text locally.  
**IMP-002:** Preserve paragraphs, italics, bold, chapter breaks, scene separators, and supported images.  
**IMP-003:** Detect probable chapters, front/back matter, and ambiguous headings; allow corrections.  
**IMP-004:** Produce actionable diagnostics and never silently discard unsupported content.  
**IMP-005:** Keep the original file where feasible and support interruption/retry.

**STR-001:** Structure contains front matter (half title, title, copyright, dedication, epigraph, TOC, preface), body matter (parts, chapters, prologue, epilogue, interludes), and back matter (about author, also-by, notes, acknowledgments, custom).  
**STR-002:** Reorder, rename, insert, delete, split, and merge sections as supported.  
**STR-003:** Automatically generate navigable TOC and support numbered/unnumbered chapter titles.  
**STR-004:** Section identities must not depend on display titles.

## 8. Design and editions

MVP templates: **Classic** (traditional serif), **Modern** (clean contemporary), **Gothic** (restrained decorative fantasy/horror treatment). Configurable properties include body font/size/leading, paragraph indent/spacing, chapter title treatment, scene ornament, section spacing, running header, numbering, and front-matter style.

**DES-001:** Template selection and preview apply consistently to the entire edition.  
**DES-002:** Templates are immutable/versioned for finalized builds.  
**DES-003:** Changes never alter manuscript semantic content.  
**DES-004:** Fonts must have verified rights for web use, commercial embedding in EPUB and PDF, and any sublicensing involved.  
**ED-001:** Each edition references a manuscript snapshot plus specific design/template/render settings.  
**ED-002:** Support ebook and 5 × 8, 5.5 × 8.5, 6 × 9 inch paperback editions.  
**ED-003:** New manuscript revisions mark earlier exports potentially outdated.  
**ED-004:** Maintain local export history and reproducible build metadata.

## 9. EPUB production

Target reflowable EPUB 3.3, semantically valid XHTML, CSS, OPF/package metadata, navigation, cover and assets. Build from the semantic document model, not from the live editor DOM. A browser-compatible open-source ZIP/package generator is preferred.

**EPUB-001:** Generate reflowable EPUB locally/offline.  
**EPUB-002:** Preserve hierarchy, chapter content, inline emphasis, TOC/navigation, and appropriate metadata.  
**EPUB-003:** Support cover and supported inline images.  
**EPUB-004:** Follow reflowable-reader constraints; avoid fixed page-size assumptions.  
**EPUB-005:** Validate with EPUBCheck for publication-ready classification. Distinguish browser-local checks from validation requiring a separate runtime; never claim EPUBCheck passed if it did not execute.  
**EPUB-006:** Report errors, warnings, and informational recommendations with remediation.

## 10. Print PDF production

MVP: conventional black-and-white fiction interiors aligned with Amazon KDP paperback specifications. No cover-wrap or full-bleed interiors initially. Candidate renderer Paged.js or another license-compatible open-source CSS paged-media implementation; selection requires feasibility and quality tests.

**PDF-001:** Produce fixed-layout PDFs at specified trim sizes with facing-page/mirrored margins, gutters, page numbers, running headers, and recto chapter starts.  
**PDF-002:** Insert appropriate blank pages and suppress headers on designated pages.  
**PDF-003:** Embed fonts and validate physical geometry, overflow, and supported image properties.  
**PDF-004:** Manage widows/orphans and test hyphenation, paragraph rhythm, and page balance.  
**PDF-005:** Use same underlying pagination logic for definitive print previews and PDF exports where feasible; clearly mark approximate previews.  
**PDF-006:** Target publication-grade local PDF generation; prove offline feasibility during Milestone 1. Any server-dependent advanced processing requires explicit disclosure/authorization.  
**PDF-007:** Validate retailer profile rules and physically inspect representative proof copies.  
**PDF-008:** Defer PDF/X and advanced press production until proven and prioritized.

## 11. Preview and quality assurance

**PREV-001:** Ebook preview supports selectable device dimensions, reader font-size controls, light/dark themes, and chapter navigation.  
**PREV-002:** Print preview supports single/facing pages, zoom, trim and page navigation.  
**PREV-003:** Preview reflects current local manuscript/design state and indicates stale/rebuilding state.  
**QA-001:** Structural checks detect missing metadata, empty chapters, duplicate/suspicious headings, broken references, and scene-break inconsistencies.  
**QA-002:** EPUB checks cover package integrity, navigation, resource references, required metadata, and accessibility signals.  
**QA-003:** Print checks cover trim, margins, font embedding, overflow, blank pages, page numbering, and images.  
**QA-004:** Each issue has severity, location, explanation, and corrective action.  
**QA-005:** Errors block labeling an artifact as publication-ready.

## 12. UI/UX

Primary areas: landing page, local dashboard, book workspace, export interface, optional account/sync/billing, and admin interface. Workspace: left book structure, center ProseMirror editor, right output preview. Modes: Manuscript, Structure, Design, Publish.

**UX-001:** Desktop-first support for current Chrome, Firefox, Edge, Safari.  
**UX-002:** Keyboard-accessible core workflows, WCAG 2.2 AA target.  
**UX-003:** Clear local-save, offline, syncing, conflict, job progress, and error states.  
**UX-004:** Confirm destructive operations.  
**UX-005:** Never require online account creation to edit a local manuscript.  
**UX-006:** Responsive smaller-screen behavior, with desktop as initial production target.

## 13. Recommended technology and module boundaries

| Layer | Preferred approach |
|---|---|
| Language | TypeScript |
| Web client | Next.js / React |
| UI | Tailwind CSS |
| Editor | Direct ProseMirror |
| Local DB | IndexedDB + Dexie |
| Binary assets | OPFS where supported, fallback storage adapter |
| Offline | Service Worker, Cache API, installable PWA |
| DOCX | Mammoth.js + schema transformations |
| Markdown | unified / remark |
| EPUB | Browser-compatible open-source packaging library |
| Print | Paged.js or proven license-compatible alternative |
| EPUB validation | EPUBCheck in supported execution environment |
| Optional cloud | PostgreSQL / Supabase Auth / private storage |
| Hosting | Vercel (replaceable delivery layer) |
| Payments | Stripe, for commercial cloud features |
| Source and CI | GitHub / GitHub Actions |
| Tests | Vitest / Playwright |

Separate packages/services: local author app, semantic publishing core, EPUB renderer, print renderer, validation suite, optional sync service, optional billing/admin services. Run costly parsing/production computations in Web Workers where feasible. Version schemas and renderers. All publishing builds operate on immutable snapshots, not mutable editing state.

## 14. Security and privacy

**SEC-001:** Manuscripts remain author-owned; local-only manuscripts never transmit implicitly.  
**SEC-002:** Sanitize DOCX/HTML content and protect against malicious archive/resource attacks.  
**SEC-003:** Browser local storage is not encrypted automatically; never imply encryption at rest without implementing it.  
**SEC-004:** Optional cloud sync requires authentication, server-side authorization, RLS/tenant separation, private object access, least privilege, and auditable privileged operations.  
**SEC-005:** User can delete local and cloud copies independently, export content, and close accounts.  
**SEC-006:** AI processing is optional and requires informed authorization before third-party transmission.  
**SEC-007:** Product analytics must never include manuscript prose or chapter content.

## 15. Commercial model and administration

Freemium/hybrid model under evaluation: free local authoring/previews, paid advanced export capabilities/templates and/or cloud sync/backups; one-book and annual professional plans; publisher tier later. Because client-side licensing is not tamperproof, do not assume a purely local paywall provides strong enforcement.

**BILL-001:** Verified Stripe checkout, webhooks, subscriptions/one-time purchases, server-side cloud-service entitlements, billing portal, cancellation.  
**BILL-002:** Offline editing and access to locally owned project data must never depend on a live billing request.  
**BILL-003:** Resolve offline-license and paid-export policies before commercial launch.  
**ADMIN-001:** Monitor accounts, subscription status, export failures, rendering statistics, system health, and feature flags without routine access to manuscript contents.

## 16. Open-source licensing policy

Prefer MIT, BSD-2/3, Apache-2.0, and ISC dependencies, subject to security and suitability. GPL/AGPL are not automatically forbidden but require review of distribution/network obligations and architecture. Maintain license inventory, SBOM, vulnerability scanning, dependency version pinning, and font-license records. Preserve open/documented manuscript and backup formats.

## 17. Performance, reliability, and compatibility

Provisional targets on a documented reference 80,000-word novel and test hardware:

| Operation | Target |
|---|---|
| Open cached app offline | Under 3 seconds |
| Open local project | Under 3 seconds |
| Typical editor response | Under 100 ms |
| Cached chapter navigation | Under 1 second |
| Local autosave | Under 2 seconds |
| EPUB generation | Under 30 seconds |
| Paperback PDF generation | Under 120 seconds |

These are engineering targets, not universal guarantees. Test interrupted saves, browser restarts, network loss, quota exhaustion, sync conflicts, export cancellations, and corrupted data. Browser feature detection and fallback are mandatory.

## 18. Testing and exit criteria

Use unit, integration, end-to-end, schema, import round-trip, renderer golden-file, visual-regression, EPUB validation, PDF inspection, and real retailer/proof tests. Maintain simple, complex, illustrated, long (150,000+ words), and malformed test manuscripts.

Mandatory local-first test scenarios:

- Install app online; import, edit, close, reopen, and export EPUB completely offline.
- Interrupt a local save; recover without silently losing committed work.
- Export backup; restore in a fresh browser profile with manuscript/media/design intact.
- Enable sync, edit offline, reconnect, and reconcile revisions safely.
- Edit one project on two devices while disconnected; preserve divergent versions on reconnect.
- Verify no manuscript network transmission during local-only workflows.
- Test PDF output and print previews under documented offline environment; confirm any limits.

## 19. Milestones

**M1 — Local-first foundation and production proof:** Installable PWA, local database, ProseMirror prototype, DOCX/Markdown import, semantic model, one template, EPUB exporter, PDF feasibility and quality test, portable backup, offline tests. **Exit:** Full-length novel locally edited and reliably saved; validated EPUB and technically compliant paperback PDF generated through supported workflows, with offline print feasibility documented.

**M2 — Complete author workspace:** Dashboard, chapter management, three templates, typography settings, ebook/print previews, local history, recovery tools. **Exit:** Nontechnical author can format and export a novel without developer assistance.

**M3 — Optional cloud:** Auth, private storage, opt-in revision sync, conflicts, backup, tenant security. **Exit:** Safe sync without sacrificing local authority.

**M4 — Private beta:** External author tests, retailer validation, physical print proofs, performance, browser and security reviews. **Exit:** Production quality and reliability accepted by beta testers.

**M5 — Commercial launch:** Stripe, plans/entitlements, support, onboarding, admin, legal/privacy policies. **Exit:** Self-service purchase and production without administrator intervention.

**M6 — Expansion:** More templates, series branding, hardcover, additional print profiles, custom fonts, publisher collaboration, optional AI, APIs and retailer integrations.

## 20. Risks and decision register

| Risk / decision | Required response |
|---|---|
| Browser storage eviction | Persistent storage requests, transparent warnings, backup/restore |
| Offline print quality | Early proof, actual proof copies, clear renderer limitations |
| DOCX fidelity | Diagnostics, semantic mapping, regression corpus |
| Cross-device conflicts | Immutable revisions, never silently overwrite |
| Large manuscripts | Chapter isolation, workers, performance benchmarking |
| Copyleft or font obligations | Legal and license review before shipping |
| Browser-only license bypass | Commercial model assumes client tampering is possible |
| Paid conversion | Beta market and pricing research |
| Scope creep | Milestone gates and explicit deferrals |

Open decisions: commercial name; print rendering engine; fully local PDF capability; revision sync implementation; storage sizing; offline licensing strategy; font library; exact portable backup schema; pricing.

## 21. Definition of done

A feature is complete only when functional, offline/persistence behavior (where applicable), authorization/security, tests, error handling, accessibility, and documentation pass in a representative deployed environment. Publication features additionally require real standards validation and visual proofs.

**Final product principle:** Authors can import, edit, format, and preserve their books independently of cloud infrastructure. Professional publication output, author ownership, portability, local-first reliability, and open-source sustainability take priority over feature count.
