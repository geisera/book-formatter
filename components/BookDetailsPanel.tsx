"use client";
import {useEffect,useState} from "react";
import type {Book} from "../lib/model";
import {validLanguage} from "../lib/epub";
import CoverEditor from "./CoverEditor";
import {PUBLICATION_LIMITS, validIsbn13, validPublicationDate, validatePublicationMetadata, type PublicationMetadata} from "../lib/publication-metadata";
const COMMON_LANGUAGES = [
 ["en","English"],["en-US","English (United States)"],["en-GB","English (United Kingdom)"],
 ["es","Spanish"],["fr","French"],["de","German"],["it","Italian"],
 ["pt","Portuguese"],["pt-BR","Portuguese (Brazil)"],["nl","Dutch"],
 ["sv","Swedish"],["da","Danish"],["no","Norwegian"],["fi","Finnish"],
 ["pl","Polish"],["cs","Czech"],["el","Greek"],["tr","Turkish"],
 ["ru","Russian"],["uk","Ukrainian"],["ar","Arabic"],["he","Hebrew"],
 ["hi","Hindi"],["bn","Bengali"],["zh-Hans","Chinese (Simplified)"],
 ["zh-Hant","Chinese (Traditional)"],["ja","Japanese"],["ko","Korean"],
] as const;
const commonTags = new Set<string>(COMMON_LANGUAGES.map(([tag])=>tag));
type Details = {title:string;author:string;language:string;metadata:PublicationMetadata};
export default function BookDetailsPanel({book,onSave,onCoverChange}:{book:Book;onSave:(details:Details)=>Promise<void>;onCoverChange:(cover:Book["cover"])=>void}){
 const [form,setForm]=useState<Details>({title:book.title,author:book.author,language:book.language??"en",metadata:book.metadata??{}});
 const [busy,setBusy]=useState(false);
 const [customLanguage,setCustomLanguage]=useState(!commonTags.has(book.language??"en"));
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 useEffect(()=>{setForm({title:book.title,author:book.author,language:book.language??"en",metadata:book.metadata??{}});setCustomLanguage(!commonTags.has(book.language??"en"));setError("");setNotice("");},[book.id]);
 function field(key:keyof PublicationMetadata,value:string){
  setNotice("");
  setForm(current=>({...current,metadata:{...current.metadata,[key]:value}}));
 }
 async function save(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();setError("");setNotice("");
  try{
   const metadata=Object.fromEntries(Object.entries(form.metadata).map(([k,v])=>[k,v.trim()]).filter(([,v])=>v)) as PublicationMetadata;
   validatePublicationMetadata(metadata);
   if(!form.title.trim()||!form.author.trim())throw Error("Publication title and author are required.");
   if(!validLanguage(form.language))throw Error("Enter a valid language tag, such as en-US or fr.");
   setBusy(true);
   await onSave({title:form.title.trim(),author:form.author.trim(),language:form.language.trim(),metadata});
   setNotice("Book details saved locally.");
  }catch(e){setError(e instanceof Error?e.message:"Could not save book details.");}
  finally{setBusy(false);}
 }
 return <section className="book-details-panel" aria-label="Book details editor">
  <div className="eyebrow">PUBLISHING METADATA</div>
  <h2>Book details</h2>
  <p className="control-note">These details are saved with your project and exported as publication metadata. They do not rewrite your title page or manuscript chapters.</p>
  <details className="design-cover-section" open><summary>Cover artwork</summary><CoverEditor cover={book.cover} onChange={onCoverChange}/></details>
  <form onSubmit={e=>void save(e)}>
   <div className="book-details-fields">
    <label>Publication title<input aria-label="Publication title" aria-invalid={!form.title.trim()} required maxLength={200} value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/>{!form.title.trim()?<small className="field-error">A publication title is required.</small>:null}</label>
    <label>Author<input aria-label="Author" aria-invalid={!form.author.trim()} required maxLength={200} value={form.author} onChange={e=>setForm({...form,author:e.target.value})}/>{!form.author.trim()?<small className="field-error">An author name is required.</small>:null}</label>
    <label>Subtitle<input maxLength={PUBLICATION_LIMITS.subtitle} value={form.metadata.subtitle??""} onChange={e=>field("subtitle",e.target.value)}/></label>
    <label>Language
      <select aria-label="Book language" value={customLanguage?"custom":form.language} onChange={e=>{
        if(e.target.value==="custom"){setCustomLanguage(true);return;}
        setCustomLanguage(false);setForm(current=>({...current,language:e.target.value}));
      }}>
        {COMMON_LANGUAGES.map(([tag,name])=><option key={tag} value={tag}>{name} ({tag})</option>)}
        <option value="custom">Other / custom BCP-47 tag…</option>
      </select>
      {customLanguage?<input aria-label="Custom language tag" aria-invalid={!validLanguage(form.language)} required maxLength={35} value={form.language} placeholder="e.g. en-CA" onChange={e=>setForm(current=>({...current,language:e.target.value}))}/>:null}
      <small className="control-note">Used in EPUB and PDF metadata. Choose Other for a language or regional variant not listed.</small>
      {!validLanguage(form.language)?<small className="field-error">Enter a valid BCP-47 language tag, such as en or en-US.</small>:null}
    </label>
    <label>Series name<input maxLength={PUBLICATION_LIMITS.seriesName} value={form.metadata.seriesName??""} onChange={e=>field("seriesName",e.target.value)}/></label>
    <label>Series number<input maxLength={PUBLICATION_LIMITS.seriesNumber} inputMode="decimal" placeholder="1 or 1.5" value={form.metadata.seriesNumber??""} onChange={e=>field("seriesNumber",e.target.value)}/></label>
    <label>Publisher / imprint<input maxLength={PUBLICATION_LIMITS.publisher} value={form.metadata.publisher??""} onChange={e=>field("publisher",e.target.value)}/></label>
    <label>ISBN-13<input maxLength={PUBLICATION_LIMITS.isbn} value={form.metadata.isbn??""} placeholder="978-0-306-40615-7" aria-invalid={Boolean(form.metadata.isbn&&!validIsbn13(form.metadata.isbn))} onChange={e=>field("isbn",e.target.value)}/></label>
    <label>Publication date<input type="date" value={form.metadata.publicationDate??""} aria-invalid={Boolean(form.metadata.publicationDate&&!validPublicationDate(form.metadata.publicationDate))} onChange={e=>field("publicationDate",e.target.value)}/></label>
    <label className="book-details-wide">Description<textarea rows={6} maxLength={PUBLICATION_LIMITS.description} value={form.metadata.description??""} onChange={e=>field("description",e.target.value)}/></label>
   </div>
   <p className="control-note">ISBN and publication date are optional. ISBN-13 check digits and calendar dates are verified when saved.</p>
   {error?<p role="alert" className="alert">{error}</p>:null}
   {notice?<p role="status" className="publish-notice">{notice}</p>:null}
   <button type="submit" className="primary" disabled={busy}>{busy?"Saving…":"Save book details"}</button>
  </form>
 </section>;
}
