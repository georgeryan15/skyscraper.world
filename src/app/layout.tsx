import type { Metadata } from "next";
import { Archivo } from "next/font/google";
import "mapbox-gl/dist/mapbox-gl.css";
import "./globals.css";

// The width axis lets building names set tall and narrow, like the towers.
const archivo = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-archivo" });

export const metadata: Metadata = {
  title: "Skyscraper",
  description: "Explore the world's tallest buildings, their stories, and their skylines in 3D.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" dir="ltr" className={archivo.variable}>
      <body className="min-h-screen bg-background font-sans text-foreground">
        {children}
      </body>
    </html>
  );
}
