import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Help & Documentation — Book Formatter",
  description: "A practical guide to Book Formatter's local projects, manuscript import, editing, design, EPUB export and PDF proofs.",
};

const topics = [
  ["start", "Getting started"],
  ["projects", "Local projects"],
  ["import", "Import manuscripts"],
  ["editor", "Edit chapters"],
  ["design", "Book designs"],
  ["preview", "Ebook preview"],
  ["epub", "Export EPUB"],
  ["pdf", "Print PDF proofs"],
  ["backup", "Backup and restore"],
  ["offline", "Offline use and privacy"],
  ["troubleshooting", "Troubleshooting"],
  ["limitations", "Current limitations"],
] as const;

export default function HelpPage() {
  return (
    <main className="help-page">
      <header className="help-header">
        <div>
          <p className="eyebrow">BOOK FORMATTER / USER GUIDE</p>
          <h1>Help & documentation</h1>
          <p>Every currently available workflow, from the first manuscript to a downloadable book.</p>
        </div>
        <Link className="help-return" href="/">← Back to Book Formatter</Link>
      </header>
      <div className="help-grid">
        <nav className="help-navigation" aria-label="Documentation topics">
          <strong>Contents</strong>
          {topics.map(([id, label]) => <a href={`#${id}`} key={id}>{label}</a>)}
        </nav>
        <div className="help-articles">
          <section id="start">
            <h2>Getting started</h2>
            <ol>
              <li>Open Book Formatter in your browser. No account is needed for local projects.</li>
              <li>Choose <strong>Create local book</strong> to start with an empty chapter, or <strong>Import a manuscript</strong> to bring in an existing file.</li>
              <li>Use <strong>Manuscript</strong> to edit, <strong>Design</strong> to style your ebook, <strong>Publish</strong> to make an EPUB, and <strong>Print</strong> for a paperback PDF proof.</li>
              <li>Download a <strong>project backup</strong> regularly. Browser storage can be cleared.</li>
            </ol>
            <p>Once the offline application files have been cached, you can open existing projects and use the supported local features without an internet connection.</p>
          </section>
          <section id="projects">
            <h2>Local projects and the bookshelf</h2>
            <p>On the bookshelf, enter a <strong>Book title</strong> and optionally an <strong>Author name</strong>, then select <strong>Create local book</strong>. The new book contains an initial chapter. Select a book card on <strong>Your bookshelf</strong> to reopen it.</p>
            <p>Inside a book, the left sidebar lists chapters. Select a chapter to edit it, or choose <strong>+ Add chapter</strong>. Edit a chapter's title using the <strong>Chapter title</strong> field above its text. Use <strong>← Bookshelf</strong> to return to your projects.</p>
            <p>Edits are autosaved locally. Check the header for <strong>Saving locally…</strong>, <strong>Saved locally</strong>, or <strong>Save failed</strong>. Do not close the page during an unresolved save failure; download a backup and review the error.</p>
            <p>Cloud account synchronization is not provided; project data and embedded images remain in this browser unless exported in a backup.</p>
          </section>
          <section id="import">
            <h2>Import a manuscript</h2>
            <ol>
              <li>From the bookshelf, choose <strong>↑ Import a manuscript</strong>.</li>
              <li>Select a <strong>.docx</strong>, <strong>.md</strong>, <strong>.markdown</strong>, or <strong>.txt</strong> file, up to <strong>10 MB</strong>.</li>
              <li>After local processing, enter the imported book title and author.</li>
              <li>Choose chapter boundaries: <strong>Automatic</strong>, <strong>Heading 1</strong>, <strong>Heading 2</strong>, or <strong>Keep as one section</strong>.</li>
              <li>Review the detected sections and <strong>Conversion review</strong> notices. Rename section titles as needed.</li>
              <li>Choose <strong>Import as new book</strong> to save it to the local bookshelf.</li>
            </ol>
            <p>Import retains the original file. Inside an imported book, use <strong>Download original</strong> to retrieve it and expand <strong>Import report</strong> to review conversion notes. An import creates a separate book and does not overwrite an existing project.</p>
            <p><strong>Important:</strong> Bold, italics, paragraphs, headings and scene breaks are supported. Tables, lists and other complex layouts may be simplified; supported embedded PNG/JPEG images are imported in reading order; unsupported or oversized images become placeholders. Compare the imported result with your original manuscript.</p>
          </section>
          <section id="editor">
            <h2>Edit your manuscript</h2>
            <p>Open a book and select <strong>Manuscript</strong>. The ProseMirror editor is chapter-based, so edits affect the selected chapter.</p>
            <dl>
              <dt>Bold / Italic</dt><dd>Select text and choose <strong>B</strong> or <strong>I</strong>. Keyboard shortcuts: <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>B</kbd> and <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>I</kbd>.</dd>
              <dt>Heading / Paragraph</dt><dd>Place the caret in a block and choose <strong>Heading</strong> or <strong>Paragraph</strong>.</dd>
              <dt>Scene break</dt><dd>Choose <strong>Scene break</strong> where you want a scene separator inserted. Its final appearance depends on ebook design settings.</dd>
              <dt>Images and illustrations</dt><dd>Choose <strong>Insert image</strong> from the manuscript toolbar, select a PNG or JPEG (up to 3 MB), and enter descriptive alternative text. Click the inserted image to open <strong>Image properties</strong>. Set image width (25%, 50%, 75%, 100%), alignment, alternative text, and caption together, then choose <strong>Save properties</strong>. Select <strong>Replace image</strong> to substitute a PNG or JPEG without changing its position or caption, or <strong>Remove image</strong> to delete it. Images are embedded locally in the manuscript and included in EPUB, PDF and project backups. The combined embedded-image limit is 12 MB per project. SVG, GIF, WebP, and external image URLs are not supported. DOCX import extracts supported PNG/JPEG images but may not preserve complex image positioning or captions; review imported figures. Keep a separate copy of high-resolution originals for print production.</dd>
              <dt>Undo / Redo</dt><dd>Use the toolbar buttons, or the usual keyboard shortcuts (<kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>Z</kbd> to undo).</dd>
              <dt>Chapter names</dt><dd>Edit the <strong>Chapter title</strong> field above the editor; it is separate from the body text.</dd>
            </dl>
            <p>The editor is for manuscript corrections and semantic formatting, not arbitrary visual page layout. The final ebook and PDF are produced by separate renderers.</p>
          </section>
          <section id="design">
            <h2>Choose an ebook design</h2>
            <p>Open <strong>Design</strong> and select one of the version 1 presets: <strong>Classic</strong> (traditional literary serif), <strong>Modern</strong> (clean contemporary), or <strong>Gothic</strong> (ornamental). Selecting a preset sets the design for <strong>both EPUB and PDF</strong>, with format-specific typography applied independently. The template choice <strong>does not change your manuscript</strong>.</p>
            <p>Customize <strong>Body font</strong> (included Libre Baskerville or system Georgia), <strong>Body size</strong>, <strong>Line spacing</strong>, <strong>First-line indent</strong>, <strong>Paragraph spacing</strong>, <strong>Chapter heading</strong> alignment, <strong>Chapter opening space</strong>, and <strong>Scene ornament</strong> (asterisks, diamonds, fine rule).</p>
            <p>Choose <strong>Reset selected template settings</strong> to restore the current preset's defaults. Settings autosave locally with the book and are included in project backups. The selected design also determines the print template. PDF-specific font sizing, page layout and justification remain separate from ebook typography.</p>
          </section>
          <section id="preview">
            <h2>Preview the ebook</h2>
            <p>The live ebook preview appears beside the manuscript or design settings. It shows the selected chapter with the active ebook design.</p>
            <p>Use <strong>Reading width</strong> to simulate phone (320 px), ereader (420 px), or tablet (600 px); <strong>Preview theme</strong> for light or dark; the <strong>A− / percentage / A+</strong> controls for preview-only text size; and chapter navigation to move through the book.</p>
            <p>Reader controls do not change the saved edition. This is a reflowable reading simulation, not a pixel-perfect representation of every ebook device or a print PDF preview. Reading apps may override font preferences.</p>
          </section>
          <section id="epub">
            <h2>Generate and download EPUB</h2>
            <ol>
              <li>Choose <strong>Publish</strong> or <strong>Export EPUB</strong> in the sidebar.</li>
              <li>Under <strong>Book details</strong>, enter the publication title, author and language tag (for example <code>en</code> or <code>en-US</code>), then select <strong>Save book details</strong>.</li>
              <li>Review <strong>Before you export</strong>. Fix blocking errors such as missing information or empty sections; examine warnings separately.</li>
              <li>Choose <strong>Generate & download EPUB</strong>. The file is generated locally and downloaded by the browser.</li>
              <li>Inspect the result using an ebook reader before publication.</li>
            </ol>
            <p>Exports include chapter navigation, supported inline emphasis, heading and scene treatments, and the saved ebook design. The <strong>Export history</strong> lists recent build records, including their revision and checksum; it does <strong>not</strong> store copies of the downloadable EPUB files.</p>
            <p><strong>Validation limitation:</strong> The browser performs local package checks, but <strong>EPUBCheck is not run on each user export</strong>. Do not regard a local-check pass as formal retailer approval. For distribution, validate the actual downloaded EPUB with EPUBCheck and visually inspect it in a reader.</p>
          </section>
          <section id="structure">
            <h2>Organize your book in Structure</h2>
            <p>Open a local book and select <strong>Structure</strong> to organize sections independently of their manuscript text. Existing chapters are treated as regular chapters unless you assign another type.</p>
            <ol>
              <li><strong>Reorder:</strong> drag a section row onto another row, or use <strong>Up</strong> and <strong>Down</strong>. Sections are numbered continuously: Front Matter begins at 1, Body Matter continues that sequence, then Back Matter. The saved section order determines EPUB navigation and the order of PDF pages.</li>
              <li><strong>Rename or classify:</strong> change the title and leave the field, or select a section type. Supported types include prologue, chapters, parts, front matter and back matter.</li>
              <li><strong>Add:</strong> choose a type, enter a title, then select <strong>Add section</strong>. Use <strong>+ After</strong> to insert after a specific section.</li>
              <li><strong>Split:</strong> choose a split position between existing paragraph or scene-break blocks. The new section is inserted after the original.</li>
              <li><strong>Merge next:</strong> append the following section's blocks to this section; the first section keeps its title and ID.</li>
              <li><strong>Delete:</strong> remove a section and its content after confirmation. Maintain regular project backups before destructive changes.</li>
              <li><strong>Edit text:</strong> open a section in Manuscript mode to edit its contents.</li>
              <li><strong>Page Layout:</strong> expand the control within a section to choose the starting page (next, right-hand, or left-hand), vertical position (top, center, or bottom), running-header and page-number visibility, and additional before/after spacing in points. Defaults reflect the section type; older projects keep their existing body-chapter treatment.</li>
              <li><strong>Show section title on page:</strong> toggle this option for each section. When off, EPUB and PDF omit the visible section heading while retaining its title for navigation, editing, and table-of-contents entries. Existing chapters remain titled by default; dedication, epigraph, copyright, and title-page sections start without visible headings.</li>
            </ol>
            <p>Print PDF respects requested recto/verso page starts, optional running headers, folios, spacing, and conservative short-section vertical positioning. Longer sections continue onto body pages and may remain top-aligned. EPUB supports page breaks and spacing but the reading device controls physical pages; running headers, folios, and precise page sides are PDF-only. The EPUB export creates navigation entries in section order and assigns appropriate EPUB semantics where supported. Add a section of type <strong>Table of contents</strong> in Structure to generate its entries automatically from the current book order. EPUB contains linked entries; PDF displays section starting pages calculated after pagination. Text manually entered in a generated contents section is not printed; move it to another section if needed. Front-matter folios use lowercase Roman numerals when shown, with visible numbering on contents and preface pages by default. Main-text numbering restarts at Arabic 1 and continues into back matter; individual section controls can hide or show folios.</p>
          </section>
          <section id="pdf">
            <h2>Build and inspect a paperback PDF proof</h2>
            <ol>
              <li>Open <strong>Print</strong> or choose <strong>Print PDF proof</strong> in the sidebar.</li>
              <li>Choose <strong>Classic, Modern, or Gothic</strong> in the <strong>Design</strong> tab. The Print panel displays the inherited design; there is no second template selector.</li>
              <li>Choose whether to check <strong>Justify body text</strong>. Unchecked gives a ragged right edge; checked enables controlled justification.</li>
              <li>Select <strong>Build 6 × 9 PDF proof</strong>. The local worker generates a text-only paperback interior.</li>
              <li>Inspect the resulting pages: use the <strong>Page</strong> number, <strong>Facing pages / Single page</strong> view, <strong>Zoom</strong>, and previous/next controls.</li>
              <li>Choose <strong>Download PDF proof</strong> to save the same PDF bytes shown in the preview. Rebuild after changing the book, Design template, or justification setting.</li>
            </ol>
            <p>The available versioned print profiles are <strong>Classic</strong> (centered chapter titles, asterisk scene breaks, traditional headers), <strong>Modern</strong> (left-aligned chapter headings, fine scene rules, minimal headers), and <strong>Gothic</strong> (dramatic centered chapter openings, diamond ornaments, chapter running headers). All use a <strong>6 × 9-inch</strong> no-bleed interior, embedded Libre Baskerville fonts, mirrored gutters, page numbers, and right-hand chapter openings. The same Design template is used for EPUB and PDF, while print-specific line spacing and justification remain independent.</p>
            <p>When justification is on, expanded spaces are capped at 165% of natural word-space width. Lines requiring bigger gaps remain ragged-right; the last paragraph line is not stretched. This reduces conspicuous gaps but does not implement automatic hyphenation.</p>
            <p><strong>This is a feasibility proof, not a certified retailer-ready interior.</strong> Automatic hyphenation, inline illustrations, complex-script shaping, covers, and PDF/X are not supported. Inspect the final PDF and physical print proofs before submitting to a retailer.</p>
            <p>The local <strong>Print history</strong> stores recent build metadata and checksums, not the PDF files themselves.</p>
          </section>
          <section id="backup">
            <h2>Backup, original files and restore</h2>
            <p>Inside any book, choose <strong>↓ Download backup</strong>. This creates a portable <code>.book.zip</code> project archive containing the manuscript, metadata, design configuration, and the retained original import file where applicable.</p>
            <p>To restore, return to the bookshelf, choose <strong>Restore a project backup</strong>, and select your archive. Restoration makes a <strong>new local book</strong> with new book and chapter identifiers; the original project is not overwritten.</p>
            <p>For imported books, <strong>↓ Download original</strong> retrieves the file used at import time. An EPUB or PDF download is a publication artifact, <strong>not</strong> a full editable-project backup.</p>
            <p>Keep independent backup copies. The current archive limit is 20 MB compressed / 50 MB expanded, and export-history records are not included in project backups.</p>
          </section>
          <section id="offline">
            <h2>Offline operation, local storage and privacy</h2>
            <p>Book Formatter uses browser-local storage for projects. There is no mandatory account. The app registers an offline service worker and caches assets for use after its first successful online load. The header reports <strong>Offline app ready</strong> when preparation completes.</p>
            <p>For reliable offline use, open the application online at least once before disconnecting. If fonts or a rendering worker were not cached, reconnect once, reload, and retry the affected operation. Continue to use the same browser profile for locally saved projects.</p>
            <p>Local manuscript editing and supported exports do not require uploading manuscript content. Browser storage is <strong>not a permanent backup</strong>: clearing site data, changing profiles, or storage eviction can remove projects. Download project backups regularly.</p>
          </section>
          <section id="troubleshooting">
            <h2>Troubleshooting</h2>
            <dl>
              <dt>My book is missing from the bookshelf.</dt><dd>Confirm you are using the same browser profile and site origin. If site data was cleared, restore a saved <code>.book.zip</code> backup.</dd>
              <dt>Saving locally fails.</dt><dd>Read the error and check browser storage availability or quota. Download a backup before closing, if possible, and avoid further edits until the issue is resolved.</dd>
              <dt>The importer chose incorrect chapters.</dt><dd>In the import review, select Heading 1, Heading 2, or one section instead of Automatic; inspect and rename detected sections before saving.</dd>
              <dt>Import reports missing images or formatting.</dt><dd>The current importer supports a limited semantic set. Consult the import report and original file; images and complex Word layouts are not faithfully reproduced yet.</dd>
              <dt>EPUB export is blocked.</dt><dd>Use Publish → Before you export to fix missing metadata, invalid language tags, empty sections, and other errors. Warnings alone are not necessarily blockers.</dd>
              <dt>PDF looks too widely spaced.</dt><dd>In Print, turn <strong>Justify body text</strong> off for left alignment, or leave it on for capped spacing and occasional ragged-right lines. Rebuild the proof after changing the option.</dd>
              <dt>Offline export says fonts or worker files are unavailable.</dt><dd>Reconnect, open the application online to refresh cached assets, then retry offline. Do not clear site data without a backup.</dd>
              <dt>Export history shows Earlier snapshot.</dt><dd>The manuscript or settings changed since that export. Generate a new EPUB or PDF to incorporate the current revision.</dd>
              <dt>A proof viewer page cannot load.</dt><dd>You can still download the generated PDF. Open that file in a separate PDF reader to inspect it.</dd>
            </dl>
          </section>
          <section id="limitations">
            <h2>Current limitations and planned features</h2>
            <p>The documentation describes <strong>implemented controls</strong>, not every requirement in the product roadmap. At present, the app does not offer cloud synchronization, team collaboration, chapter drag-and-drop reordering, direct retailer submission, hardcover or cover-wrap design, rich image layout, full in-browser EPUBCheck, or additional print trim sizes. Some of these are specified in the product requirements document but are <strong>not yet available</strong>.</p>
            <p>The project remains a local-first publishing foundation. Maintain original manuscript files and backups, review conversion warnings, and validate export artifacts before commercial publication.</p>
          </section>
          <footer className="help-footer"><Link href="/">Return to your bookshelf</Link><span>Book Formatter user guide · Current foundation</span></footer>
        </div>
      </div>
    </main>
  );
}
