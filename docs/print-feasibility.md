# Offline print feasibility: Classic 6 × 9 v1

## Decision

Use an application-owned deterministic line/page layout with MIT-licensed
`pdf-lib` and `@pdf-lib/fontkit` to generate PDF bytes in a Web Worker. Use
Mozilla PDF.js (Apache-2.0) to render those **same bytes** in the browser.
This proves a server-free fixed PDF workflow without browser print-dialog
settings. It is an initial fiction-interior renderer, not a general DTP engine.

The print edition is independent from ebook settings. Classic print v1 fixes
Libre Baskerville at 11 pt / 15.5 pt leading on a 432 × 648 pt page, with a 54 pt
inside gutter, 40.5 pt outside margin, and 54 pt top/bottom margins. The fixed
inside margin is used only up to 700 pages; longer manuscripts are rejected.

Profile rules:

- First physical leaf is a title page; chapters begin on odd (right-hand) pages.
- Required blank leaves are inserted; the final page count is even.
- Body pages alternate book title / author running heads and outside folios.
- Title leaves, chapter openings and blanks suppress running heads; blanks have
  no folio or text. Opening chapter pages retain their physical page folio.
- Paragraphs split with at least two lines per fragment. Headings and ornaments
  are kept with following text. Opening paragraphs have no first-line indent.
- Regular, italic, bold and bold-italic licensed font faces are embedded when
  used. Unsupported glyphs or complex scripts block generation rather than
  silently replacing or deleting text.
- PDF metadata identifies renderer and source snapshot. Local build history
  records profile, revision, artifact/source SHA-256, page geometry and bounds.
- Preview uses a copy of the PDF buffer so PDF.js transfer cannot detach or
  change the bytes kept for download. Facing/single-page view and zoom are
  reader controls, not a separate pagination process.

## Executed local proof

`npm run proof:pdf` generated:

- `sample.pdf`: 18 pages, mixed emphasis, headings and a scene break.
- `novel.pdf`: **114,000 body words, 40 chapters, 402 pages**.

`python scripts/inspect-print.py` independently reopened both PDFs with pypdf
and pdfplumber. All pages passed 432 × 648 pt media/trim geometry checks, even
final counts, embedded-font/Unicode-map checks, clipping/margin checks,
right-hand chapter starts, header suppression and folio checks. Body text was
compared in order to the source manuscript, normalizing whitespace and Unicode
compatibility forms; no body text was missing or changed. Artifact SHA-256 is
also compared with the renderer's build record.

Poppler `pdffonts` confirmed embedded CID TrueType fonts and ToUnicode maps.
Pages 3–6 of the sample were rasterized using `pdftoppm` and visually inspected
for chapter opening, verso/recto margins, running heads, line rhythm and folios.
The first proof has a clean, ragged-right setting without overlap or clipped text.

CI adds actual **offline browser-generated** short and full-length PDFs to the
same independent inspection. Its full-length scenario imports a 114,000-word
Markdown novel, generates the proof offline, renders the downloaded PDF in
PDF.js and saves that exact file plus the local source/build record for checks.
The browser also verifies the downloaded file's checksum against local history.
CI publishes generated PDFs, source fixtures and inspection reports as
`print-validation-proofs`. Consult that run for its actual result.

## Limits and next decisions

This is a feasibility proof. It is not KDP approval, PDF/X or PDF/UA certification,
a cover-wrap generator, or evidence of a physical proof. No bleed, color images,
arbitrary fonts, complex-script shaping, automatic hyphenation, justified text,
front-matter Roman numbering or advanced typography controls are provided.
Overlong words may break without hyphens and produce a review warning. Very short
books (under 24 pages) can be proofed but get a non-retail warning.

Fonts are included locally under SIL OFL 1.1; see `docs/fonts.md` and the
public license. All font, PDF worker, PDF.js worker and JS assets are precached.
Once an author is authenticated, no cloud manuscript upload is needed. Authentication is mandatory for the web application (PRD v1.2); the local PDF renderer still needs no network service. The existing feasibility prototype predates the authentication gate. Build cancellation and failures
leave the working manuscript unchanged. History stores records, not PDF files,
and remains local to this browser; the print profile travels in project backups.

Before production print release: inspect actual reading/printing devices, order
physical proofs, benchmark broader 150,000-word books and edge cases, improve
hyphenation/justification and chapter/front-matter policies, then add trim sizes.
The physical-page folio convention must be revisited when front matter expands.

## Primary references

- PDF-LIB custom fonts: https://pdf-lib.js.org/
- PDF.js: https://mozilla.github.io/pdf.js/
- KDP paperback guidelines: https://kdp.amazon.com/en_US/help/topic/G201857950
- KDP trim and margins: https://kdp.amazon.com/en_US/help/topic/GVBQ3CMEQW3W2VL6
