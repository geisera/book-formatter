import Link from "next/link";
export default function HomePage(){
 return <main className="landing">
   <header className="landing-header"><Link className="landing-brand" href="/">▤ Book Formatter</Link><nav aria-label="Main navigation"><Link href="/auth/">Sign in</Link><Link className="landing-nav-cta" href="/auth/?mode=sign-up">Create account</Link></nav></header>
   <section className="landing-hero"><span className="landing-eyebrow">A LOCAL-FIRST BOOK STUDIO</span><h1>Your words.<br/><em>Beautifully bound.</em></h1><p>From manuscript to professionally formatted EPUB and print PDF. Write, organize, design, preview, and publish — while keeping your manuscript on your device.</p><div className="landing-actions"><Link className="landing-primary" href="/auth/?mode=sign-up">Get started</Link><Link className="landing-secondary" href="/auth/">Sign in to your workspace</Link></div><p className="landing-note">An account is required to open the author workspace. Your books are stored locally in this browser.</p></section>
   <section className="landing-features" aria-label="Features"><article><h2>Import & organize</h2><p>Bring in your manuscript and arrange chapters, front matter, and back matter.</p></article><article><h2>Design with confidence</h2><p>Choose polished ebook and paperback styles and preview your editions.</p></article><article><h2>Export locally</h2><p>Generate EPUB and print PDF files on your device, with built-in EPUB validation.</p></article></section>
   <footer className="landing-footer">Book Formatter · Your manuscript stays yours.</footer>
 </main>;
}
