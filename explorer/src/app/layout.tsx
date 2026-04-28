import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://scan.wintg.network"),
  title: {
    default: "WINTG Scan — official block explorer",
    template: "%s · WINTG Scan",
  },
  description:
    "Browse blocks, transactions, validators and contracts on the WINTG L1 chain. Mainnet (2280) and testnet (22800).",
  applicationName: "WINTG Scan",
  authors: [{ name: "WINTG Group" }],
  keywords: ["WINTG", "WTG", "blockchain", "explorer", "africa", "uemoa", "evm", "besu"],
  openGraph: {
    title: "WINTG Scan",
    description: "Official WINTG block explorer.",
    url: "https://scan.wintg.network",
    siteName: "WINTG Scan",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "WINTG Scan",
    description: "Official WINTG block explorer.",
  },
  icons: {
    icon: "/favicon.ico",
  },
};

export const viewport: Viewport = {
  themeColor: "#FF6A1A",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
