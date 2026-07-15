import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Curadoria Editorial",
  description: "Consulta e curadoria manual do acervo para montagem de capítulos.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
        <header className="border-b border-gray-200 dark:border-gray-800">
          <div className="mx-auto flex max-w-6xl items-center gap-4 px-6 py-3">
            <Link href="/" className="font-semibold">
              Curadoria Editorial
            </Link>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Plataforma Editorial Filosófica
            </span>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
