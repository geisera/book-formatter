import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Book Formatter — Your words, beautifully bound", description: "A private, local-first manuscript workspace.", manifest: "/manifest.webmanifest" };
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="en"><body>{children}</body></html>}
