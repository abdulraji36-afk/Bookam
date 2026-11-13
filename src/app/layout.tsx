import type { Metadata, Viewport } from "next";
import "@fontsource-variable/archivo";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Bookam", template: "%s · Bookam" },
  description: "Orders, dispatch and returns tracking for depots, shops and warehouses."
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Lets the bottom tab bar sit clear of the home indicator on notched phones.
  viewportFit: "cover",
  themeColor: "#0b1f33"
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
