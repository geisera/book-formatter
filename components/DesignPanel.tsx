"use client";
import { presetFor, type EditionTemplate, type EbookEdition } from "../lib/edition";
export default function DesignPanel({
  edition,
  onChange,
  hidden,
}: {
  edition: EbookEdition;
  onChange: (edition: EbookEdition) => void;
  hidden: boolean;
}) {
  function change<K extends keyof EbookEdition>(
    key: K,
    value: EbookEdition[K],
  ) {
    onChange({ ...edition, [key]: value });
  }
  return (
    <section
      className="design-panel"
      aria-label="Ebook design settings"
      hidden={hidden}
    >
      <div className="eyebrow">BOOK DESIGN · EPUB + PDF</div>
      <h2>Make it yours.</h2>
      <p className="design-intro">
        Choose one template for ebook and print. The typography controls below
        customize the ebook edition; print uses its own page geometry and justification.
        Your manuscript is unchanged.
      </p>
      <div className="template-options" role="group" aria-label="Book design template">
        {(["classic", "modern", "gothic"] as EditionTemplate[]).map((id) => (
          <button type="button" key={id}
            className={edition.template.id === id ? "template-card active" : "template-card"}
            aria-pressed={edition.template.id === id}
            onClick={() => onChange(presetFor(id))}>
            <span className="template-letter">Aa</span>
            <span><strong>{id[0].toUpperCase() + id.slice(1)}</strong>
              <small>{id === "classic" ? "Traditional literary serif" : id === "modern" ? "Contemporary and restrained" : "Ornamental fantasy and horror"} · Version 1</small>
            </span>
            {edition.template.id === id ? <span className="template-check" aria-label="Selected">✓</span> : null}
          </button>
        ))}
      </div>
      <fieldset>
        <legend>Typography</legend>
        <label>
          Body font
          <select
            aria-label="Body font"
            value={edition.bodyFont}
            onChange={(e) =>
              change("bodyFont", e.target.value as EbookEdition["bodyFont"])
            }
          >
            <option value="baskerville">Libre Baskerville · included</option>
            <option value="georgia">Georgia · system font</option>
          </select>
        </label>
        <label>
          Body size <span className="control-value">{edition.fontSize} px</span>
          <input
            aria-label="Body size"
            type="range"
            min="14"
            max="24"
            step="1"
            value={edition.fontSize}
            onChange={(e) => change("fontSize", Number(e.target.value))}
          />
        </label>
        <label>
          Line spacing{" "}
          <span className="control-value">{edition.lineHeight.toFixed(2)}</span>
          <input
            aria-label="Line spacing"
            type="range"
            min="1.2"
            max="2.2"
            step="0.05"
            value={edition.lineHeight}
            onChange={(e) => change("lineHeight", Number(e.target.value))}
          />
        </label>
      </fieldset>
      <fieldset>
        <legend>Paragraphs</legend>
        <label>
          First-line indent{" "}
          <span className="control-value">
            {edition.paragraphIndent.toFixed(1)} em
          </span>
          <input
            aria-label="First-line indent"
            type="range"
            min="0"
            max="3"
            step="0.1"
            value={edition.paragraphIndent}
            onChange={(e) => change("paragraphIndent", Number(e.target.value))}
          />
        </label>
        <label>
          Paragraph spacing{" "}
          <span className="control-value">
            {edition.paragraphSpacing.toFixed(1)} em
          </span>
          <input
            aria-label="Paragraph spacing"
            type="range"
            min="0"
            max="1.5"
            step="0.1"
            value={edition.paragraphSpacing}
            onChange={(e) => change("paragraphSpacing", Number(e.target.value))}
          />
        </label>
        <p className="control-note">
          Opening paragraphs and paragraphs after a scene break have no indent.
        </p>
      </fieldset>
      <fieldset>
        <legend>Chapter details</legend>
        <label>
          Chapter heading
          <select
            aria-label="Chapter heading"
            value={edition.headingStyle}
            onChange={(e) =>
              change(
                "headingStyle",
                e.target.value as EbookEdition["headingStyle"],
              )
            }
          >
            <option value="centered">Centered</option>
            <option value="left">Left aligned</option>
          </select>
        </label>
        <label>
          Chapter opening space{" "}
          <span className="control-value">
            {edition.chapterSpacing.toFixed(1)} em
          </span>
          <input
            aria-label="Chapter opening space"
            type="range"
            min="1"
            max="5"
            step="0.5"
            value={edition.chapterSpacing}
            onChange={(e) => change("chapterSpacing", Number(e.target.value))}
          />
        </label>
        <label>
          Scene ornament
          <select
            aria-label="Scene ornament"
            value={edition.sceneOrnament}
            onChange={(e) =>
              change(
                "sceneOrnament",
                e.target.value as EbookEdition["sceneOrnament"],
              )
            }
          >
            <option value="asterisks">* * *</option>
            <option value="diamonds">◆ ◆ ◆</option>
            <option value="rule">Fine rule</option>
          </select>
        </label>
      </fieldset>
      <button
        className="reset-design"
        onClick={() => onChange(presetFor(edition.template.id))}
      >
        Reset selected template settings
      </button>
      <p className="control-note">
        The selected template applies to both EPUB and PDF. Ebook typography
        settings save locally with the book; PDF-specific settings remain
        independent. Reading apps may override ebook fonts.
      </p>
    </section>
  );
}
