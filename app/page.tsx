import Link from "next/link";
import {cookies} from "next/headers";

export default async function HomePage(){
 const token=(await cookies()).get("bf_access")?.value;
 let signedIn=false;
 if(token&&process.env.NEXT_PUBLIC_SUPABASE_URL&&process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY){
  try{
   const response=await fetch(process.env.NEXT_PUBLIC_SUPABASE_URL+"/auth/v1/user",{headers:{apikey:process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,Authorization:"Bearer "+token},cache:"no-store",signal:AbortSignal.timeout(6000)});
   signedIn=response.ok;
  }catch{signedIn=false;}
 }
 const cta=signedIn?"/workspace/":"/auth/?mode=sign-up";
 const ctaLabel=signedIn?"Open your workspace":"Start creating";
 return <main className="landing bs-landing">
  <header className="landing-header bs-header">
   <Link className="landing-brand" href="/" aria-label="BookStitcher home"><span className="bs-logo-mark" aria-hidden="true">✳</span> BookStitcher</Link>
   <nav aria-label="Main navigation"><a href="#features">Features</a><a href="#how-it-works">How it works</a><a href="#local-first">Why local-first</a>{!signedIn&&<Link href="/auth/">Sign in</Link>}<Link className="landing-nav-cta" href={cta}>{signedIn?"Workspace":"Get started"} <span aria-hidden="true">↗</span></Link></nav>
  </header>

  <section className="bs-hero" aria-labelledby="bs-title">
   <div className="bs-hero-copy"><p className="bs-kicker"><span aria-hidden="true">✦</span> THE BOOKMAKING STUDIO FOR INDEPENDENT AUTHORS</p><h1 id="bs-title">You wrote the story.<br/><em>Make it a book.</em></h1><p className="bs-lede">Turn your manuscript into a beautifully designed ebook or paperback. Thoughtful tools for every page, from first chapter to final export.</p><div className="bs-actions"><Link className="landing-primary" href={cta}>{ctaLabel} <span aria-hidden="true">↗</span></Link><a className="bs-outline-link" href="#how-it-works">See how it works <span aria-hidden="true">↓</span></a></div><p className="bs-privacy-line"><span aria-hidden="true">◈</span> Browser-based. Local-first. Your manuscript stays yours.</p></div>
   <div className="bs-product-art" aria-label="Illustration of a formatted book beside an ebook reader" role="img">
    <div className="bs-art-caption">FROM MANUSCRIPT <span>→</span> FINISHED BOOK</div>
    <div className="bs-book"><div className="bs-book-cover"><span className="bs-cover-rule"/><span className="bs-cover-author">A NOVEL BY A. MORGAN</span><span className="bs-cover-title">THE<br/>QUIET<br/>HORIZON</span><span className="bs-cover-ornament">✳</span><span className="bs-cover-bottom">A STORY OF DISTANT PLACES</span></div></div>
    <div className="bs-reader"><div className="bs-reader-screen"><span className="bs-reader-chapter">CHAPTER ONE</span><strong>Beyond the Water</strong><p>The morning light had found its way through the curtains before she gathered the courage to open the letter.</p><p>Outside, the harbor stirred. Somewhere beyond the distant shore, a new life was waiting to be written.</p><span className="bs-reader-page">1</span></div></div>
    <span className="bs-art-stamp">MADE WITH<br/><strong>BookStitcher</strong></span>
   </div>
  </section>

  <div className="bs-trust-strip"><span>ONE MANUSCRIPT</span><span aria-hidden="true">✳</span><span>BEAUTIFUL EBOOKS</span><span aria-hidden="true">✳</span><span>PRINT-READY PAGES</span><span aria-hidden="true">✳</span><span>YOUR FILES, YOUR CONTROL</span></div>

  <section className="bs-section bs-intro" id="features"><p className="bs-section-kicker">CRAFTED FOR THE FINISHING TOUCHES</p><h2>Everything your book needs.<br/><em>Nothing it doesn’t.</em></h2><p>From the structure of your chapters to the feel of the page, BookStitcher brings the essential steps of book production into one focused workspace.</p></section>

  <section className="bs-feature-grid" aria-label="Book design features">
   <article className="bs-feature-card"><div className="bs-feature-illustration bs-ebook-illus"><div className="bs-mini-reader"><small>CHAPTER THREE</small><strong>A New Beginning</strong><i/><i/><i/><i className="short"/></div><div className="bs-mini-phone"><small>CHAPTER THREE</small><i/><i/><i/></div></div><div className="bs-feature-content"><span>01 / EBOOKS</span><h3>Beautiful on every page.</h3><p>Design flowing EPUB editions with chapter styles, front and back matter, and an ebook preview that lets you review the reading experience.</p></div></article>
   <article className="bs-feature-card"><div className="bs-feature-illustration bs-print-illus"><div className="bs-paper-page"><small>17</small><strong>CHAPTER FOUR</strong><i/><i/><i/><i/><i className="short"/></div><div className="bs-paper-page second"><small>18</small><strong>THE LONG ROAD</strong><i/><i/><i/><i className="short"/></div></div><div className="bs-feature-content"><span>02 / PRINT</span><h3>Made for the bookshelf.</h3><p>Set up paperback trim and page layout, review a print preview, then generate a PDF edition ready for your next production step.</p></div></article>
   <article className="bs-feature-card"><div className="bs-feature-illustration bs-style-illus"><div className="bs-style-sample style-one">A<span>✦</span></div><div className="bs-style-sample style-two">A<span>❧</span></div><div className="bs-style-sample style-three">A<span>◆</span></div></div><div className="bs-feature-content"><span>03 / STYLE</span><h3>Every detail has a voice.</h3><p>Explore book styles, scene ornaments, chapter treatments, and edition settings that complement your writing rather than distract from it.</p></div></article>
  </section>

  <section className="bs-workflow" id="how-it-works"><div className="bs-workflow-inner"><div><p className="bs-section-kicker">SIMPLE FROM START TO FINISH</p><h2>A better way to go<br/><em>from draft to done.</em></h2><p className="bs-workflow-description">A clear, approachable process lets you focus on the book you want to make—not on complicated production software.</p><Link className="landing-primary" href={cta}>{ctaLabel} <span aria-hidden="true">↗</span></Link></div><ol className="bs-steps"><li><span>01</span><div><h3>Bring your manuscript</h3><p>Import a DOCX, Markdown, or text file and organize your chapters and book sections.</p></div></li><li><span>02</span><div><h3>Shape your design</h3><p>Choose layouts, refine typography, and customize the details that make your edition yours.</p></div></li><li><span>03</span><div><h3>Preview the pages</h3><p>Check your ebook and paperback presentation before producing your files.</p></div></li><li><span>04</span><div><h3>Export your book</h3><p>Create EPUB and print PDF editions in your browser, with project backups you can keep.</p></div></li></ol></div></section>

  <section className="bs-local" id="local-first"><div className="bs-local-symbol" aria-hidden="true">✳</div><p className="bs-section-kicker">YOUR WORK BELONGS TO YOU</p><h2>A beautiful book.<br/><em>On your terms.</em></h2><p>BookStitcher is built local-first. Your manuscripts live in your browser rather than being uploaded to a server by default. Edit and export on your device, and download portable project backups for safekeeping.</p><a href="#how-it-works">Explore the workflow <span aria-hidden="true">↑</span></a></section>

  <section className="bs-bottom-cta"><p className="bs-section-kicker">YOUR NEXT CHAPTER STARTS HERE</p><h2>Ready to make<br/><em>something beautiful?</em></h2><Link className="landing-primary" href={cta}>{ctaLabel} <span aria-hidden="true">↗</span></Link><p>Sign in is required to access the workspace. Project storage stays local to your browser.</p></section>
  <footer className="landing-footer bs-footer"><Link className="landing-brand" href="/">✳ BookStitcher</Link><span>Your words. Beautifully bound.</span><span>© {new Date().getFullYear()} BookStitcher</span></footer>
 </main>;
}
