# EPUB export validation

Renderer: `epub-1.0.0`; target EPUB 3.3; Classic template v1.

## Executed checks

Official EPUBCheck 5.4.0 release archive SHA-256:
`33350c61038e71dfb3d45a76aed04bf5481e6d5500cb780f6e98db8bbd15a28c`.
The downloaded archive was verified against the digest returned by the official
GitHub release API, then run with Java 17.

The initial local run returned **0 fatals, 0 errors, 0 warnings, 0 infos** for:

- `asterisks.epub`: escaped metadata/XHTML, Unicode, emphasis, embedded WOFF fonts.
- `diamonds.epub`: diamond scene ornaments and licensed font assets.
- `rule.epub`: rule ornaments and a system-serif edition without font binaries.
- `novel.epub`: a synthetic 80,000-word novel across 40 chapters.

The fixture generator and exact invocation live in `scripts/epub-fixtures.ts`
and `scripts/check-epub.mjs`. CI also validates `browser-export.epub`, produced
by the browser acceptance test entirely offline after local Markdown import
and Classic design changes. CI keeps the generated EPUBs and JSON reports as
`epub-validation-proofs`; consult that run for its actual result.

Unit tests verify ZIP entry order/compression, semantic escaping, navigation,
font/license inclusion, immutable inputs, reproducible bytes for fixed inputs
and build timestamp, missing metadata/content, and error cases. Browser tests
exercise saved snapshots, metadata correction, offline export, history reload,
and stale-snapshot detection after editing.

## Limits

These are tests of the renderer and fixtures, not automatic EPUBCheck approval
of every author export. The app runs narrower metadata/package checks and labels
all browser exports **EPUBCheck not run**. No remote validation or manuscript
upload is performed. Run EPUBCheck on the exact downloaded file and proof it in
the intended reading systems before distribution. Cross-reader visual proofing,
cover/image support, accessibility certification and retailer acceptance remain
outside this completed export slice. PDF production is still outstanding.

## Primary specifications and tool references

- EPUB 3.3: https://www.w3.org/TR/epub-33/
- Official EPUBCheck release: https://github.com/w3c/epubcheck/releases/tag/v5.4.0
- Running EPUBCheck: https://www.w3.org/publishing/epubcheck/docs/running/
