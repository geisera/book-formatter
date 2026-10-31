"use client";
import { presetFor, type EditionTemplate, type EbookEdition } from "../lib/edition";
import type {Book} from "../lib/model";
import {PRINT_TRIMS,type PrintTrim,type PrintEdition} from "../lib/print-profile";
import CoverEditor from "./CoverEditor";
export default function DesignPanel({
  edition,
  cover,
  onCoverChange,
  onChange,
  hidden,
  format,
  printProfile,
  onPrintTrim,
  onPrintAlignment,
  onPrintTypography,
}: {
  edition: EbookEdition;
  cover: Book["cover"];
  onCoverChange: (cover:Book["cover"])=>void;
  onChange: (edition: EbookEdition) => void;
  hidden: boolean;
  format: "ebook" | "print";
  printProfile: PrintEdition;
  onPrintTrim: (trim:PrintTrim)=>void;
  onPrintAlignment: (align:"left"|"justify")=>void;
  onPrintTypography: (changes: Partial<Pick<PrintEdition,"fontSize"|"leading"|"paragraphSpacing"|"firstLineIndent"|"chapterOpeningSpace">>)=>void;
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
      aria-label="Book design settings"
      hidden={hidden}
    >
      <div className="eyebrow">BOOK DESIGN</div>
      <h2>Appearance</h2>
      <p className="design-intro">Choose a style and refine the {format==="ebook"?"ebook":"paperback"} edition. Your manuscript stays unchanged.</p>
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
      {format==="print"?<div className="design-print-settings">
        <fieldset><legend>Paperback layout</legend>
          <label>Trim size
            <select aria-label="Design paperback trim" value={printProfile.trim} onChange={e=>onPrintTrim(e.target.value as PrintTrim)}>
              {(Object.keys(PRINT_TRIMS) as PrintTrim[]).map(t=><option key={t} value={t}>{PRINT_TRIMS[t].label} inches</option>)}
            </select>
          </label>
          <label>Paragraph alignment
            <select aria-label="Design paperback alignment" value={printProfile.alignment??"left"} onChange={e=>onPrintAlignment(e.target.value as "left"|"justify")}>
              <option value="left">Left-aligned</option><option value="justify">Justified</option>
            </select>
          </label>
        </fieldset>
        <fieldset><legend>Paperback typography</legend>
          <p className="control-note">Libre Baskerville is embedded in the PDF. These adjustments affect paperback only.</p>
          <label>Body font size <span className="control-value">{printProfile.fontSize.toFixed(1)} pt</span>
            <input aria-label="Paperback body font size" type="range" min="9" max="14" step="0.5"
              value={printProfile.fontSize} onChange={e=>{
                const fontSize=Number(e.target.value);
                const leading=Math.max(fontSize*1.15,Math.min(fontSize*2,printProfile.leading));
                onPrintTypography({fontSize,leading:Math.round(leading*10)/10});
              }}/>
          </label>
          <label>Line spacing <span className="control-value">{printProfile.leading.toFixed(1)} pt</span>
            <input aria-label="Paperback line spacing" type="range"
              min={(printProfile.fontSize*1.15).toFixed(1)} max={(printProfile.fontSize*2).toFixed(1)} step="0.1"
              value={printProfile.leading} onChange={e=>onPrintTypography({leading:Number(e.target.value)})}/>
          </label>
          <label>Paragraph spacing <span className="control-value">{printProfile.paragraphSpacing??0} pt</span>
            <input aria-label="Paperback paragraph spacing" type="range" min="0" max="24" step="1"
              value={printProfile.paragraphSpacing??0} onChange={e=>onPrintTypography({paragraphSpacing:Number(e.target.value)})}/>
          </label>
          <label>First-line indent <span className="control-value">{printProfile.firstLineIndent??14} pt</span>
            <input aria-label="Paperback first-line indent" type="range" min="0" max="36" step="1"
              value={printProfile.firstLineIndent??14} onChange={e=>onPrintTypography({firstLineIndent:Number(e.target.value)})}/>
          </label>
          <label>Chapter opening space <span className="control-value">{printProfile.chapterOpeningSpace??0} pt</span>
            <input aria-label="Paperback chapter opening space" type="range" min="0" max="120" step="5"
              value={printProfile.chapterOpeningSpace??0} onChange={e=>onPrintTypography({chapterOpeningSpace:Number(e.target.value)})}/>
          </label>
        </fieldset>
        <p className="control-note">For section-specific page starts, headers, folios and spacing, use Structure. These settings appear in the paperback preview.</p>
      </div>:null}
      <div className={format==="print"?"design-ebook-controls-inactive":"design-ebook-controls"}>
      {format==="print"?<p className="control-note">The controls below affect ebook typography only. Switch to Ebook to edit them.</p>:null}
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
      </div>
      <button
        className="reset-design"
        onClick={() => onChange(presetFor(edition.template.id))}
      >
        Reset selected template settings
      </button>
      <p className="control-note">Settings save locally. Preview updates automatically; final exports remain in Publish and Print.</p>
    </section>
  );
}
