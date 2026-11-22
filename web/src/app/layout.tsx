import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "QuickPrint UAE — print-on-demand platform for UAE print shops", template: "%s · QuickPrint" },
  description: "Launch an online print shop in minutes: documents, photos, business cards, flyers, with Stripe/Mamo Pay and scheduled delivery across the UAE.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
