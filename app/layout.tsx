import type { Metadata, Viewport } from "next";
import "@fontsource/darker-grotesque/700.css";
import "@fontsource/darker-grotesque/800.css";
import "@fontsource/figtree/400.css";
import "@fontsource/figtree/500.css";
import "@fontsource/figtree/600.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Expo launcher",
  description: "Open Axiom and Tecleef demos, already logged in.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#0c4881" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
