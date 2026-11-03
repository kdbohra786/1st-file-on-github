import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Infinitive Cloud Bucket",
  description: "Limitless Solution for Cloud and Web Hosting",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
