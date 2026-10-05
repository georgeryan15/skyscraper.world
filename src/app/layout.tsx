import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Skyscraper",
  description: "Skyscraper app",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" dir="ltr">
      <body className="min-h-screen bg-background font-sans text-foreground">
        {children}
      </body>
    </html>
  );
}
