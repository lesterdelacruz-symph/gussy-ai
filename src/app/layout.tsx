import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gussy Moodboard Studio",
  description: "Interior design moodboards, realistic renders, and walkthrough videos"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
