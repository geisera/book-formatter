"use client";
import {useEffect,useState} from "react";
import type {Book} from "../lib/model";
import {validLanguage} from "../lib/epub";
import CoverEditor from "./CoverEditor";
import {PUBLICATION_LIMITS, validIsbn13, validPublicationDate, validatePublicationMetadata, type PublicationMetadata} from "../lib/publication-metadata";
type Details = {title:string;author:string;language:string;metadata:PublicationMetadata};
export default function BookDetailsPanel({book,onSave,onCoverChange}:{book:Book;onSave:(details:Details)=>Promise<void>;onCoverChange:(cover:Book["cover"])=>void}){
 const [form,setForm]=useState<Details>({title:book.title,author:book.author,language:book.language??"en",metadata:book.metadata??{}});
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 useEffect(()=>{setForm({title:book.title,author:book.author,language:book.language??"en",metadata:book.metadata??{}});setError("");setNotice("");},[book.id]);
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
    <label>Language tag<input aria-label="Language tag" aria-invalid={!validLanguage(form.language)} required maxLength={35} value={form.language} placeholder="en-US" onChange={e=>setForm({...form,language:e.target.value})}/>{!validLanguage(form.language)?<small className="field-error">Enter a valid BCP-47 language tag, such as en or en-US.</small>:null}</label>
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
