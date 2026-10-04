import type { Metadata } from "next";
import { ThemeToggle } from "@/components/fairdrop/ThemeToggle";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fair Drop | One fair entry",
  description: "A limited-seat ticket sale demo with one entry per account and a transparent waiting room.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: "try{document.documentElement.dataset.theme=localStorage.getItem('fairdrop-theme')==='dark'?'dark':'light'}catch{document.documentElement.dataset.theme='light'}" }} /></head><body>{children}<ThemeToggle /></body></html>;
}
